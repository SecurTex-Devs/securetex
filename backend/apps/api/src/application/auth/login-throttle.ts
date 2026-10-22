import { Injectable } from '@nestjs/common';
import { AUTH } from '../../domain/constants';
import { RateLimitedError } from '../../domain/errors';
import type { Email } from '../../domain/values';
import { Databases } from '../../infrastructure/db/databases';
import { FieldCipher } from '../../infrastructure/security/field-cipher';

export interface FailureOutcome {
  /** Fin del bloqueo que acaba de empezar, o null si aún quedan intentos. */
  readonly lockedUntil: Date | null;
  /** Solo se informa cuando quedan pocos intentos, como en P-04. */
  readonly remainingAttempts: number | null;
}

/**
 * Bloqueo por cuenta (RF-009, T-A01), decidido y aplicado por PostgreSQL
 * (migración s5): umbrales, ventana y bloqueo escalonado viven en funciones
 * SECURITY DEFINER, y el rol de la API no puede leer, poner a cero ni borrar
 * login_throttle. Un trigger en sessions impide además crear una sesión para
 * una cuenta bloqueada por cualquier camino, también con acceso directo a la
 * base con las credenciales de la API.
 *
 * La clave es el índice ciego del correo, exista la cuenta o no: el contador se
 * comporta igual para un correo inventado y no sirve para enumerar (T-A09). El
 * límite por IP lo aplica además el ThrottlerGuard antes de llegar aquí.
 */
@Injectable()
export class LoginThrottle {
  constructor(
    private readonly db: Databases,
    private readonly cipher: FieldCipher,
  ) {}

  async assertNotLocked(email: Email): Promise<void> {
    const [row] = await this.db.identity.$queryRaw<Array<{ until: Date | null }>>`
      SELECT auth_login_locked_until(${this.key(email)}) AS until`;
    if (row?.until) throw lockedError(row.until);
  }

  async registerFailure(email: Email): Promise<FailureOutcome> {
    const [row] = await this.db.identity.$queryRaw<Array<{ remaining: number; locked_until: Date | null }>>`
      SELECT remaining, locked_until FROM auth_register_login_failure(${this.key(email)})`;
    const remaining = row?.remaining ?? 0;
    return {
      lockedUntil: row?.locked_until ?? null,
      remainingAttempts: !row?.locked_until && remaining <= AUTH.LOGIN_WARN_WHEN_REMAINING ? remaining : null,
    };
  }

  /** Acierto: pone a cero el contador; la base no deja que quite un bloqueo vigente. */
  async registerSuccess(email: Email): Promise<void> {
    await this.db.identity.$executeRaw`SELECT auth_register_login_success(${this.key(email)})`;
  }

  /** Para informar del plazo cuando el trigger de sesiones rechaza una cuenta bloqueada. */
  async lockedUntilForUser(userId: string): Promise<Date | null> {
    const [row] = await this.db.identity.$queryRaw<Array<{ until: Date | null }>>`
      SELECT auth_user_locked_until(${userId}::uuid) AS until`;
    return row?.until ?? null;
  }

  private key(email: Email): Buffer {
    // El mismo índice ciego que users.email_index: así el trigger de sesiones
    // relaciona el bloqueo con la cuenta sin que la base conozca el correo.
    return Buffer.from(this.cipher.emailIndex(email.toString()), 'hex');
  }
}

/** «Hasta las 14:30» si es hoy; si no, con la fecha. Hora de Ecuador, como el resto de la interfaz. */
export function lockedError(until: Date): RateLimitedError {
  const seconds = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  return new RateLimitedError(
    seconds,
    'account_locked',
    `Hemos bloqueado el acceso a esta cuenta por seguridad tras varios intentos fallidos. Podrás volver a intentarlo ${formatUntil(until)}.`,
  );
}

export function formatUntil(until: Date): string {
  const zone = 'America/Guayaquil';
  const day = (d: Date) => d.toLocaleDateString('es-EC', { timeZone: zone });
  const time = until.toLocaleTimeString('es-EC', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return day(until) === day(new Date()) ? `a partir de las ${time}` : `el ${day(until)} a partir de las ${time}`;
}
