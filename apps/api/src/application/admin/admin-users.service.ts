import { Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError } from '../../domain/errors';
import { isUuid } from '../../domain/values';
import { Databases } from '../../infrastructure/db/databases';
import { AuditLog } from '../audit/audit-log';
import { SessionService } from '../auth/sessions';
import type { Actor, RequestMeta } from '../request-meta';

/**
 * Gestión de usuarios para administración (F-236, versión mínima): ver y
 * suspender cuentas. Toda acción queda en la auditoría (05-Seguridad §8.1).
 * El administrador NO obtiene acceso al contenido de los proyectos: ese rol
 * de base de datos ni siquiera puede leer las tablas de archivos.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly db: Databases,
    private readonly sessions: SessionService,
    private readonly audit: AuditLog,
  ) {}

  async list(query: string | undefined) {
    const q = query?.trim().slice(0, 80);
    const users = await this.db.identity.user.findMany({
      where: q ? { OR: [{ primaryEmail: { contains: q, mode: 'insensitive' } }, { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } : {},
      select: {
        id: true, primaryEmail: true, firstName: true, lastName: true, status: true, isSystemAdmin: true,
        emailVerifiedAt: true, lastLoginAt: true, createdAt: true,
        mfaMethods: { where: { type: 'totp', confirmedAt: { not: null } }, select: { id: true } },
        sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return users.map(({ mfaMethods, sessions, ...u }) => ({ ...u, mfaEnabled: mfaMethods.length > 0, activeSessions: sessions.length }));
  }

  async setSuspended(actor: Actor, userId: string, suspended: boolean, meta: RequestMeta): Promise<void> {
    if (!isUuid(userId)) throw new NotFoundError();
    if (userId === actor.userId) throw new ConflictError('self_suspend', 'No puedes suspender tu propia cuenta.');
    const user = await this.db.identity.user.findUnique({ where: { id: userId }, select: { status: true, emailVerifiedAt: true } });
    if (!user || user.status === 'deleted') throw new NotFoundError();
    const status = suspended ? 'suspended' : user.emailVerifiedAt ? 'active' : 'pending';
    await this.db.identity.user.update({ where: { id: userId }, data: { status } });
    // Suspender corta las sesiones al instante; la siguiente petición ya es 401.
    const closed = suspended ? await this.sessions.revokeAllForUser(userId, 'user_revoked') : 0;
    await this.audit.record({
      type: suspended ? 'admin.user.suspended' : 'admin.user.reactivated',
      severity: 'warning', actorUserId: actor.userId, target: { type: 'user', id: userId }, outcome: 'success',
      metadata: { sessionsClosed: closed },
    }, meta);
  }
}
