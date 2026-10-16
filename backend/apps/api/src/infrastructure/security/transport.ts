import { Injectable } from '@nestjs/common';
import {
  createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes,
  type KeyObject,
} from 'node:crypto';
import { loadEnv } from '../../config/env';
import { IntegrityError, ValidationError } from '../../domain/errors';

/**
 * Capas C1 y C2 de 14-Criptografia-Multicapa, lado servidor.
 *
 *   C1 · AES-256-GCM con una DEK aleatoria por mensaje (o por conexión).
 *   C2 · sobre híbrido: X25519 (ECDH) → HKDF-SHA-256 → ChaCha20-Poly1305,
 *        que envuelve la DEK y el bloque C1. Algoritmo distinto de AES a
 *        propósito: si apareciera una debilidad en uno, el otro sigue en pie.
 *
 * TLS protege el canal; esto protege la carga útil aunque TLS termine antes
 * del servicio (balanceador, CDN, proxy de Next).
 */

const KEY_BYTES = 32;
const GCM_NONCE = 12;
const TAG = 16;
/** Prefijo DER de una clave pública X25519 en SPKI: lo que hay delante de los 32 bytes crudos. */
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');

export interface Envelope {
  readonly v: 1;
  /** Clave pública X25519 efímera del emisor (32 bytes, base64url). */
  readonly epk: string;
  readonly n1: string;
  /** DEK de C1 sellada con ChaCha20-Poly1305 (incluye la etiqueta). */
  readonly wdek: string;
  readonly n2: string;
  /** Bloque C1 (nonce GCM ‖ cifrado ‖ etiqueta) sellado con ChaCha20-Poly1305. */
  readonly body: string;
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const unb64 = (s: unknown, len?: number): Buffer => {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw new ValidationError({ envelope: 'Sobre mal formado.' }, 'Sobre cifrado mal formado.');
  const out = Buffer.from(s, 'base64url');
  if (len !== undefined && out.length !== len) throw new ValidationError({ envelope: 'Sobre mal formado.' }, 'Sobre cifrado mal formado.');
  return out;
};

export function rawToX25519(raw: Uint8Array): KeyObject {
  if (raw.length !== KEY_BYTES) throw new ValidationError({ key: 'Clave X25519 inválida.' }, 'Clave pública inválida.');
  return createPublicKey({ key: Buffer.concat([X25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
}

export function x25519Raw(key: KeyObject): Buffer {
  return (key.export({ format: 'der', type: 'spki' }) as Buffer).subarray(X25519_SPKI_PREFIX.length);
}

function chachaSeal(key: Buffer, nonce: Buffer, plain: Uint8Array, aad: Buffer): Buffer {
  const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: TAG });
  c.setAAD(aad, { plaintextLength: plain.length });
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}

function chachaOpen(key: Buffer, nonce: Buffer, sealed: Buffer, aad: Buffer, stage: string): Buffer {
  if (sealed.length < TAG) throw new IntegrityError(stage);
  const d = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: TAG });
  d.setAAD(aad, { plaintextLength: sealed.length - TAG });
  d.setAuthTag(sealed.subarray(sealed.length - TAG));
  try {
    return Buffer.concat([d.update(sealed.subarray(0, sealed.length - TAG)), d.final()]);
  } catch {
    // Etiqueta Poly1305 inválida: manipulación o clave equivocada. Nada se devuelve.
    throw new IntegrityError(stage);
  }
}

/** C1 · AES-256-GCM. Devuelve nonce ‖ cifrado ‖ etiqueta. */
export function gcmSeal(dek: Buffer, plain: Uint8Array, aad: Buffer): Buffer {
  const nonce = randomBytes(GCM_NONCE);
  const c = createCipheriv('aes-256-gcm', dek, nonce, { authTagLength: TAG });
  c.setAAD(aad);
  return Buffer.concat([nonce, c.update(plain), c.final(), c.getAuthTag()]);
}

export function gcmOpen(dek: Buffer, block: Buffer, aad: Buffer, stage = 'c1_tag'): Buffer {
  if (block.length < GCM_NONCE + TAG) throw new IntegrityError(stage);
  const d = createDecipheriv('aes-256-gcm', dek, block.subarray(0, GCM_NONCE), { authTagLength: TAG });
  d.setAAD(aad);
  d.setAuthTag(block.subarray(block.length - TAG));
  try {
    return Buffer.concat([d.update(block.subarray(GCM_NONCE, block.length - TAG)), d.final()]);
  } catch {
    throw new IntegrityError(stage);
  }
}

function hkdf(ikm: Buffer, salt: Buffer, info: string, length: number): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf8'), length));
}

/** Contexto que ata cada sobre a su proyecto y a su uso: un sobre no se puede reutilizar en otro sitio. */
export const envelopeContext = (projectId: string, purpose: string) => `securtex:c2:v1:${projectId}:${purpose}`;

@Injectable()
export class TransportCrypto {
  private readonly privateKey: KeyObject;
  readonly publicKeyRaw: Buffer;

  constructor() {
    this.privateKey = createPrivateKey({ key: Buffer.from(loadEnv().TRANSPORT_PRIVATE_KEY, 'base64'), format: 'der', type: 'pkcs8' });
    if (this.privateKey.asymmetricKeyType !== 'x25519') throw new Error('TRANSPORT_PRIVATE_KEY debe ser una clave X25519');
    this.publicKeyRaw = x25519Raw(createPublicKey(this.privateKey));
  }

  /** Abre un sobre dirigido al servicio: C2 (X25519+HKDF+ChaCha20-Poly1305) y después C1 (AES-256-GCM). */
  open(raw: unknown, context: string): Buffer {
    const env = raw as Partial<Envelope> | null;
    if (!env || env.v !== 1) throw new ValidationError({ envelope: 'Sobre mal formado.' }, 'Sobre cifrado mal formado.');
    const epk = unb64(env.epk, KEY_BYTES);
    const shared = diffieHellman({ privateKey: this.privateKey, publicKey: rawToX25519(epk) });
    const wrapKey = hkdf(shared, Buffer.concat([epk, this.publicKeyRaw]), context, KEY_BYTES);
    const aad = Buffer.from(context, 'utf8');
    let dek: Buffer | undefined;
    try {
      dek = chachaOpen(wrapKey, unb64(env.n1, 12), unb64(env.wdek), aad, 'c2_dek');
      const block = chachaOpen(wrapKey, unb64(env.n2, 12), unb64(env.body), aad, 'c2_body');
      return gcmOpen(dek, block, aad);
    } finally {
      shared.fill(0);
      wrapKey.fill(0);
      dek?.fill(0);
    }
  }

  /**
   * Sella una respuesta para el cliente: clave efímera nueva en cada mensaje
   * (secreto hacia adelante) y la clave pública efímera que el cliente envió.
   */
  seal(plain: Uint8Array, recipientRaw: Buffer, context: string): Envelope {
    const { privateKey, publicKey } = generateKeyPairSync('x25519');
    const epk = x25519Raw(publicKey);
    const shared = diffieHellman({ privateKey, publicKey: rawToX25519(recipientRaw) });
    const wrapKey = hkdf(shared, Buffer.concat([epk, recipientRaw]), context, KEY_BYTES);
    const dek = randomBytes(KEY_BYTES);
    const aad = Buffer.from(context, 'utf8');
    try {
      const n1 = randomBytes(12);
      const n2 = randomBytes(12);
      return {
        v: 1, epk: b64(epk), n1: b64(n1), wdek: b64(chachaSeal(wrapKey, n1, dek, aad)),
        n2: b64(n2), body: b64(chachaSeal(wrapKey, n2, gcmSeal(dek, plain, aad), aad)),
      };
    } finally {
      shared.fill(0);
      wrapKey.fill(0);
      dek.fill(0);
    }
  }

  /** Cabecera con la clave pública efímera del cliente para cifrar la respuesta. */
  parseReplyKey(header: unknown): Buffer {
    return unb64(header, KEY_BYTES);
  }

  /**
   * Canal C2 para el WebSocket, al estilo Noise NK: une un DH efímero-efímero
   * (secreto hacia adelante) con uno efímero-estático (el cliente sabe que
   * habla con este servicio y no con un intermediario).
   */
  openChannel(clientEpk: Buffer, projectId: string): { serverEpk: Buffer; channel: SecureChannel } {
    const { privateKey, publicKey } = generateKeyPairSync('x25519');
    const serverEpk = x25519Raw(publicKey);
    const client = rawToX25519(clientEpk);
    const ee = diffieHellman({ privateKey, publicKey: client });
    const se = diffieHellman({ privateKey: this.privateKey, publicKey: client });
    const keys = hkdf(Buffer.concat([ee, se]), Buffer.concat([clientEpk, serverEpk]), `securtex:c2:ws:v1:${projectId}`, 64);
    ee.fill(0);
    se.fill(0);
    const channel = new SecureChannel(projectId, keys.subarray(32, 64), keys.subarray(0, 32));
    return { serverEpk, channel };
  }
}

/**
 * Un sentido de cifrado por clave y contadores como nonce: nunca se repiten
 * con la misma clave y además bloquean la repetición y el reordenamiento de
 * tramas. Dentro de cada trama C2 va un bloque C1 con la DEK de la conexión.
 */
export class SecureChannel {
  private sendCounter = 0n;
  private recvCounter = 0n;
  private sendDek: Buffer | null = null;
  private recvDek: Buffer | null = null;

  constructor(
    private readonly projectId: string,
    private readonly sendKey: Buffer,
    private readonly recvKey: Buffer,
  ) {}

  /** Primera trama de cada sentido: la DEK de C1, solo bajo C2. */
  outgoingKeyFrame(): Buffer {
    this.sendDek = randomBytes(KEY_BYTES);
    return this.frame(this.sendDek, 's2c');
  }

  acceptKeyFrame(frame: Buffer): void {
    const dek = this.unframe(frame, 'c2s');
    if (dek.length !== KEY_BYTES) throw new IntegrityError('c1_key');
    this.recvDek = dek;
  }

  get ready(): boolean {
    return this.sendDek !== null && this.recvDek !== null;
  }

  encrypt(message: Uint8Array): Buffer {
    if (!this.sendDek) throw new IntegrityError('c1_key');
    const aad = Buffer.from(`securtex:c1:ws:v1:${this.projectId}:s2c:${this.sendCounter}`, 'utf8');
    return this.frame(gcmSeal(this.sendDek, message, aad), 's2c');
  }

  decrypt(frame: Buffer): Buffer {
    if (!this.recvDek) throw new IntegrityError('c1_key');
    const counter = this.recvCounter;
    const inner = this.unframe(frame, 'c2s');
    return gcmOpen(this.recvDek, inner, Buffer.from(`securtex:c1:ws:v1:${this.projectId}:c2s:${counter}`, 'utf8'));
  }

  destroy(): void {
    this.sendKey.fill(0);
    this.recvKey.fill(0);
    this.sendDek?.fill(0);
    this.recvDek?.fill(0);
  }

  private frame(inner: Uint8Array, dir: 's2c'): Buffer {
    const header = Buffer.alloc(8);
    header.writeBigUInt64BE(this.sendCounter);
    const nonce = Buffer.concat([Buffer.alloc(4), header]);
    const sealed = chachaSeal(this.sendKey, nonce, inner, Buffer.from(`securtex:c2:ws:v1:${this.projectId}:${dir}`, 'utf8'));
    this.sendCounter += 1n;
    return Buffer.concat([header, sealed]);
  }

  private unframe(frame: Buffer, dir: 'c2s'): Buffer {
    if (frame.length < 8 + TAG) throw new IntegrityError('c2_frame');
    // El contador debe ser exactamente el siguiente: una trama repetida o reordenada se rechaza.
    if (frame.readBigUInt64BE(0) !== this.recvCounter) throw new IntegrityError('c2_replay');
    const nonce = Buffer.concat([Buffer.alloc(4), frame.subarray(0, 8)]);
    const plain = chachaOpen(this.recvKey, nonce, frame.subarray(8), Buffer.from(`securtex:c2:ws:v1:${this.projectId}:${dir}`, 'utf8'), 'c2_frame');
    this.recvCounter += 1n;
    return plain;
  }
}
