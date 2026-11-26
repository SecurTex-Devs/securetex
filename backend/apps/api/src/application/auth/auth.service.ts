import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { loadEnv } from '../../config/env';
import { isDemoEmail } from '../../domain/demo';
import { requirePublicRegistration } from '../../domain/registration';
import { AUTH } from '../../domain/constants';
import { ForbiddenError, InvalidCredentialsError, RateLimitedError, UnauthorizedError, ValidationError } from '../../domain/errors';
import { Email } from '../../domain/values';
import { Databases } from '../../infrastructure/db/databases';
import { Mailer } from '../../infrastructure/mail/mailer';
import { FIELD, FieldCipher } from '../../infrastructure/security/field-cipher';
import { PasswordHasher } from '../../infrastructure/security/passwords';
import { formatCompositeToken, parseCompositeToken, randomSecret, secretMatches, sha256 } from '../../infrastructure/security/tokens';
import { AuditLog } from '../audit/audit-log';
import type { Actor, RequestMeta } from '../request-meta';
import { NewPasswordService } from './credentials';
import { EmailTokenService } from './email-tokens';
import { formatUntil, lockedError, LoginThrottle } from './login-throttle';
import { MfaService, type SecondFactor } from './mfa';
import { SessionService, type IssuedSession } from './sessions';

export type LoginResult =
  | { readonly kind: 'session'; readonly session: IssuedSession }
  | { readonly kind: 'mfa_required'; readonly challengeToken: string };

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Casos de uso de identidad (CU-01, CU-02, CU-03). Respuestas y tiempos
 * uniformes donde un atacante podría enumerar cuentas (T-A09).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly db: Databases,
    private readonly hasher: PasswordHasher,
    private readonly newPasswords: NewPasswordService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottle,
    private readonly mfa: MfaService,
    private readonly emailTokens: EmailTokenService,
    private readonly mailer: Mailer,
    private readonly audit: AuditLog,
    private readonly cipher: FieldCipher,
  ) {}

  /**
   * Registro (P-02). Si el correo ya existe, la respuesta es idéntica y se
   * avisa por correo a su titular: quien intenta registrarse no aprende nada.
   */
  async register(input: RegisterInput, meta: RequestMeta): Promise<void> {
    requirePublicRegistration(loadEnv().REGISTRATION_ENABLED);
    const email = Email.of(input.email);
    if (isDemoEmail(email.toString())) return;
    const passwordHash = await this.newPasswords.validateAndHash(input.password, email);
    // Búsqueda por índice ciego: el correo está cifrado en la base (C3c).
    const existing = await this.db.identity.user.findUnique({ where: { emailIndex: this.cipher.emailIndex(email.toString()) } });
    if (existing) {
      await this.mailer.send({
        to: email.toString(),
        subject: 'Alguien ha intentado crear una cuenta con tu correo',
        heading: 'Ya tienes una cuenta en SecurTex',
        paragraphs: [
          'Alguien ha intentado registrarse con este correo. Si has sido tú, inicia sesión con tu cuenta actual.',
          'Si no has sido tú, no tienes que hacer nada: tu cuenta sigue protegida.',
        ],
      });
      await this.audit.record({ type: 'auth.register.duplicate', severity: 'notice', actorUserId: existing.id, outcome: 'failure', reason: 'email_taken' }, meta);
      return;
    }
    const user = await this.db.identity.user.create({
      data: {
        primaryEmail: this.cipher.encrypt(email.toString(), FIELD.userEmail),
        emailIndex: this.cipher.emailIndex(email.toString()),
        passwordHash,
        passwordUpdatedAt: new Date(),
        firstName: this.cipher.encrypt(input.firstName.trim().slice(0, 80), FIELD.userFirstName),
        lastName: this.cipher.encrypt(input.lastName.trim().slice(0, 80), FIELD.userLastName),
        identities: {
          create: {
            provider: 'local',
            providerSubject: this.cipher.encrypt(email.toString(), FIELD.identitySubject),
            subjectIndex: this.cipher.index('subject:local', email.toString()),
            providerEmail: this.cipher.encrypt(email.toString(), FIELD.identityEmail),
          },
        },
      },
    });
    await this.sendVerification(user.id, email.toString(), input.firstName.trim());
    await this.audit.record({ type: 'auth.register.success', actorUserId: user.id, target: { type: 'user', id: user.id }, outcome: 'success' }, meta);
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    const userId = await this.emailTokens.consume(token, 'verify_email');
    if (!userId) {
      throw new ValidationError({ token: 'El enlace no es válido o ha caducado. Pide uno nuevo.' }, 'El enlace no es válido o ha caducado.');
    }
    await this.db.identity.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), status: 'active' } });
    await this.audit.record({ type: 'auth.email.verified', actorUserId: userId, outcome: 'success' }, meta);
  }

  async resendVerification(actor: Actor): Promise<{ readonly retryAfterSeconds: number }> {
    if (actor.emailVerified) return { retryAfterSeconds: 0 };
    const last = await this.emailTokens.lastIssuedAt(actor.userId, 'verify_email');
    const wait = last ? AUTH.VERIFY_EMAIL_RESEND_COOLDOWN_MS - (Date.now() - last.getTime()) : 0;
    if (wait > 0) throw new RateLimitedError(Math.ceil(wait / 1000), 'resend_cooldown', 'Ya te hemos enviado un enlace hace poco. Espera un momento.');
    const user = await this.db.identity.user.findUniqueOrThrow({ where: { id: actor.userId } });
    await this.sendVerification(user.id, actor.email, this.cipher.decrypt(user.firstName, FIELD.userFirstName));
    return { retryAfterSeconds: Math.ceil(AUTH.VERIFY_EMAIL_RESEND_COOLDOWN_MS / 1000) };
  }

  async login(rawEmail: string, password: string, remember: boolean, meta: RequestMeta): Promise<LoginResult> {
    const email = Email.of(rawEmail);
    // Las identidades sin contraseña no participan en el bloqueo de cuentas normales.
    if (isDemoEmail(email.toString())) throw new InvalidCredentialsError(null);
    await this.throttle.assertNotLocked(email);
    const user = await this.db.identity.user.findUnique({ where: { emailIndex: this.cipher.emailIndex(email.toString()) } });
    const valid = user?.passwordHash ? await this.hasher.verify(user.passwordHash, password) : await this.burn(password);

    if (!user || !valid || user.status === 'suspended' || user.status === 'deleted') {
      await this.failLogin(email, user?.id ?? null, meta);
    }
    // Aquí `user` existe y es válido; TypeScript no lo deduce de failLogin(): never.
    const account = user as User;
    await this.throttle.registerSuccess(email);
    if (account.passwordHash && this.hasher.needsRehash(account.passwordHash)) {
      await this.db.identity.user.update({ where: { id: account.id }, data: { passwordHash: await this.hasher.hash(password) } });
    }
    return this.finishPrimaryAuth(account, 'password', remember, meta);
  }

  /** Tras el primer factor: o sesión directa, o reto de segundo factor. Compartido con OIDC. */
  async finishPrimaryAuth(user: Pick<User, 'id'>, method: string, remember: boolean, meta: RequestMeta): Promise<LoginResult> {
    if (await this.mfa.isEnabled(user.id)) {
      const secret = randomSecret();
      const challenge = await this.db.identity.authChallenge.create({
        data: {
          userId: user.id,
          kind: 'mfa',
          secretHash: sha256(secret),
          data: { method, remember },
          expiresAt: new Date(Date.now() + AUTH.MFA_CHALLENGE_TTL_MS),
        },
      });
      await this.audit.record({ type: 'auth.login.mfa_challenge', actorUserId: user.id, outcome: 'success', metadata: { method } }, meta);
      return { kind: 'mfa_required', challengeToken: formatCompositeToken(challenge.id, secret) };
    }
    const session = await this.sessions.create(user, method, remember, meta);
    await this.audit.record({ type: 'auth.login.success', actorUserId: user.id, target: { type: 'session', id: session.sessionId }, outcome: 'success', metadata: { method, mfa: false } }, meta);
    return { kind: 'session', session };
  }

  async completeMfa(rawChallenge: string | undefined, factor: SecondFactor, meta: RequestMeta): Promise<IssuedSession> {
    const parsed = parseCompositeToken(rawChallenge);
    const challenge = parsed ? await this.db.identity.authChallenge.findUnique({ where: { id: parsed.id } }) : null;
    const usable =
      parsed && challenge && challenge.kind === 'mfa' && challenge.userId && !challenge.consumedAt &&
      challenge.expiresAt > new Date() && challenge.attempts < AUTH.MFA_MAX_ATTEMPTS && secretMatches(parsed.secret, challenge.secretHash);
    if (!usable || !challenge?.userId) {
      throw new UnauthorizedError('mfa_challenge_invalid', 'La verificación ha caducado. Vuelve a iniciar sesión.');
    }
    const userId = challenge.userId;
    if (!(await this.mfa.verify(userId, factor))) {
      const attempts = challenge.attempts + 1;
      await this.db.identity.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts, ...(attempts >= AUTH.MFA_MAX_ATTEMPTS ? { consumedAt: new Date() } : {}) },
      });
      await this.audit.record({ type: 'auth.mfa.failure', severity: 'warning', actorUserId: userId, outcome: 'failure', metadata: { kind: factor.kind, attempts } }, meta);
      throw new ValidationError({ code: 'El código no es correcto.' }, `Código incorrecto. Te quedan ${Math.max(0, AUTH.MFA_MAX_ATTEMPTS - attempts)} intentos.`);
    }
    const claimed = await this.db.identity.authChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) throw new UnauthorizedError('mfa_challenge_invalid');

    const data = challenge.data as { method?: string; remember?: boolean };
    const session = await this.sessions.create({ id: userId }, data.method ?? 'password', data.remember === true, meta);
    await this.audit.record({ type: 'auth.login.success', actorUserId: userId, target: { type: 'session', id: session.sessionId }, outcome: 'success', metadata: { method: data.method ?? 'password', mfa: factor.kind } }, meta);
    return session;
  }

  /** P-06 · respuesta idéntica exista o no la cuenta (RF-007). */
  async forgotPassword(rawEmail: string, meta: RequestMeta): Promise<void> {
    const email = Email.of(rawEmail);
    if (isDemoEmail(email.toString())) return;
    const user = await this.db.identity.user.findUnique({ where: { emailIndex: this.cipher.emailIndex(email.toString()) } });
    if (!user || user.status === 'suspended' || user.status === 'deleted') return;
    const link = await this.emailTokens.issue(user.id, 'reset_password');
    await this.mailer.send({
      to: email.toString(),
      subject: 'Restablece tu contraseña de SecurTex',
      heading: 'Restablecer contraseña',
      paragraphs: ['Has pedido restablecer tu contraseña. El enlace es válido durante 30 minutos y solo funciona una vez.', 'Al guardar la nueva contraseña cerraremos tus demás sesiones.'],
      action: { label: 'Elegir una contraseña nueva', url: link },
      footnote: 'Si no lo has pedido tú, ignora este correo: tu contraseña no cambiará.',
    });
    await this.audit.record({ type: 'auth.password.reset_requested', actorUserId: user.id, outcome: 'success' }, meta);
  }

  /** P-07 · al completarse se cierran todas las sesiones (RF-007). */
  async resetPassword(token: string, password: string, meta: RequestMeta): Promise<void> {
    const userId = await this.emailTokens.consume(token, 'reset_password');
    if (!userId) throw new ValidationError({ token: 'El enlace no es válido o ha caducado.' }, 'El enlace no es válido o ha caducado. Pide uno nuevo.');
    const user = await this.db.identity.user.findUniqueOrThrow({ where: { id: userId } });
    const userEmail = this.cipher.decrypt(user.primaryEmail, FIELD.userEmail);
    const passwordHash = await this.newPasswords.validateAndHash(password, Email.of(userEmail));
    await this.db.identity.user.update({
      where: { id: userId },
      // Restablecer por correo también demuestra la propiedad del correo.
      data: { passwordHash, passwordUpdatedAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date(), status: user.status === 'pending' ? 'active' : user.status },
    });
    const closed = await this.sessions.revokeAllForUser(userId, 'password_change');
    await this.notifyPasswordChanged(userEmail);
    await this.audit.record({ type: 'auth.password.reset', severity: 'notice', actorUserId: userId, outcome: 'success', metadata: { sessionsClosed: closed } }, meta);
  }

  /** Reautenticación para operaciones sensibles (RS-006): eleva la sesión 5 minutos. */
  async reauthenticate(actor: Actor, input: { readonly password?: string; readonly code?: string }, meta: RequestMeta): Promise<Date> {
    const user = await this.db.identity.user.findUniqueOrThrow({ where: { id: actor.userId } });
    let ok = false;
    if (input.password !== undefined && user.passwordHash) ok = await this.hasher.verify(user.passwordHash, input.password);
    else if (input.code !== undefined) ok = await this.mfa.verify(user.id, { kind: 'totp', code: input.code });
    else if (input.password !== undefined) await this.burn(input.password);
    if (!ok) {
      await this.audit.record({ type: 'auth.reauth.failure', severity: 'warning', actorUserId: actor.userId, outcome: 'failure' }, meta);
      throw new ValidationError({ password: 'No es correcta.' }, 'No hemos podido confirmar tu identidad.');
    }
    const until = await this.sessions.elevate(actor.sessionId);
    await this.audit.record({ type: 'auth.reauth.success', actorUserId: actor.userId, outcome: 'success' }, meta);
    return until;
  }

  async changePassword(actor: Actor, newPassword: string, meta: RequestMeta): Promise<number> {
    const passwordHash = await this.newPasswords.validateAndHash(newPassword, Email.of(actor.email), 'newPassword');
    await this.db.identity.user.update({ where: { id: actor.userId }, data: { passwordHash, passwordUpdatedAt: new Date() } });
    const closed = await this.sessions.revokeAllForUser(actor.userId, 'password_change', actor.sessionId);
    await this.notifyPasswordChanged(actor.email);
    await this.audit.record({ type: 'auth.password.changed', severity: 'notice', actorUserId: actor.userId, outcome: 'success', metadata: { sessionsClosed: closed } }, meta);
    return closed;
  }

  async logout(actor: Actor, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(actor.sessionId, 'logout');
    await this.audit.record({ type: 'auth.logout', actorUserId: actor.userId, target: { type: 'session', id: actor.sessionId }, outcome: 'success' }, meta);
  }

  async logoutOthers(actor: Actor, meta: RequestMeta): Promise<number> {
    const closed = await this.sessions.revokeAllForUser(actor.userId, 'logout_all', actor.sessionId);
    await this.audit.record({ type: 'auth.logout_all', severity: 'notice', actorUserId: actor.userId, outcome: 'success', metadata: { sessionsClosed: closed } }, meta);
    return closed;
  }

  assertVerified(actor: Actor): void {
    if (!actor.emailVerified) {
      throw new ForbiddenError('email_not_verified', 'Verifica tu correo para desbloquear esta acción.');
    }
  }

  private async failLogin(email: Email, userId: string | null, meta: RequestMeta): Promise<never> {
    const outcome = await this.throttle.registerFailure(email);
    const locked = outcome.lockedUntil !== null;
    await this.audit.record(
      {
        type: locked ? 'auth.login.locked' : 'auth.login.failure',
        severity: locked ? 'warning' : 'notice',
        actorUserId: userId,
        outcome: 'failure',
        reason: 'invalid_credentials',
        ...(outcome.lockedUntil ? { metadata: { lockedUntil: outcome.lockedUntil.toISOString() } } : {}),
      },
      meta,
    );
    if (outcome.lockedUntil) {
      if (userId) await this.notifyLockout(email, outcome.lockedUntil);
      throw lockedError(outcome.lockedUntil);
    }
    throw new InvalidCredentialsError(outcome.remainingAttempts);
  }

  private async burn(password: string): Promise<false> {
    await this.hasher.burnEquivalentTime(password);
    return false;
  }

  /** Solo casos de uso internos: conserva la misma verificación para altas OIDC pendientes. */
  async sendVerification(userId: string, to: string, firstName: string): Promise<void> {
    const link = await this.emailTokens.issue(userId, 'verify_email');
    await this.mailer.send({
      to,
      subject: 'Confirma tu correo en SecurTex',
      heading: firstName ? `Hola, ${firstName}` : 'Confirma tu correo',
      paragraphs: ['Confirma que este correo es tuyo para empezar a crear proyectos. El enlace caduca en 24 horas y solo funciona una vez.'],
      action: { label: 'Confirmar mi correo', url: link },
      footnote: 'Si no te has registrado en SecurTex, ignora este mensaje.',
    });
  }

  private async notifyPasswordChanged(to: string): Promise<void> {
    await this.mailer.send({
      to,
      subject: 'Tu contraseña de SecurTex ha cambiado',
      heading: 'Contraseña actualizada',
      paragraphs: ['La contraseña de tu cuenta acaba de cambiar y hemos cerrado tus otras sesiones.', 'Si no has sido tú, restablécela de inmediato desde la pantalla de inicio de sesión.'],
    });
  }

  private async notifyLockout(email: Email, until: Date): Promise<void> {
    await this.mailer.send({
      to: email.toString(),
      subject: 'Intentos de acceso bloqueados en tu cuenta',
      heading: 'Hemos pausado los intentos de acceso',
      paragraphs: [`Hemos detectado varios intentos fallidos de iniciar sesión en tu cuenta y la hemos bloqueado por seguridad. Podrás volver a entrar ${formatUntil(until)}; si se repite, el bloqueo será más largo.`, 'Si no has sido tú, te recomendamos cambiar tu contraseña y activar la verificación en dos pasos.'],
    });
  }
}
