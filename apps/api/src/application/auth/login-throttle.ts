import { Injectable } from '@nestjs/common';
import { AUTH } from '../../domain/constants';
import { RateLimitedError } from '../../domain/errors';
import type { Email } from '../../domain/values';
import { Databases } from '../../infrastructure/db/databases';
import { sha256, type Bytes } from '../../infrastructure/security/tokens';

export interface FailureOutcome {
  readonly locked: boolean;
  /** Solo se informa cuando quedan pocos intentos, como en P-04. */
  readonly remainingAttempts: number | null;
}

/**
 * Bloqueo por cuenta (RF-009, T-A01). La clave es el hash del correo, exista
 * la cuenta o no: el contador se comporta igual para un correo inventado, así
 * que el bloqueo no sirve para enumerar cuentas (T-A09). El límite por IP lo
 * aplica además el ThrottlerGuard antes de llegar aquí.
 */
@Injectable()
export class LoginThrottle {
  constructor(private readonly db: Databases) {}

  async assertNotLocked(email: Email): Promise<void> {
    const row = await this.db.identity.loginThrottle.findUnique({ where: { keyHash: this.key(email) } });
    if (row?.lockedUntil && row.lockedUntil > new Date()) {
      const seconds = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 1000);
      throw new RateLimitedError(
        seconds,
        'account_locked',
        'Hemos pausado los intentos de acceso a esta cuenta durante unos minutos por seguridad.',
      );
    }
  }

  async registerFailure(email: Email): Promise<FailureOutcome> {
    const keyHash = this.key(email);
    const now = new Date();
    const windowStart = new Date(now.getTime() - AUTH.LOGIN_WINDOW_MS);
    const row = await this.db.identity.loginThrottle.findUnique({ where: { keyHash } });
    const fresh = !row || row.windowStartedAt < windowStart;
    const failedCount = fresh ? 1 : row.failedCount + 1;
    const locked = failedCount >= AUTH.LOGIN_LOCK_AFTER_FAILURES;
    const data = {
      failedCount: locked ? 0 : failedCount,
      windowStartedAt: fresh ? now : row.windowStartedAt,
      lockedUntil: locked ? new Date(now.getTime() + AUTH.LOGIN_LOCK_MS) : null,
    };
    await this.db.identity.loginThrottle.upsert({ where: { keyHash }, create: { keyHash, ...data }, update: data });
    const remaining = AUTH.LOGIN_LOCK_AFTER_FAILURES - failedCount;
    return {
      locked,
      remainingAttempts: !locked && failedCount >= AUTH.LOGIN_WARN_AFTER_FAILURES ? remaining : null,
    };
  }

  async reset(email: Email): Promise<void> {
    await this.db.identity.loginThrottle.deleteMany({ where: { keyHash: this.key(email) } });
  }

  private key(email: Email): Bytes {
    return sha256(`login:${email.toString()}`);
  }
}
