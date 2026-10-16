import { Injectable } from '@nestjs/common';
import type { EmailTokenPurpose } from '@prisma/client';
import { loadEnv } from '../../config/env';
import { AUTH } from '../../domain/constants';
import { Databases } from '../../infrastructure/db/databases';
import { randomSecret, sha256 } from '../../infrastructure/security/tokens';

const TTL: Readonly<Record<EmailTokenPurpose, number>> = {
  verify_email: AUTH.VERIFY_EMAIL_TTL_MS,
  reset_password: AUTH.RESET_PASSWORD_TTL_MS,
};

const PATH: Readonly<Record<EmailTokenPurpose, string>> = {
  verify_email: '/verificar',
  reset_password: '/nueva-contrasena',
};

/**
 * Tokens de correo de un solo uso (verificación y recuperación). Emitir uno
 * nuevo invalida los anteriores del mismo propósito.
 *
 * El enlace pone el token en el fragmento (`#token=`): el navegador no lo envía
 * al servidor, no aparece en los registros de acceso ni en la cabecera Referer
 * (AGENTS.md frontend §1.4). La página lo lee, lo envía por POST y lo borra de
 * la barra de direcciones.
 */
@Injectable()
export class EmailTokenService {
  private readonly origin = loadEnv().APP_ORIGIN;

  constructor(private readonly db: Databases) {}

  async issue(userId: string, purpose: EmailTokenPurpose): Promise<string> {
    const secret = randomSecret();
    await this.db.identity.$transaction([
      this.db.identity.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
      this.db.identity.emailToken.create({
        data: { userId, purpose, tokenHash: sha256(secret), expiresAt: new Date(Date.now() + TTL[purpose]) },
      }),
    ]);
    return `${this.origin}${PATH[purpose]}#token=${secret}`;
  }

  /** Consume el token de forma atómica. Devuelve el usuario o null. */
  async consume(rawToken: string, purpose: EmailTokenPurpose): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
    const row = await this.db.identity.emailToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date()) return null;
    const claimed = await this.db.identity.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    return claimed.count === 1 ? row.userId : null;
  }

  async lastIssuedAt(userId: string, purpose: EmailTokenPurpose): Promise<Date | null> {
    const row = await this.db.identity.emailToken.findFirst({ where: { userId, purpose }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    return row?.createdAt ?? null;
  }
}
