import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadEnv } from '../../config/env';
import { toBytes, type Bytes } from './tokens';

const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Cifrado autenticado de secretos pequeños en reposo (secretos TOTP):
 * AES-256-GCM, nonce aleatorio de 96 bits por operación y AAD ligada al
 * propietario, de modo que un secreto copiado a otra fila no descifra.
 *
 * Formato: versión(1) ‖ nonce(12) ‖ etiqueta(16) ‖ cifrado.
 *
 * ⚠️ En producción la clave vive en Vault Transit (ADR-0005). Aquí se lee de
 * MFA_ENCRYPTION_KEY como sustituto de desarrollo.
 */
@Injectable()
export class SecretBox {
  private readonly key = Buffer.from(loadEnv().MFA_ENCRYPTION_KEY, 'base64');

  seal(plaintext: string, aad: string): Bytes {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return toBytes(Buffer.concat([Buffer.from([VERSION]), nonce, cipher.getAuthTag(), ciphertext]));
  }

  /**
   * Devuelve el texto solo si la etiqueta es válida. `final()` lanza ante
   * cualquier manipulación y el texto parcial nunca sale de esta función (RS-075).
   */
  open(sealed: Uint8Array, aad: string): string | null {
    const buf = Buffer.from(sealed);
    if (buf.length < 1 + NONCE_BYTES + TAG_BYTES || buf[0] !== VERSION) return null;
    const nonce = buf.subarray(1, 1 + NONCE_BYTES);
    const tag = buf.subarray(1 + NONCE_BYTES, 1 + NONCE_BYTES + TAG_BYTES);
    const ciphertext = buf.subarray(1 + NONCE_BYTES + TAG_BYTES);
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    } catch {
      return null;
    }
  }
}
