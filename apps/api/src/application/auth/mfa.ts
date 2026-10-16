import { Injectable } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { AUTH } from '../../domain/constants';
import { ConflictError, ValidationError } from '../../domain/errors';
import { Databases } from '../../infrastructure/db/databases';
import { SecretBox } from '../../infrastructure/security/secret-box';
import { randomSecret, safeEqual, sha256 } from '../../infrastructure/security/tokens';
import { generateTotpSecret, totpUri, verifyTotp } from '../../infrastructure/security/totp';
import { AuditLog } from '../audit/audit-log';
import type { Actor, RequestMeta } from '../request-meta';

export interface MfaStatus {
  readonly totpEnabled: boolean;
  readonly totpConfirmedAt: Date | null;
  readonly recoveryCodesRemaining: number;
}

export type SecondFactor = { readonly kind: 'totp'; readonly code: string } | { readonly kind: 'recovery'; readonly code: string };

/**
 * Segundo factor TOTP (RFC 6238) con códigos de respaldo de un solo uso (RF-006).
 * El secreto se guarda cifrado con AES-256-GCM ligado al usuario; los códigos
 * de respaldo, solo como hash. Se impide reutilizar un código TOTP ya aceptado.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly db: Databases,
    private readonly box: SecretBox,
    private readonly audit: AuditLog,
  ) {}

  async status(userId: string): Promise<MfaStatus> {
    const methods = await this.db.identity.mfaMethod.findMany({ where: { userId } });
    const totp = methods.find((m) => m.type === 'totp' && m.confirmedAt);
    const recovery = methods.filter((m) => m.type === 'recovery_code' && !m.lastUsedAt).length;
    return { totpEnabled: Boolean(totp), totpConfirmedAt: totp?.confirmedAt ?? null, recoveryCodesRemaining: recovery };
  }

  async isEnabled(userId: string): Promise<boolean> {
    const count = await this.db.identity.mfaMethod.count({ where: { userId, type: 'totp', confirmedAt: { not: null } } });
    return count > 0;
  }

  /** Inicia el alta: genera un secreto sin confirmar y lo devuelve una sola vez. */
  async beginTotpSetup(actor: Actor): Promise<{ readonly otpauthUri: string; readonly qrDataUrl: string; readonly secret: string }> {
    if (await this.isEnabled(actor.userId)) {
      throw new ConflictError('mfa_already_enabled', 'Ya tienes la verificación en dos pasos activada.');
    }
    await this.db.identity.mfaMethod.deleteMany({ where: { userId: actor.userId, type: 'totp', confirmedAt: null } });
    const secret = generateTotpSecret();
    await this.db.identity.mfaMethod.create({
      data: { userId: actor.userId, type: 'totp', label: 'Aplicación autenticadora', secretEncrypted: this.box.seal(secret, actor.userId) },
    });
    const otpauthUri = totpUri(secret, actor.email);
    const qrDataUrl = await toDataURL(otpauthUri, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
    return { otpauthUri, qrDataUrl, secret };
  }

  async confirmTotpSetup(actor: Actor, code: string, meta: RequestMeta): Promise<readonly string[]> {
    const pending = await this.db.identity.mfaMethod.findFirst({ where: { userId: actor.userId, type: 'totp', confirmedAt: null } });
    const secret = pending?.secretEncrypted ? this.box.open(pending.secretEncrypted, actor.userId) : null;
    const step = secret ? verifyTotp(code, secret) : null;
    if (!pending || step === null) throw new ValidationError({ code: 'El código no es correcto. Comprueba la hora de tu dispositivo.' });

    await this.db.identity.mfaMethod.update({
      where: { id: pending.id },
      data: { confirmedAt: new Date(), lastUsedStep: BigInt(step), lastUsedAt: new Date() },
    });
    const codes = await this.replaceRecoveryCodes(actor.userId);
    await this.audit.record({ type: 'auth.mfa.enabled', severity: 'notice', actorUserId: actor.userId, outcome: 'success', metadata: { method: 'totp' } }, meta);
    return codes;
  }

  async disable(actor: Actor, meta: RequestMeta): Promise<void> {
    await this.db.identity.mfaMethod.deleteMany({ where: { userId: actor.userId } });
    await this.audit.record({ type: 'auth.mfa.disabled', severity: 'warning', actorUserId: actor.userId, outcome: 'success' }, meta);
  }

  async regenerateRecoveryCodes(actor: Actor, meta: RequestMeta): Promise<readonly string[]> {
    if (!(await this.isEnabled(actor.userId))) {
      throw new ConflictError('mfa_not_enabled', 'Activa primero la verificación en dos pasos.');
    }
    const codes = await this.replaceRecoveryCodes(actor.userId);
    await this.audit.record({ type: 'auth.mfa.recovery_regenerated', severity: 'notice', actorUserId: actor.userId, outcome: 'success' }, meta);
    return codes;
  }

  /** Verifica un segundo factor. Consume el código de respaldo o el paso TOTP. */
  async verify(userId: string, factor: SecondFactor): Promise<boolean> {
    return factor.kind === 'totp' ? this.verifyTotpFor(userId, factor.code) : this.consumeRecoveryCode(userId, factor.code);
  }

  private async verifyTotpFor(userId: string, code: string): Promise<boolean> {
    const method = await this.db.identity.mfaMethod.findFirst({ where: { userId, type: 'totp', confirmedAt: { not: null } } });
    const secret = method?.secretEncrypted ? this.box.open(method.secretEncrypted, userId) : null;
    if (!method || !secret) return false;
    const step = verifyTotp(code, secret);
    if (step === null) return false;
    // Actualización condicional: dos peticiones simultáneas con el mismo código no pueden ganar ambas.
    const claimed = await this.db.identity.mfaMethod.updateMany({
      where: { id: method.id, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }] },
      data: { lastUsedStep: BigInt(step), lastUsedAt: new Date() },
    });
    return claimed.count === 1;
  }

  private async consumeRecoveryCode(userId: string, raw: string): Promise<boolean> {
    const normalized = raw.replace(/[\s-]/g, '').toLowerCase();
    if (!/^[a-z0-9]{10}$/.test(normalized)) return false;
    const hash = sha256(`recovery:${normalized}`);
    const candidates = await this.db.identity.mfaMethod.findMany({ where: { userId, type: 'recovery_code', lastUsedAt: null } });
    const match = candidates.find((c) => c.codeHash && safeEqual(c.codeHash, hash));
    if (!match) return false;
    const claimed = await this.db.identity.mfaMethod.updateMany({ where: { id: match.id, lastUsedAt: null }, data: { lastUsedAt: new Date() } });
    return claimed.count === 1;
  }

  private async replaceRecoveryCodes(userId: string): Promise<readonly string[]> {
    const codes = Array.from({ length: AUTH.RECOVERY_CODE_COUNT }, () => recoveryCode());
    await this.db.identity.$transaction([
      this.db.identity.mfaMethod.deleteMany({ where: { userId, type: 'recovery_code' } }),
      this.db.identity.mfaMethod.createMany({
        data: codes.map((c) => ({ userId, type: 'recovery_code' as const, codeHash: sha256(`recovery:${c.replace('-', '')}`) })),
      }),
    ]);
    return codes;
  }
}

/** 10 caracteres alfanuméricos en minúscula, mostrados como xxxxx-xxxxx. ≈ 51 bits. */
function recoveryCode(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = Buffer.from(randomSecret(16), 'base64url');
  let out = '';
  for (let i = 0; i < 10; i += 1) out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}
