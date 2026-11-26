import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { loadEnv } from '../../config/env';
import { DEMO } from '../../domain/demo';
import { NotFoundError } from '../../domain/errors';
import { asUserId } from '../../domain/values';
import { Databases } from '../../infrastructure/db/databases';
import { FieldCipher } from '../../infrastructure/security/field-cipher';
import { AuditLog } from '../audit/audit-log';
import { SessionService } from '../auth/sessions';
import type { RequestMeta } from '../request-meta';
import { DemoLimits } from './demo-limits';

@Injectable()
export class DemoService {
  constructor(
    private readonly db: Databases,
    private readonly cipher: FieldCipher,
    private readonly sessions: SessionService,
    private readonly limits: DemoLimits,
    private readonly audit: AuditLog,
  ) {}

  async start(meta: RequestMeta) {
    if (!loadEnv().DEMO_ENABLED) throw new NotFoundError();
    this.limits.start(meta.ip);
    const email = DEMO.GUEST_EMAILS[randomInt(DEMO.GUEST_EMAILS.length)];
    if (!email) throw new NotFoundError();
    const user = await this.db.identity.user.findUnique({ where: { emailIndex: this.cipher.emailIndex(email) } });
    if (!user || user.isSystemAdmin || user.passwordHash || user.status !== 'active' || !user.emailVerifiedAt) throw new NotFoundError();
    const projects = await this.db.asUser(asUserId(user.id), (tx) => tx.project.findMany({
      where: { trashedAt: null, members: { some: { userId: user.id, role: 'editor', revokedAt: null } } },
      select: { id: true }, take: 2,
    }));
    const project = projects[0];
    if (projects.length !== 1 || !project) throw new NotFoundError();
    const session = await this.sessions.create(user, `demo:${project.id}`, false, meta);
    await this.audit.record({ type: 'auth.demo.started', actorUserId: user.id, target: { type: 'session', id: session.sessionId }, outcome: 'success' }, meta);
    return { session, projectId: project.id };
  }
}
