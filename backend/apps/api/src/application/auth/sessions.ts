import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { loadEnv } from '../../config/env';
import { DEMO, demoProjectId, isDemoEmail } from '../../domain/demo';
import { AUTH } from '../../domain/constants';
import { UnauthorizedError } from '../../domain/errors';
import { Databases } from '../../infrastructure/db/databases';
import { AccessTokenService } from '../../infrastructure/security/access-tokens';
import { anonymizeIp, deviceLabel, hashUserAgent } from '../../infrastructure/security/client-info';
import { FIELD, FieldCipher } from '../../infrastructure/security/field-cipher';
import { Mailer } from '../../infrastructure/mail/mailer';
import {
  formatCompositeToken,
  parseCompositeToken,
  randomSecret,
  secretMatches,
  sha256,
} from '../../infrastructure/security/tokens';
import { AuditLog } from '../audit/audit-log';
import type { Actor, RequestMeta } from '../request-meta';
import { lockedError } from './login-throttle';

export interface IssuedSession {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
  readonly remember: boolean;
  readonly expiresAt: Date;
}

export type RevokeReason =
  | 'logout'
  | 'logout_all'
  | 'rotation_reuse'
  | 'password_change'
  | 'user_revoked'
  | 'account_deleted';

/**
 * Ciclo de vida de la sesión (05-Seguridad §8.2):
 * · Cada inicio de sesión crea identificadores nuevos (sin fijación, T-A04).
 * · El refresh token rota en cada uso; ver de nuevo uno ya rotado revoca la
 *   sesión entera y alerta (RS-002, RS-003, T-A12).
 * · El token CSRF sincronizador queda ligado a la sesión.
 * · La revocación es inmediata: cada petición comprueba la sesión en BD.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly db: Databases,
    private readonly tokens: AccessTokenService,
    private readonly audit: AuditLog,
    private readonly cipher: FieldCipher,
    private readonly mailer: Mailer,
  ) {}

  async create(user: Pick<User, 'id'>, authMethod: string, remember: boolean, meta: RequestMeta): Promise<IssuedSession> {
    const now = Date.now();
    const demo = demoProjectId(authMethod) !== null;
    if (demo) remember = false;
    const ttl = demo ? DEMO.SESSION_TTL_MS : remember ? AUTH.SESSION_REMEMBER_TTL_MS : AUTH.SESSION_DEFAULT_TTL_MS;
    const csrfToken = randomSecret();
    const uaHash = hashUserAgent(meta.userAgent);
    const [knownDevice, anyBefore] = await Promise.all([
      this.db.identity.session.count({ where: { userId: user.id, userAgentHash: uaHash } }),
      this.db.identity.session.count({ where: { userId: user.id } }),
    ]);
    const session = await this.db.identity.session
      .create({
        data: {
          userId: user.id,
          csrfHash: sha256(csrfToken),
          ipPrefix: this.cipher.encrypt(anonymizeIp(meta.ip), FIELD.sessionIp),
          userAgentHash: uaHash,
          deviceLabel: this.cipher.encrypt(deviceLabel(meta.userAgent), FIELD.sessionDevice),
          authMethod,
          remember,
          // Acabar de autenticarse cuenta como reautenticación reciente (RS-006).
          elevatedUntil: demo ? null : new Date(now + AUTH.ELEVATION_TTL_MS),
          idleExpiresAt: new Date(now + AUTH.SESSION_IDLE_TTL_MS),
          expiresAt: new Date(now + ttl),
        },
      })
      .catch((e: unknown) => this.rejectedByGuard(user.id, e));
    await this.db.identity.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(now) } });
    const refreshToken = await this.newRefreshToken(session.id, session.expiresAt);
    const accessToken = await this.tokens.issue({ userId: user.id, sessionId: session.id });
    // Primer acceso desde este navegador (y no es la primera sesión de la cuenta): se avisa al titular.
    if (!demo && knownDevice === 0 && anyBefore > 0) await this.notifyNewDevice(user.id, deviceLabel(meta.userAgent));
    return { sessionId: session.id, accessToken, refreshToken, csrfToken, remember, expiresAt: session.expiresAt };
  }

  /**
   * El trigger sessions_account_guard (migración s5) rechaza en la propia base
   * las sesiones de cuentas bloqueadas, suspendidas o borradas, llegue por
   * contraseña, segundo factor u OIDC. Aquí solo se traduce a un error de dominio.
   */
  private async rejectedByGuard(userId: string, e: unknown): Promise<never> {
    const message = e instanceof Error ? e.message : '';
    if (/account_locked/.test(message)) {
      const [row] = await this.db.identity.$queryRaw<Array<{ until: Date | null }>>`
        SELECT auth_user_locked_until(${userId}::uuid) AS until`;
      throw lockedError(row?.until ?? new Date(Date.now() + AUTH.LOCK_FALLBACK_RETRY_MS));
    }
    if (/account_unavailable/.test(message)) throw new UnauthorizedError('account_unavailable');
    throw e;
  }

  private async notifyNewDevice(userId: string, device: string): Promise<void> {
    const u = await this.db.identity.user.findUnique({ where: { id: userId }, select: { primaryEmail: true } });
    if (!u) return;
    await this.mailer.send({
      to: this.cipher.decrypt(u.primaryEmail, FIELD.userEmail),
      subject: 'Nuevo inicio de sesión en tu cuenta de SecurTex',
      heading: 'Nuevo inicio de sesión',
      paragraphs: [
        `Se ha iniciado sesión en tu cuenta desde un dispositivo nuevo: ${device}.`,
        'Si has sido tú, no tienes que hacer nada. Si no, cambia tu contraseña y cierra las demás sesiones desde Ajustes → Seguridad.',
      ],
    });
  }

  /** Rota el refresh token. Lanza 401 si no es válido; revoca la familia si se reutiliza. */
  async rotate(rawRefresh: string | undefined, meta: RequestMeta): Promise<Omit<IssuedSession, 'csrfToken'>> {
    const parsed = parseCompositeToken(rawRefresh);
    if (!parsed) throw new UnauthorizedError('refresh_invalid');
    const row = await this.db.identity.refreshToken.findUnique({ where: { id: parsed.id }, include: { session: true } });
    if (!row || !secretMatches(parsed.secret, row.tokenHash)) throw new UnauthorizedError('refresh_invalid');

    const { session } = row;
    if (row.usedAt) await this.handleReuse(row.usedAt, session.id, session.userId, meta);
    if (session.revokedAt || session.expiresAt <= new Date() || row.expiresAt <= new Date()) {
      throw new UnauthorizedError('session_expired');
    }

    const claimed = await this.db.identity.refreshToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    // Otra petición lo rotó en el mismo instante: se trata como carrera, no como robo.
    if (claimed.count === 0) throw new UnauthorizedError('refresh_superseded');

    const refreshToken = await this.newRefreshToken(session.id, session.expiresAt);
    const accessToken = await this.tokens.issue({ userId: session.userId, sessionId: session.id });
    return { sessionId: session.id, accessToken, refreshToken, remember: session.remember, expiresAt: session.expiresAt };
  }

  /**
   * Un token ya rotado vuelve a aparecer. Dentro del margen de gracia es casi
   * seguro una carrera entre pestañas; fuera de él, alguien tiene una copia
   * robada: se invalida toda la familia y se alerta (RS-003).
   */
  private async handleReuse(usedAt: Date, sessionId: string, userId: string, meta: RequestMeta): Promise<never> {
    if (Date.now() - usedAt.getTime() < AUTH.REFRESH_GRACE_MS) throw new UnauthorizedError('refresh_superseded');
    await this.revoke(sessionId, 'rotation_reuse');
    await this.audit.record(
      {
        type: 'auth.refresh.reuse_detected',
        severity: 'critical',
        actorUserId: userId,
        target: { type: 'session', id: sessionId },
        outcome: 'denied',
        reason: 'refresh_token_reuse',
      },
      meta,
    );
    throw new UnauthorizedError('session_compromised', 'Hemos cerrado esta sesión por seguridad. Vuelve a iniciar sesión.');
  }

  /** Resuelve la persona que hace la petición a partir del access token. */
  async authenticate(accessToken: string | undefined): Promise<Actor | null> {
    if (!accessToken) return null;
    const claims = await this.tokens.verify(accessToken);
    if (!claims) return null;
    const session = await this.db.identity.session.findUnique({
      where: { id: claims.sessionId },
      include: { user: { select: { id: true, primaryEmail: true, emailVerifiedAt: true, isSystemAdmin: true, status: true } } },
    });
    const now = new Date();
    if (!session || session.userId !== claims.userId || session.revokedAt) return null;
    if (session.expiresAt <= now || session.idleExpiresAt <= now) return null;
    if (session.user.status === 'suspended' || session.user.status === 'deleted') return null;
    const email = this.cipher.decrypt(session.user.primaryEmail, FIELD.userEmail);
    const scope = demoProjectId(session.authMethod);
    const demo = scope !== null;
    if (demo && (!loadEnv().DEMO_ENABLED || !isDemoEmail(email) || session.user.isSystemAdmin)) return null;
    if (isDemoEmail(email) && !demo) return null;
    await this.touch(session.id, session.lastSeenAt, now);
    return {
      userId: session.user.id,
      sessionId: session.id,
      email,
      emailVerified: session.user.emailVerifiedAt !== null,
      isSystemAdmin: session.user.isSystemAdmin,
      elevatedUntil: session.elevatedUntil,
      isDemo: demo,
      ...(scope ? { demoProjectId: scope } : {}),
    };
  }

  /**
   * Para conexiones de larga duración (WebSocket): la sesión sigue viva, no
   * revocada ni caducada, y la cuenta no está suspendida. No exige el access
   * token, que caduca a los 10 min aunque la sesión continúe.
   */
  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const s = await this.db.identity.session.findUnique({ where: { id: sessionId }, select: { userId: true, revokedAt: true, expiresAt: true, idleExpiresAt: true, user: { select: { status: true } } } });
    const now = new Date();
    return s !== null && s.userId === userId && !s.revokedAt && s.expiresAt > now && s.idleExpiresAt > now && s.user.status !== 'suspended' && s.user.status !== 'deleted';
  }

  async verifyCsrf(sessionId: string, token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const session = await this.db.identity.session.findUnique({ where: { id: sessionId }, select: { csrfHash: true } });
    return session !== null && secretMatches(token, session.csrfHash);
  }

  async elevate(sessionId: string): Promise<Date> {
    const until = new Date(Date.now() + AUTH.ELEVATION_TTL_MS);
    await this.db.identity.session.update({ where: { id: sessionId }, data: { elevatedUntil: until } });
    return until;
  }

  async revoke(sessionId: string, reason: RevokeReason): Promise<void> {
    await this.db.identity.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: RevokeReason, exceptSessionId?: string): Promise<number> {
    const result = await this.db.identity.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  private async newRefreshToken(sessionId: string, expiresAt: Date): Promise<string> {
    const secret = randomSecret();
    const row = await this.db.identity.refreshToken.create({
      data: { sessionId, tokenHash: sha256(secret), expiresAt },
      select: { id: true },
    });
    return formatCompositeToken(row.id, secret);
  }

  /** Actualiza la última actividad como mucho una vez por minuto para no escribir en cada petición. */
  private async touch(sessionId: string, lastSeenAt: Date, now: Date): Promise<void> {
    if (now.getTime() - lastSeenAt.getTime() < 60_000) return;
    await this.db.identity.session.update({
      where: { id: sessionId },
      data: { lastSeenAt: now, idleExpiresAt: new Date(now.getTime() + AUTH.SESSION_IDLE_TTL_MS) },
    });
  }
}
