import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ARGON2 } from '../../domain/constants';

const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: ARGON2.MEMORY_KIB,
  timeCost: ARGON2.TIME_COST,
  parallelism: ARGON2.PARALLELISM,
  hashLength: ARGON2.HASH_LENGTH,
} as const;

/**
 * Hash de contraseñas con Argon2id (RS-001). Incluye un semáforo que limita
 * los hashes simultáneos: sin él, una ráfaga de inicios de sesión agotaría la
 * memoria del servidor (T-A10). El rate limiting se aplica ANTES de llegar aquí.
 */
@Injectable()
export class PasswordHasher {
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  private dummyHash: Promise<string> | undefined;

  async hash(password: string): Promise<string> {
    return this.limited(() => argon2.hash(password, OPTIONS));
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return this.limited(async () => {
      try {
        return await argon2.verify(hash, password);
      } catch {
        // Un hash corrupto equivale a una contraseña incorrecta (fail closed).
        return false;
      }
    });
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }

  /**
   * Verifica contra un hash ficticio cuando la cuenta no existe, para que el
   * tiempo de respuesta no revele si un correo está registrado (T-A09).
   */
  async burnEquivalentTime(password: string): Promise<void> {
    this.dummyHash ??= argon2.hash('securtex-timing-equalizer', OPTIONS);
    await this.verify(await this.dummyHash, password);
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= ARGON2.MAX_CONCURRENT) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running += 1;
    try {
      return await task();
    } finally {
      this.running -= 1;
      this.waiting.shift()?.();
    }
  }
}
