import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../../config/env';
import { IntegrityError } from '../../domain/errors';
import { toBytes, type Bytes } from './tokens';

/**
 * Cifrado de archivos en reposo · capas C3 y C4 (securtex-docs ·
 * 14-Criptografia-Multicapa, ADR-0005 y ADR-0010).
 *
 *   clave maestra ──AES-256-KW──▶ KEK del proyecto ──AES-256-KW──▶ DEK del archivo
 *                                         │
 *                                         └─HKDF-SHA-256──▶ clave HMAC (C4)
 *
 *   contenido ──AES-256-GCM(DEK, nonce 96 bits, AAD = proyecto‖archivo‖versión)──▶ cifrado
 *   HMAC-SHA-256(nonce ‖ cifrado ‖ AAD) ──▶ se verifica ANTES de descifrar (RS-075)
 *
 * Reglas que no se negocian (AGENTS.md §1.10, §1.11):
 *  · Claves envueltas con AES-KW (determinista, sin nonce); datos con AES-GCM.
 *  · Nonce aleatorio y nuevo en cada cifrado: cada escritura usa una DEK nueva.
 *  · La KEK, la DEK y la clave HMAC se sobrescriben con ceros al terminar.
 *  · Si el HMAC no coincide, no se descifra: se lanza IntegrityError.
 *
 * ⚠️ La clave maestra vive en Vault Transit en producción; aquí se lee de
 * FILES_MASTER_KEY como sustituto de desarrollo.
 */

/** Vector inicial por defecto de RFC 3394. */
const KW_IV = Buffer.from('A6A6A6A6A6A6A6A6', 'hex');
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAC_INFO = 'securtex/c4/file-mac/v1';

export interface FileAad {
  readonly projectId: string;
  readonly fileId: string;
  readonly version: number;
}

export interface SealedFile {
  readonly wrappedDek: Bytes;
  readonly nonce: Bytes;
  readonly ciphertext: Bytes;
  readonly mac: Bytes;
}

function aadBytes(aad: FileAad): Buffer {
  // Separador fuera del alfabeto de los UUID: no hay ambigüedad al concatenar.
  return Buffer.from(`${aad.projectId}‖${aad.fileId}‖${aad.version}`, 'utf8');
}

function wrap(kek: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('id-aes256-wrap', kek, KW_IV);
  return Buffer.concat([cipher.update(key), cipher.final()]);
}

function unwrap(kek: Buffer, wrapped: Uint8Array): Buffer {
  try {
    const decipher = createDecipheriv('id-aes256-wrap', kek, KW_IV);
    return Buffer.concat([decipher.update(wrapped), decipher.final()]);
  } catch {
    // AES-KW comprueba su propio valor de integridad: una clave alterada no se desenvuelve.
    throw new IntegrityError('key_unwrap');
  }
}

function macOf(macKey: Buffer, nonce: Uint8Array, ciphertext: Uint8Array, aad: Buffer): Buffer {
  return createHmac('sha256', macKey).update(nonce).update(ciphertext).update(aad).digest();
}

function zero(...buffers: Buffer[]): void {
  for (const b of buffers) b.fill(0);
}

@Injectable()
export class FileCrypto {
  private readonly master = Buffer.from(loadEnv().FILES_MASTER_KEY, 'base64');

  /** Genera la KEK de un proyecto nuevo y la devuelve envuelta. La KEK en claro nunca sale de aquí. */
  newProjectKey(): Bytes {
    const kek = randomBytes(KEY_BYTES);
    try {
      return toBytes(wrap(this.master, kek));
    } finally {
      zero(kek);
    }
  }

  seal(wrappedKek: Uint8Array, aad: FileAad, plaintext: string): SealedFile {
    const kek = unwrap(this.master, wrappedKek);
    const macKey = Buffer.from(hkdfSync('sha256', kek, Buffer.alloc(0), MAC_INFO, KEY_BYTES));
    const dek = randomBytes(KEY_BYTES);
    const nonce = randomBytes(NONCE_BYTES);
    const ad = aadBytes(aad);
    try {
      const cipher = createCipheriv('aes-256-gcm', dek, nonce);
      cipher.setAAD(ad);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
      return {
        wrappedDek: toBytes(wrap(kek, dek)),
        nonce: toBytes(nonce),
        ciphertext: toBytes(ciphertext),
        mac: toBytes(macOf(macKey, nonce, ciphertext, ad)),
      };
    } finally {
      zero(kek, macKey, dek);
    }
  }

  /** C4 primero (HMAC en tiempo constante), C3 después (AES-GCM con su etiqueta y la AAD). */
  open(wrappedKek: Uint8Array, aad: FileAad, sealed: SealedFile): string {
    const kek = unwrap(this.master, wrappedKek);
    const macKey = Buffer.from(hkdfSync('sha256', kek, Buffer.alloc(0), MAC_INFO, KEY_BYTES));
    const ad = aadBytes(aad);
    let dek: Buffer | null = null;
    try {
      const expected = macOf(macKey, sealed.nonce, sealed.ciphertext, ad);
      if (sealed.mac.length !== expected.length || !timingSafeEqual(expected, sealed.mac)) throw new IntegrityError('mac');
      dek = unwrap(kek, sealed.wrappedDek);
      const body = sealed.ciphertext.subarray(0, sealed.ciphertext.length - TAG_BYTES);
      const tag = sealed.ciphertext.subarray(sealed.ciphertext.length - TAG_BYTES);
      const decipher = createDecipheriv('aes-256-gcm', dek, sealed.nonce);
      decipher.setAAD(ad);
      decipher.setAuthTag(tag);
      try {
        return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
      } catch {
        throw new IntegrityError('gcm_tag');
      }
    } finally {
      zero(kek, macKey, ...(dek ? [dek] : []));
    }
  }
}
