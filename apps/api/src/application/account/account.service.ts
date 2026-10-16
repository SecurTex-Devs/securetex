import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { asUserId } from '../../domain/values';
import { Databases } from '../../infrastructure/db/databases';
import { Mailer } from '../../infrastructure/mail/mailer';
import { FIELD, FieldCipher } from '../../infrastructure/security/field-cipher';
import { AuditLog } from '../audit/audit-log';
import { MfaService } from '../auth/mfa';
import { SessionService } from '../auth/sessions';
import type { Actor, RequestMeta } from '../request-meta';

export interface ProfileUpdate {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly institution?: string;
  readonly roleTitle?: string;
  readonly locale?: string;
  readonly timezone?: string;
}

const DELETE_CONFIRMATION = 'ELIMINAR MI CUENTA';

/** Lo que el panel de transparencia puede mostrar de la auditoría propia (P-28). */
const VISIBLE_EVENTS = [
  'auth.login.success', 'auth.login.failure', 'auth.login.locked', 'auth.logout', 'auth.logout_all',
  'auth.password.changed', 'auth.password.reset', 'auth.mfa.enabled', 'auth.mfa.disabled',
  'auth.mfa.failure', 'auth.refresh.reuse_detected', 'auth.email.verified', 'auth.session.revoked',
  'project.member.added', 'project.member.role_changed', 'project.member.revoked',
] as const;

/** Cuenta, sesiones y transparencia (P-27, P-28, P-30, P-32, P-34). */
@Injectable()
export class AccountService {
  constructor(
    private readonly db: Databases,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly mailer: Mailer,
    private readonly audit: AuditLog,
    private readonly cipher: FieldCipher,
  ) {}

  async profile(actor: Actor) {
    const user = await this.db.identity.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: {
        id: true, primaryEmail: true, emailVerifiedAt: true, firstName: true, lastName: true, institution: true,
        roleTitle: true, locale: true, timezone: true, status: true, isSystemAdmin: true, createdAt: true,
        passwordUpdatedAt: true, passwordHash: true,
      },
    });
    const mfa = await this.mfa.status(actor.userId);
    const { passwordHash, ...rest } = user;
    const c = this.cipher;
    return {
      ...rest,
      primaryEmail: c.decrypt(user.primaryEmail, FIELD.userEmail),
      firstName: c.decrypt(user.firstName, FIELD.userFirstName),
      lastName: c.decrypt(user.lastName, FIELD.userLastName),
      institution: c.decrypt(user.institution, FIELD.userInstitution),
      roleTitle: c.decrypt(user.roleTitle, FIELD.userRoleTitle),
      // Solo se expone si existe contraseña, nunca el hash (API §4.3).
      hasPassword: passwordHash !== null,
      emailVerified: user.emailVerifiedAt !== null,
      mfa,
      elevatedUntil: actor.elevatedUntil,
    };
  }

  async updateProfile(actor: Actor, update: ProfileUpdate, meta: RequestMeta) {
    const clean = Object.fromEntries(
      Object.entries(update).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, (v as string).normalize('NFC').trim().slice(0, 80)]),
    );
    // Los datos personales se guardan cifrados (C3c); idioma y zona horaria no identifican a nadie.
    const contexts: Record<string, string> = { firstName: FIELD.userFirstName, lastName: FIELD.userLastName, institution: FIELD.userInstitution, roleTitle: FIELD.userRoleTitle };
    const data = Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, contexts[k] ? this.cipher.encrypt(v, contexts[k]) : v]));
    await this.db.identity.user.update({ where: { id: actor.userId }, data });
    await this.audit.record({ type: 'account.profile.updated', actorUserId: actor.userId, outcome: 'success', metadata: { fields: Object.keys(clean).join(',') } }, meta);
    return this.profile(actor);
  }

  async listSessions(actor: Actor) {
    const rows = await this.db.identity.session.findMany({
      where: { userId: actor.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, deviceLabel: true, ipPrefix: true, authMethod: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    });
    return rows.map((s) => ({
      ...s,
      deviceLabel: this.cipher.decrypt(s.deviceLabel, FIELD.sessionDevice),
      ipPrefix: this.cipher.decrypt(s.ipPrefix, FIELD.sessionIp),
      current: s.id === actor.sessionId,
    }));
  }

  async revokeSession(actor: Actor, sessionId: string, meta: RequestMeta): Promise<void> {
    // La condición userId impide revocar sesiones ajenas aunque se conozca su id (IDOR).
    const owned = await this.db.identity.session.findFirst({ where: { id: sessionId, userId: actor.userId, revokedAt: null }, select: { id: true } });
    if (!owned) throw new NotFoundError();
    await this.sessions.revoke(sessionId, 'user_revoked');
    await this.audit.record({ type: 'auth.session.revoked', actorUserId: actor.userId, target: { type: 'session', id: sessionId }, outcome: 'success' }, meta);
  }

  async identities(actor: Actor) {
    const rows = await this.db.identity.userIdentity.findMany({
      where: { userId: actor.userId },
      select: { id: true, provider: true, providerEmail: true, linkedAt: true, lastUsedAt: true },
      orderBy: { linkedAt: 'asc' },
    });
    return rows.map((r) => ({ ...r, providerEmail: this.cipher.decryptOptional(r.providerEmail, FIELD.identityEmail) }));
  }

  async activity(actor: Actor) {
    const events = await this.db.audit.auditEvent.findMany({
      where: { actorUserId: actor.userId, eventType: { in: [...VISIBLE_EVENTS] } },
      orderBy: { seq: 'desc' },
      take: 30,
      select: { id: true, occurredAt: true, eventType: true, outcome: true, actorIpPrefix: true, metadata: true },
    });
    return events;
  }

  async preferences(actor: Actor): Promise<Prisma.JsonValue> {
    const row = await this.db.identity.editorPreferences.findUnique({ where: { userId: actor.userId } });
    return this.openPrefs(row?.prefs);
  }

  async savePreferences(actor: Actor, prefs: Prisma.InputJsonObject): Promise<Prisma.JsonValue> {
    // Se guardan cifradas (C3c) dentro del JSON: la base solo ve un criptograma.
    const sealed = { c3c: this.cipher.encrypt(JSON.stringify(prefs), FIELD.preferences) };
    await this.db.identity.editorPreferences.upsert({
      where: { userId: actor.userId },
      create: { userId: actor.userId, prefs: sealed },
      update: { prefs: sealed },
    });
    return prefs as Prisma.JsonValue;
  }

  private openPrefs(stored: Prisma.JsonValue | undefined): Prisma.JsonValue {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    const c3c = (stored as Record<string, unknown>)['c3c'];
    return typeof c3c === 'string' ? (JSON.parse(this.cipher.decrypt(c3c, FIELD.preferences)) as Prisma.JsonValue) : {};
  }

  async deletionImpact(actor: Actor): Promise<{ readonly ownedProjects: number; readonly sharedOwnedProjects: number }> {
    return this.db.asUser(asUserId(actor.userId), async (tx) => {
      const owned = await tx.project.findMany({ where: { ownerId: actor.userId }, select: { _count: { select: { members: { where: { revokedAt: null } } } } } });
      return { ownedProjects: owned.length, sharedOwnedProjects: owned.filter((p) => p._count.members > 1).length };
    });
  }

  /**
   * Eliminación de la cuenta (CU-08). Borra en cascada perfil, sesiones,
   * métodos de MFA y proyectos propios. En el diseño completo, el borrado
   * destruye además las claves de cifrado del proyecto (crypto-shredding,
   * 14-Criptografia §C3): sin la clave, ni las copias de seguridad sirven.
   */
  async deleteAccount(actor: Actor, confirmation: string, meta: RequestMeta): Promise<void> {
    if (confirmation.trim() !== DELETE_CONFIRMATION) {
      throw new ValidationError({ confirmation: `Escribe exactamente «${DELETE_CONFIRMATION}».` });
    }
    await this.audit.record({ type: 'account.deleted', severity: 'warning', actorUserId: actor.userId, target: { type: 'user', id: actor.userId }, outcome: 'success' }, meta);
    await this.sessions.revokeAllForUser(actor.userId, 'account_deleted');
    await this.db.identity.user.delete({ where: { id: actor.userId } });
    await this.mailer.send({
      to: actor.email,
      subject: 'Tu cuenta de SecurTex se ha eliminado',
      heading: 'Cuenta eliminada',
      paragraphs: ['Hemos eliminado tu cuenta, tus proyectos y tus archivos. Gracias por haber usado SecurTex.'],
    });
  }
}
