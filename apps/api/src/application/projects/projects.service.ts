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
import { FIELD, FieldCipher } from '../../infrastructure/security/field-cipher';
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
    private readonly cipher: FieldCipher,
  ) {}

  async list(actor: Actor, query: ProjectQuery) {
    const me = asUserId(actor.userId);
    return this.db.asUser(me, async (tx) => {
      const rows = await tx.project.findMany({
        where: this.filterWhere(actor.userId, query),
        select: PROJECT_SELECT,
        orderBy: { lastActivityAt: query.sort === 'lastActivity' ? 'asc' : 'desc' },
        take: 500,
      });
      const counts = await this.counts(tx, actor.userId);
      // El nombre está cifrado en la base (C3c): la búsqueda y el orden por nombre se hacen ya descifrados.
      const needle = query.q ? fold(query.q.slice(0, 80)) : null;
      const items = rows
        .filter((r) => this.roleOf(r, actor.userId) !== null)
        .map((r) => this.decryptRow(r))
        .filter((r) => needle === null || fold(r.name).includes(needle));
      if (query.sort.endsWith('name')) {
        const dir = query.sort.startsWith('-') ? -1 : 1;
        items.sort((a, b) => dir * a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      }
      return { items: items.slice(0, 200).map((r) => this.toDto(r, actor.userId)), counts };
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
      const author = `${this.cipher.decrypt(me.firstName, FIELD.userFirstName)} ${this.cipher.decrypt(me.lastName, FIELD.userLastName)}`.trim();
      const files = templateFiles(template, name.toString(), author);
      const created = await tx.project.create({
        data: {
          ownerId: actor.userId,
          name: this.cipher.encrypt(name.toString(), FIELD.projectName),
          mainFile: this.cipher.encrypt('main.tex', FIELD.projectMainFile),
          compiler: compiler ?? (template === 'presentacion' ? 'xelatex' : 'pdflatex'),
        },
        select: { id: true },
      });
      await tx.projectMember.create({ data: { projectId: created.id, userId: actor.userId, role: 'owner' } });
      await this.store.createProjectKey(tx, created.id);
      for (const f of files) await this.store.insert(tx, created.id, actor.userId, SafeFilePath.of(f.path), f.content);
      return tx.project.findUniqueOrThrow({ where: { id: created.id }, select: PROJECT_SELECT });
    });
    await this.audit.record({ type: 'project.created', actorUserId: actor.userId, target: { type: 'project', id: project.id }, outcome: 'success', metadata: { template } }, meta);
    return this.toDto(this.decryptRow(project), actor.userId);
  }

  /**
   * «Hacer una copia» (F-043): proyecto nuevo de quien copia, con su PROPIA
   * clave; los archivos se recifran con ella (nunca se comparte la KEK del
   * original). Basta con poder ver el proyecto, como en Overleaf.
   */
  async createCopy(
    actor: Actor, rawName: string, source: { compiler: CompilerEngine; mainFile: string },
    files: ReadonlyArray<{ path: string; content: string; size: number }>, meta: RequestMeta,
  ) {
    if (!actor.emailVerified) throw new ForbiddenError('email_not_verified', 'Verifica tu correo para crear proyectos.');
    const name = ProjectName.of(rawName);
    const project = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      const created = await tx.project.create({
        data: {
          ownerId: actor.userId,
          name: this.cipher.encrypt(name.toString(), FIELD.projectName),
          mainFile: this.cipher.encrypt(source.mainFile, FIELD.projectMainFile),
          compiler: source.compiler,
        },
        select: { id: true },
      });
      await tx.projectMember.create({ data: { projectId: created.id, userId: actor.userId, role: 'owner' } });
      await this.store.createProjectKey(tx, created.id);
      for (const f of files) await this.store.insert(tx, created.id, actor.userId, SafeFilePath.of(f.path), f.content, f.size);
      return tx.project.findUniqueOrThrow({ where: { id: created.id }, select: PROJECT_SELECT });
    });
    await this.audit.record({ type: 'project.created', actorUserId: actor.userId, target: { type: 'project', id: project.id }, outcome: 'success', metadata: { copy: true } }, meta);
    return this.toDto(this.decryptRow(project), actor.userId);
  }

  async update(actor: Actor, rawId: string, patch: ProjectPatch, meta: RequestMeta) {
    const action: ProjectAction = patch.name !== undefined ? 'rename' : 'change_settings';
    const { id } = await this.load(actor, rawId, action, meta);
    if (patch.name !== undefined && (patch.compiler !== undefined || patch.mainFile !== undefined)) {
      await this.load(actor, rawId, 'change_settings', meta);
    }
    const data: Prisma.ProjectUpdateInput = {
      ...(patch.name !== undefined ? { name: this.cipher.encrypt(ProjectName.of(patch.name).toString(), FIELD.projectName) } : {}),
      ...(patch.compiler !== undefined ? { compiler: patch.compiler } : {}),
      ...(patch.mainFile !== undefined ? { mainFile: this.cipher.encrypt(this.safeMainFile(patch.mainFile), FIELD.projectMainFile) } : {}),
      lastActivityAt: new Date(),
    };
    const row = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      // El documento principal tiene que existir: si no, el compilador no sabría qué compilar.
      if (patch.mainFile !== undefined && !(await tx.projectFile.findFirst({ where: { projectId: id, pathIndex: this.cipher.index(`path:${id}`, patch.mainFile.normalize('NFC').trim()) }, select: { id: true } }))) {
        throw new ValidationError({ mainFile: 'Ese archivo no existe en el proyecto.' });
      }
      return tx.project.update({ where: { id }, data, select: PROJECT_SELECT });
    });
    await this.audit.record({ type: 'project.updated', actorUserId: actor.userId, target: { type: 'project', id }, outcome: 'success', metadata: { fields: Object.keys(patch).join(',') } }, meta);
    return this.toDto(this.decryptRow(row), actor.userId);
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
    return this.toDto(this.decryptRow(updated), actor.userId);
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
      return {
        members: members.map((m) => ({ ...m, user: this.decryptUser(m.user) })),
        invitations: invitations.map((i) => ({ ...i, email: this.cipher.decrypt(i.email, FIELD.invitationEmail) })),
      };
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
    const emailIndex = this.cipher.emailIndex(email.toString());
    const created = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      await tx.invitation.updateMany({ where: { projectId: id, emailIndex, status: 'pending' }, data: { status: 'revoked', respondedAt: new Date() } });
      return tx.invitation.create({
        data: { projectId: id, email: this.cipher.encrypt(email.toString(), FIELD.invitationEmail), emailIndex, role, invitedBy: actor.userId, expiresAt: new Date(Date.now() + PROJECTS.INVITATION_TTL_MS) },
        select: { id: true, role: true, createdAt: true, expiresAt: true },
      });
    });
    const invitation = { ...created, email: email.toString() };
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
        where: { emailIndex: this.cipher.emailIndex(actor.email), status: 'pending', expiresAt: { gt: new Date() } },
        // Sin datos del propietario: quien aún no es miembro no puede leer su perfil (RLS de users).
        select: { id: true, role: true, createdAt: true, expiresAt: true, project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ).then((rows) => rows.map((r) => ({ ...r, project: { ...r.project, name: this.cipher.decrypt(r.project.name, FIELD.projectName) } })));
  }

  async respondInvitation(actor: Actor, invitationId: string, accept: boolean, meta: RequestMeta): Promise<void> {
    if (!actor.emailVerified) throw new ForbiddenError('email_not_verified', 'Verifica tu correo para aceptar invitaciones.');
    await this.db.asUser(asUserId(actor.userId), async (tx) => {
      const invitation = await tx.invitation.findFirst({ where: { id: invitationId, emailIndex: this.cipher.emailIndex(actor.email), status: 'pending', expiresAt: { gt: new Date() } } });
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
    const rows = await this.db.asUser(asUserId(actor.userId), (tx) =>
      tx.tag.findMany({ select: { id: true, name: true, color: true, _count: { select: { projects: true } } } }),
    );
    return rows
      .map((t) => ({ ...t, name: this.cipher.decrypt(t.name, FIELD.tagName) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }

  async createTag(actor: Actor, rawName: string, color: string) {
    const name = rawName.normalize('NFC').trim();
    if (!name || name.length > PROJECTS.TAG_NAME_MAX_LENGTH) throw new ValidationError({ name: 'Usa entre 1 y 40 caracteres.' });
    try {
      const tag = await this.db.asUser(asUserId(actor.userId), (tx) => tx.tag.create({
        data: { userId: actor.userId, name: this.cipher.encrypt(name, FIELD.tagName), nameIndex: this.cipher.tagIndex(name), color },
        select: { id: true, color: true },
      }));
      return { ...tag, name };
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
    const found = await this.db.asUser(asUserId(actor.userId), (tx) => tx.project.findUnique({ where: { id }, select: PROJECT_SELECT }));
    const role = found ? this.roleOf(found, actor.userId) : null;
    if (!found || role === null) throw new NotFoundError();
    const row = this.decryptRow(found);
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

  /** Columnas C3c → texto. Se descifra después de autorizar: nunca para quien no es miembro. */
  private decryptRow(row: ProjectRow): ProjectRow {
    return {
      ...row,
      name: this.cipher.decrypt(row.name, FIELD.projectName),
      mainFile: this.cipher.decrypt(row.mainFile, FIELD.projectMainFile),
      owner: { ...row.owner, ...this.decryptUser(row.owner) },
      members: row.members.map((m) => ({ ...m, user: this.decryptUser(m.user) })),
    };
  }

  private decryptUser<T extends { firstName: string; lastName: string; primaryEmail?: string }>(u: T): T {
    return {
      ...u,
      firstName: this.cipher.decrypt(u.firstName, FIELD.userFirstName),
      lastName: this.cipher.decrypt(u.lastName, FIELD.userLastName),
      ...(u.primaryEmail !== undefined ? { primaryEmail: this.cipher.decrypt(u.primaryEmail, FIELD.userEmail) } : {}),
    };
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

/** Comparación sin mayúsculas ni tildes para buscar en nombres ya descifrados. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
