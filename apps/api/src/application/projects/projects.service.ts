import { Injectable } from '@nestjs/common';
import type { CompilerEngine, Prisma, ProjectRole as DbRole } from '@prisma/client';
import { PROJECTS } from '../../domain/constants';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';
import { allowedActions, decide, type ProjectAction } from '../../domain/project-policy';
import { templateFiles, type TemplateId } from '../../domain/templates';
import { Email, ProjectName, SafeFilePath, asProjectId, asUserId, type InvitableRole, type ProjectId, type ProjectRole } from '../../domain/values';
import { EncryptedFileStore } from '../files/file-store';
import { Databases, type AppTx } from '../../infrastructure/db/databases';
import { Mailer } from '../../infrastructure/mail/mailer';
import { loadEnv } from '../../config/env';
import { AuditLog } from '../audit/audit-log';
import type { Actor, RequestMeta } from '../request-meta';

export type ProjectFilter = 'all' | 'owned' | 'shared' | 'archived' | 'trash';
export type ProjectSort = 'name' | '-name' | 'lastActivity' | '-lastActivity';

export interface ProjectQuery {
  readonly filter: ProjectFilter;
  readonly q?: string;
  readonly tagId?: string;
  readonly sort: ProjectSort;
}

export interface ProjectPatch {
  readonly name?: string;
  readonly compiler?: CompilerEngine;
  readonly mainFile?: string;
}

const PROJECT_SELECT = {
  id: true, name: true, compiler: true, mainFile: true, confidential: true, archivedAt: true, trashedAt: true,
  lastActivityAt: true, createdAt: true, ownerId: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
  members: {
    where: { revokedAt: null },
    select: { userId: true, role: true, user: { select: { firstName: true, lastName: true, primaryEmail: true } } },
    orderBy: { createdAt: 'asc' },
  },
  tags: { select: { tagId: true } },
} satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

/**
 * Casos de uso de proyectos (CU-10 … CU-18). Orden obligatorio en cada uno
 * (AGENTS.md §4.2): cargar → autorizar → reglas → persistir → auditar.
 *
 * Doble barrera: la política de dominio decide y RLS lo vuelve a imponer en
 * PostgreSQL. Un proyecto ajeno no «existe» para quien no es miembro: 404.
 */
@Injectable()
export class ProjectsService {
  private readonly origin = loadEnv().APP_ORIGIN;

  constructor(
    private readonly db: Databases,
    private readonly audit: AuditLog,
    private readonly mailer: Mailer,
    private readonly store: EncryptedFileStore,
  ) {}

  async list(actor: Actor, query: ProjectQuery) {
    const me = asUserId(actor.userId);
    return this.db.asUser(me, async (tx) => {
      const rows = await tx.project.findMany({
        where: this.filterWhere(actor.userId, query),
        select: PROJECT_SELECT,
        orderBy: query.sort.endsWith('name') ? { name: query.sort.startsWith('-') ? 'desc' : 'asc' } : { lastActivityAt: query.sort.startsWith('-') ? 'desc' : 'asc' },
        take: 200,
      });
      const counts = await this.counts(tx, actor.userId);
      return { items: rows.filter((r) => this.roleOf(r, actor.userId) !== null).map((r) => this.toDto(r, actor.userId)), counts };
    });
  }

  async get(actor: Actor, rawId: string) {
    const { row } = await this.load(actor, rawId, 'view');
    return this.toDto(row, actor.userId);
  }

  /**
   * Crea el proyecto, su clave (KEK envuelta) y los archivos de la plantilla,
   * cifrados, en UNA transacción: nunca queda un proyecto sin clave.
   */
  async create(actor: Actor, rawName: string, compiler: CompilerEngine | undefined, template: TemplateId, meta: RequestMeta) {
    if (!actor.emailVerified) throw new ForbiddenError('email_not_verified', 'Verifica tu correo para crear proyectos.');
    const name = ProjectName.of(rawName);
    const project = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      const me = await tx.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { firstName: true, lastName: true } });
      const files = templateFiles(template, name.toString(), `${me.firstName} ${me.lastName}`.trim());
      const created = await tx.project.create({ data: { ownerId: actor.userId, name: name.toString(), compiler: compiler ?? (template === 'presentacion' ? 'xelatex' : 'pdflatex') }, select: { id: true } });
      await tx.projectMember.create({ data: { projectId: created.id, userId: actor.userId, role: 'owner' } });
      await this.store.createProjectKey(tx, created.id);
      for (const f of files) await this.store.insert(tx, created.id, actor.userId, SafeFilePath.of(f.path), f.content);
      return tx.project.findUniqueOrThrow({ where: { id: created.id }, select: PROJECT_SELECT });
    });
    await this.audit.record({ type: 'project.created', actorUserId: actor.userId, target: { type: 'project', id: project.id }, outcome: 'success', metadata: { template } }, meta);
    return this.toDto(project, actor.userId);
  }

  async update(actor: Actor, rawId: string, patch: ProjectPatch, meta: RequestMeta) {
    const action: ProjectAction = patch.name !== undefined ? 'rename' : 'change_settings';
    const { id } = await this.load(actor, rawId, action, meta);
    if (patch.name !== undefined && (patch.compiler !== undefined || patch.mainFile !== undefined)) {
      await this.load(actor, rawId, 'change_settings', meta);
    }
    const data: Prisma.ProjectUpdateInput = {
      ...(patch.name !== undefined ? { name: ProjectName.of(patch.name).toString() } : {}),
      ...(patch.compiler !== undefined ? { compiler: patch.compiler } : {}),
      ...(patch.mainFile !== undefined ? { mainFile: this.safeMainFile(patch.mainFile) } : {}),
      lastActivityAt: new Date(),
    };
    const row = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      // El documento principal tiene que existir: si no, el compilador no sabría qué compilar.
      if (patch.mainFile !== undefined && !(await tx.projectFile.findFirst({ where: { projectId: id, path: patch.mainFile }, select: { id: true } }))) {
        throw new ValidationError({ mainFile: 'Ese archivo no existe en el proyecto.' });
      }
      return tx.project.update({ where: { id }, data, select: PROJECT_SELECT });
    });
    await this.audit.record({ type: 'project.updated', actorUserId: actor.userId, target: { type: 'project', id }, outcome: 'success', metadata: { fields: Object.keys(patch).join(',') } }, meta);
    return this.toDto(row, actor.userId);
  }

  async setLifecycle(actor: Actor, rawId: string, change: 'archive' | 'unarchive' | 'trash' | 'restore', meta: RequestMeta) {
    const action: ProjectAction = change === 'archive' || change === 'unarchive' ? 'archive' : 'trash';
    const { id, row } = await this.load(actor, rawId, action, meta);
    if (change === 'restore' && !row.trashedAt) throw new ConflictError('not_in_trash', 'El proyecto no está en la papelera.');
    const now = new Date();
    const data: Prisma.ProjectUpdateInput =
      change === 'archive' ? { archivedAt: now } :
      change === 'unarchive' ? { archivedAt: null } :
      change === 'trash' ? { trashedAt: now } : { trashedAt: null };
    const updated = await this.db.asUser(asUserId(actor.userId), (tx) => tx.project.update({ where: { id }, data, select: PROJECT_SELECT }));
    await this.audit.record({ type: `project.${change}`, actorUserId: actor.userId, target: { type: 'project', id }, outcome: 'success' }, meta);
    return this.toDto(updated, actor.userId);
  }

  /**
   * Borrado definitivo (F-045): solo desde la papelera y por el propietario.
   * RLS lo impone también: la política DELETE exige trashed_at no nulo.
   */
  async deleteForever(actor: Actor, rawId: string, meta: RequestMeta): Promise<void> {
    const { id, row } = await this.load(actor, rawId, 'delete_forever', meta);
    if (!row.trashedAt) throw new ConflictError('not_in_trash', 'Mueve primero el proyecto a la papelera.');
    await this.db.asUser(asUserId(actor.userId), (tx) => tx.project.delete({ where: { id } }));
    await this.audit.record({ type: 'project.deleted', severity: 'notice', actorUserId: actor.userId, target: { type: 'project', id }, outcome: 'success', metadata: { cryptoShredding: true } }, meta);
  }

  async leave(actor: Actor, rawId: string, meta: RequestMeta): Promise<void> {
    const { id } = await this.load(actor, rawId, 'leave', meta);
    await this.db.asUser(asUserId(actor.userId), (tx) =>
      tx.projectMember.update({ where: { projectId_userId: { projectId: id, userId: actor.userId } }, data: { revokedAt: new Date() } }),
    );
    await this.audit.record({ type: 'project.member.left', actorUserId: actor.userId, target: { type: 'project', id }, outcome: 'success' }, meta);
  }

  // ─────────────────────────── Colaboradores ───────────────────────────

  async members(actor: Actor, rawId: string) {
    const { id } = await this.load(actor, rawId, 'view');
    return this.db.asUser(asUserId(actor.userId), async (tx) => {
      const members = await tx.projectMember.findMany({
        where: { projectId: id, revokedAt: null },
        select: { userId: true, role: true, createdAt: true, user: { select: { firstName: true, lastName: true, primaryEmail: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const invitations = await tx.invitation.findMany({
        where: { projectId: id, status: 'pending', expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      });
      return { members, invitations };
    });
  }

  /** CU-14 · invitar por correo. El rol «owner» no es invitable (T-A11). */
  async invite(actor: Actor, rawId: string, rawEmail: string, role: InvitableRole, meta: RequestMeta) {
    const { id, row } = await this.load(actor, rawId, 'manage_access', meta);
    const email = Email.of(rawEmail);
    if (email.toString() === actor.email.toLowerCase()) throw new ValidationError({ email: 'Ya eres miembro de este proyecto.' });
    if (row.members.some((m) => m.user.primaryEmail.toLowerCase() === email.toString())) {
      throw new ConflictError('already_member', 'Esa persona ya colabora en el proyecto.');
    }
    const invitation = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      await tx.invitation.updateMany({ where: { projectId: id, email: email.toString(), status: 'pending' }, data: { status: 'revoked', respondedAt: new Date() } });
      return tx.invitation.create({
        data: { projectId: id, email: email.toString(), role, invitedBy: actor.userId, expiresAt: new Date(Date.now() + PROJECTS.INVITATION_TTL_MS) },
        select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      });
    });
    await this.mailer.send({
      to: email.toString(),
      subject: `Te han invitado a «${row.name}» en SecurTex`,
      heading: 'Tienes una invitación',
      paragraphs: [`Te han invitado a colaborar en «${row.name}» con el rol ${ROLE_LABEL[role]}.`, 'Inicia sesión (o crea tu cuenta con este mismo correo) para aceptarla desde tu panel de proyectos.'],
      action: { label: 'Ver la invitación', url: `${this.origin}/proyectos` },
      footnote: 'La invitación caduca en 7 días.',
    });
    await this.audit.record({ type: 'project.invite.created', actorUserId: actor.userId, target: { type: 'project', id }, outcome: 'success', metadata: { role } }, meta);
    return invitation;
  }

  async revokeInvitation(actor: Actor, rawId: string, invitationId: string, meta: RequestMeta): Promise<void> {
    const { id } = await this.load(actor, rawId, 'manage_access', meta);
    const result = await this.db.asUser(asUserId(actor.userId), (tx) =>
      tx.invitation.updateMany({ where: { id: invitationId, projectId: id, status: 'pending' }, data: { status: 'revoked', respondedAt: new Date() } }),
    );
    if (result.count === 0) throw new NotFoundError();
    await this.audit.record({ type: 'project.invite.revoked', actorUserId: actor.userId, target: { type: 'project', id }, outcome: 'success' }, meta);
  }

  async changeRole(actor: Actor, rawId: string, targetUserId: string, role: InvitableRole, meta: RequestMeta) {
    const { id } = await this.load(actor, rawId, 'manage_access', meta);
    const target = asUserId(targetUserId);
    if (target === actor.userId) throw new ConflictError('owner_role_fixed', 'No puedes cambiar tu propio rol de propietario.');
    const result = await this.db.asUser(asUserId(actor.userId), (tx) =>
      tx.projectMember.updateMany({ where: { projectId: id, userId: target, revokedAt: null, role: { not: 'owner' } }, data: { role } }),
    );
    if (result.count === 0) throw new NotFoundError();
    await this.audit.record({ type: 'project.member.role_changed', actorUserId: actor.userId, target: { type: 'user', id: target }, outcome: 'success', metadata: { projectId: id, role } }, meta);
  }

  /** F-053 · revocación. En el sistema completo cierra además sus WebSockets en < 5 s (T-P04). */
  async revokeMember(actor: Actor, rawId: string, targetUserId: string, meta: RequestMeta): Promise<void> {
    const { id } = await this.load(actor, rawId, 'manage_access', meta);
    const target = asUserId(targetUserId);
    if (target === actor.userId) throw new ConflictError('owner_cannot_leave', 'El propietario no puede quitarse a sí mismo.');
    const result = await this.db.asUser(asUserId(actor.userId), (tx) =>
      tx.projectMember.updateMany({ where: { projectId: id, userId: target, revokedAt: null, role: { not: 'owner' } }, data: { revokedAt: new Date() } }),
    );
    if (result.count === 0) throw new NotFoundError();
    await this.audit.record({ type: 'project.member.revoked', severity: 'notice', actorUserId: actor.userId, target: { type: 'user', id: target }, outcome: 'success', metadata: { projectId: id } }, meta);
  }

  // ─────────────────────────── Invitaciones recibidas ───────────────────────────

  async myInvitations(actor: Actor) {
    if (!actor.emailVerified) return [];
    return this.db.asUser(asUserId(actor.userId), (tx) =>
      tx.invitation.findMany({
        where: { email: actor.email, status: 'pending', expiresAt: { gt: new Date() } },
        // Sin datos del propietario: quien aún no es miembro no puede leer su perfil (RLS de users).
        select: { id: true, role: true, createdAt: true, expiresAt: true, project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async respondInvitation(actor: Actor, invitationId: string, accept: boolean, meta: RequestMeta): Promise<void> {
    if (!actor.emailVerified) throw new ForbiddenError('email_not_verified', 'Verifica tu correo para aceptar invitaciones.');
    await this.db.asUser(asUserId(actor.userId), async (tx) => {
      const invitation = await tx.invitation.findFirst({ where: { id: invitationId, email: actor.email, status: 'pending', expiresAt: { gt: new Date() } } });
      if (!invitation) throw new NotFoundError();
      if (accept) {
        // RLS solo admite esta fila si existe la invitación pendiente para ese rol exacto.
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: invitation.projectId, userId: actor.userId } },
          create: { projectId: invitation.projectId, userId: actor.userId, role: invitation.role, invitedBy: invitation.invitedBy },
          update: { role: invitation.role, revokedAt: null },
        });
      }
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: accept ? 'accepted' : 'declined', respondedAt: new Date() } });
    });
    await this.audit.record({ type: accept ? 'project.member.added' : 'project.invite.declined', actorUserId: actor.userId, target: { type: 'invitation', id: invitationId }, outcome: 'success' }, meta);
  }

  // ─────────────────────────── Etiquetas (privadas) ───────────────────────────

  async tags(actor: Actor) {
    return this.db.asUser(asUserId(actor.userId), (tx) =>
      tx.tag.findMany({ select: { id: true, name: true, color: true, _count: { select: { projects: true } } }, orderBy: { name: 'asc' } }),
    );
  }

  async createTag(actor: Actor, rawName: string, color: string) {
    const name = rawName.normalize('NFC').trim();
    if (!name || name.length > PROJECTS.TAG_NAME_MAX_LENGTH) throw new ValidationError({ name: 'Usa entre 1 y 40 caracteres.' });
    try {
      return await this.db.asUser(asUserId(actor.userId), (tx) => tx.tag.create({ data: { userId: actor.userId, name, color }, select: { id: true, name: true, color: true } }));
    } catch {
      throw new ConflictError('tag_exists', 'Ya tienes una etiqueta con ese nombre.');
    }
  }

  async deleteTag(actor: Actor, tagId: string): Promise<void> {
    const result = await this.db.asUser(asUserId(actor.userId), (tx) => tx.tag.deleteMany({ where: { id: tagId } }));
    if (result.count === 0) throw new NotFoundError();
  }

  async setProjectTags(actor: Actor, rawId: string, tagIds: readonly string[]) {
    const { id } = await this.load(actor, rawId, 'tag');
    await this.db.asUser(asUserId(actor.userId), async (tx) => {
      const mine = await tx.tag.findMany({ where: { id: { in: [...tagIds] } }, select: { id: true } });
      await tx.projectTag.deleteMany({ where: { projectId: id } });
      if (mine.length > 0) await tx.projectTag.createMany({ data: mine.map((t) => ({ tagId: t.id, projectId: id })) });
    });
    return this.get(actor, rawId);
  }

  // ─────────────────────────── Internos ───────────────────────────

  /** Cargar + autorizar. Si no es miembro: 404 uniforme. Si es miembro sin permiso: 403 auditado. */
  /** Punto de entrada de autorización para otros casos de uso (archivos, compilación). */
  async authorize(actor: Actor, rawId: string, action: ProjectAction, meta?: RequestMeta): Promise<{ id: ProjectId; row: ProjectRow; role: ProjectRole }> {
    return this.load(actor, rawId, action, meta);
  }

  private async load(actor: Actor, rawId: string, action: ProjectAction, meta?: RequestMeta): Promise<{ id: ProjectId; row: ProjectRow; role: ProjectRole }> {
    let id: ProjectId;
    try {
      id = asProjectId(rawId);
    } catch {
      throw new NotFoundError();
    }
    const row = await this.db.asUser(asUserId(actor.userId), (tx) => tx.project.findUnique({ where: { id }, select: PROJECT_SELECT }));
    const role = row ? this.roleOf(row, actor.userId) : null;
    if (!row || role === null) throw new NotFoundError();
    const decision = decide(role, action);
    if (!decision.allowed) {
      if (meta) {
        await this.audit.record({ type: 'authz.denied', severity: 'warning', actorUserId: actor.userId, target: { type: 'project', id }, outcome: 'denied', reason: decision.reason, metadata: { action, role } }, meta);
      }
      throw new ForbiddenError('insufficient_role', 'Tu rol en este proyecto no permite esta acción.');
    }
    return { id, row, role };
  }

  private roleOf(row: ProjectRow, userId: string): ProjectRole | null {
    return (row.members.find((m) => m.userId === userId)?.role as DbRole | undefined) ?? null;
  }

  private toDto(row: ProjectRow, userId: string) {
    const role = this.roleOf(row, userId) ?? 'viewer';
    return {
      id: row.id,
      name: row.name,
      compiler: row.compiler,
      mainFile: row.mainFile,
      confidential: row.confidential,
      archived: row.archivedAt !== null,
      trashedAt: row.trashedAt,
      lastActivityAt: row.lastActivityAt,
      createdAt: row.createdAt,
      owner: { id: row.owner.id, name: `${row.owner.firstName} ${row.owner.lastName}`.trim() },
      role,
      // Cortesía visual para la interfaz: el servidor vuelve a decidir en cada petición.
      allowedActions: [...allowedActions(role)],
      collaborators: row.members.map((m) => ({ userId: m.userId, role: m.role, name: `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.primaryEmail })),
      tagIds: row.tags.map((t) => t.tagId),
    };
  }

  private filterWhere(userId: string, query: ProjectQuery): Prisma.ProjectWhereInput {
    const base: Prisma.ProjectWhereInput = {
      members: { some: { userId, revokedAt: null } },
      ...(query.q ? { name: { contains: query.q.slice(0, 80), mode: 'insensitive' } } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
    };
    switch (query.filter) {
      case 'trash': return { ...base, ownerId: userId, trashedAt: { not: null } };
      case 'archived': return { ...base, archivedAt: { not: null }, trashedAt: null };
      case 'owned': return { ...base, ownerId: userId, archivedAt: null, trashedAt: null };
      case 'shared': return { ...base, ownerId: { not: userId }, archivedAt: null, trashedAt: null };
      case 'all': return { ...base, archivedAt: null, trashedAt: null };
    }
  }

  private async counts(tx: AppTx, userId: string) {
    const mine = { members: { some: { userId, revokedAt: null } } };
    const [all, owned, shared, archived, trash] = await Promise.all([
      tx.project.count({ where: { ...mine, archivedAt: null, trashedAt: null } }),
      tx.project.count({ where: { ...mine, ownerId: userId, archivedAt: null, trashedAt: null } }),
      tx.project.count({ where: { ...mine, ownerId: { not: userId }, archivedAt: null, trashedAt: null } }),
      tx.project.count({ where: { ...mine, archivedAt: { not: null }, trashedAt: null } }),
      tx.project.count({ where: { ...mine, ownerId: userId, trashedAt: { not: null } } }),
    ]);
    return { all, owned, shared, archived, trash };
  }

  private safeMainFile(raw: string): string {
    const value = raw.normalize('NFC').trim();
    if (!/^[\w\-. /]{1,200}\.tex$/.test(value) || value.includes('..') || value.startsWith('/')) {
      throw new ValidationError({ mainFile: 'Elige un archivo .tex del proyecto.' });
    }
    return value;
  }
}

const ROLE_LABEL: Readonly<Record<InvitableRole, string>> = { editor: 'Editor', reviewer: 'Revisor', viewer: 'Lector' };
