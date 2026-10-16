import { gcm } from '@noble/ciphers/aes.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Capas C1, C2 y C5 en el navegador (securtex-docs · 14-Criptografia-Multicapa).
 *
 *   C1 · AES-256-GCM con una DEK aleatoria.
 *   C2 · sobre X25519 → HKDF-SHA-256 → ChaCha20-Poly1305 para el servicio.
 *   C5 · al recibir: se abre el sobre y se verifican las dos etiquetas
 *        (Poly1305 y GCM) antes de entregar un solo carácter. Si alguna falla,
 *        se lanza `IntegrityFailure` y no se muestra nada.
 *
 * Implementación en JavaScript puro (@noble, auditada) en lugar de WebCrypto:
 * `crypto.subtle` solo existe en contextos seguros, y en la red local la
 * aplicación se abre por http://IP. Las claves viven solo en memoria.
 */

export class IntegrityFailure extends Error {
  constructor(readonly stage: string) {
    super('El contenido no supera la verificación criptográfica.');
    this.name = 'IntegrityFailure';
  }
}

export interface Envelope {
  readonly v: 1;
  readonly epk: string;
  readonly n1: string;
  readonly wdek: string;
  readonly n2: string;
  readonly body: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(value: string): Uint8Array {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const wipe = (...bufs: Uint8Array[]) => { for (const b of bufs) b.fill(0); };

/** C1 · nonce ‖ cifrado ‖ etiqueta, igual que el servidor. */
export function gcmSeal(key: Uint8Array, plain: Uint8Array, aad: Uint8Array): Uint8Array {
  const nonce = random(12);
  return concat(nonce, gcm(key, nonce, aad).encrypt(plain));
}

export function gcmOpen(key: Uint8Array, block: Uint8Array, aad: Uint8Array, stage = 'c1_tag'): Uint8Array {
  try {
    return gcm(key, block.subarray(0, 12), aad).decrypt(block.subarray(12));
  } catch {
    throw new IntegrityFailure(stage);
  }
}

export function chachaOpen(key: Uint8Array, nonce: Uint8Array, sealed: Uint8Array, aad: Uint8Array, stage: string): Uint8Array {
  try {
    return chacha20poly1305(key, nonce, aad).decrypt(sealed);
  } catch {
    throw new IntegrityFailure(stage);
  }
}

export const chachaSeal = (key: Uint8Array, nonce: Uint8Array, plain: Uint8Array, aad: Uint8Array) => chacha20poly1305(key, nonce, aad).encrypt(plain);

export const envelopeContext = (projectId: string, purpose: string) => `securtex:c2:v1:${projectId}:${purpose}`;

let serverKey: Promise<Uint8Array> | null = null;

/** Clave pública X25519 del servicio. */
export function transportKey(): Promise<Uint8Array> {
  serverKey ??= fetch('/api/v1/crypto/transport-key', { credentials: 'same-origin' })
    .then((r) => r.json() as Promise<{ key: string }>)
    .then((j) => fromB64url(j.key))
    .catch((e: unknown) => { serverKey = null; throw e; });
  return serverKey;
}

/** C1 + C2 hacia el servicio. La clave efímera se destruye al terminar: secreto hacia adelante por mensaje. */
export async function sealForServer(text: string, context: string): Promise<Envelope> {
  const server = await transportKey();
  const eph = x25519.utils.randomSecretKey();
  const epk = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, server);
  const wrap = hkdf(sha256, shared, concat(epk, server), enc.encode(context), 32);
  const dek = random(32);
  const aad = enc.encode(context);
  const n1 = random(12);
  const n2 = random(12);
  const plain = enc.encode(text);
  try {
    return {
      v: 1, epk: toB64url(epk), n1: toB64url(n1), wdek: toB64url(chachaSeal(wrap, n1, dek, aad)),
      n2: toB64url(n2), body: toB64url(chachaSeal(wrap, n2, gcmSeal(dek, plain, aad), aad)),
    };
  } finally {
    wipe(eph, shared, wrap, dek, plain);
  }
}

/** Par efímero para recibir una respuesta sellada; la privada no sale de la memoria. */
export function replyKeyPair(): { readonly secret: Uint8Array; readonly header: string; readonly publicKey: Uint8Array } {
  const secret = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secret);
  return { secret, publicKey, header: toB64url(publicKey) };
}

/** C5 · abre un sobre del servidor: Poly1305 de la DEK, Poly1305 del bloque y etiqueta GCM con su AAD. */
export function openFromServer(env: Envelope, keys: ReturnType<typeof replyKeyPair>, context: string): string {
  return dec.decode(openBytesFromServer(env, keys, context));
}

/** Igual que `openFromServer`, pero devuelve los bytes: lo necesita la trama binaria de una compilación. */
export function openBytesFromServer(env: Envelope, keys: ReturnType<typeof replyKeyPair>, context: string): Uint8Array {
  const epk = fromB64url(env.epk);
  const shared = x25519.getSharedSecret(keys.secret, epk);
  const wrap = hkdf(sha256, shared, concat(epk, keys.publicKey), enc.encode(context), 32);
  const aad = enc.encode(context);
  let dek: Uint8Array | null = null;
  try {
    dek = chachaOpen(wrap, fromB64url(env.n1), fromB64url(env.wdek), aad, 'c2_dek');
    const block = chachaOpen(wrap, fromB64url(env.n2), fromB64url(env.body), aad, 'c2_body');
    return gcmOpen(dek, block, aad);
  } finally {
    wipe(shared, wrap, keys.secret);
    if (dek) wipe(dek);
  }
}

/**
 * GET de contenido sellado: envía la clave efímera en la cabecera y devuelve
 * el JSON ya verificado y descifrado (C5).
 */
export async function fetchSealed<T>(url: string, context: string): Promise<T> {
  const keys = replyKeyPair();
  const res = await fetch(url, { credentials: 'same-origin', headers: { 'X-SecurTex-Reply-Key': keys.header } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as unknown;
    throw Object.assign(new Error('sealed_request_failed'), { status: res.status, body });
  }
  const { envelope } = (await res.json()) as { envelope: Envelope };
  return JSON.parse(openFromServer(envelope, keys, context)) as T;
}

/**
 * Canal C2 del WebSocket (como Noise NK): DH efímero-efímero + efímero-estático.
 * Dentro de cada trama va un bloque C1 con la DEK de la conexión.
 */
export class ClientChannel {
  private sendCounter = 0n;
  private recvCounter = 0n;
  private sendDek: Uint8Array | null = null;
  private recvDek: Uint8Array | null = null;
  private readonly secret = x25519.utils.randomSecretKey();
  readonly publicKey = x25519.getPublicKey(this.secret);
  private sendKey: Uint8Array | null = null;
  private recvKey: Uint8Array | null = null;

  constructor(private readonly projectId: string) {}

  hello(): string {
    return JSON.stringify({ t: 'hello', v: 1, epk: toB64url(this.publicKey) });
  }

  async accept(serverEpkB64: string): Promise<void> {
    const server = await transportKey();
    const sepk = fromB64url(serverEpkB64);
    const ee = x25519.getSharedSecret(this.secret, sepk);
    const se = x25519.getSharedSecret(this.secret, server);
    const keys = hkdf(sha256, concat(ee, se), concat(this.publicKey, sepk), enc.encode(`securtex:c2:ws:v1:${this.projectId}`), 64);
    this.sendKey = keys.slice(0, 32);
    this.recvKey = keys.slice(32, 64);
    wipe(ee, se, keys, this.secret);
  }

  /** La primera trama del servidor trae su DEK; se responde con la nuestra. */
  acceptKeyFrame(frame: Uint8Array): Uint8Array {
    this.recvDek = this.unframe(frame);
    if (this.recvDek.length !== 32) throw new IntegrityFailure('c1_key');
    this.sendDek = random(32);
    return this.frame(this.sendDek);
  }

  get ready(): boolean {
    return this.recvDek !== null;
  }

  encrypt(message: Uint8Array): Uint8Array {
    if (!this.sendDek) throw new IntegrityFailure('c1_key');
    const aad = enc.encode(`securtex:c1:ws:v1:${this.projectId}:c2s:${this.sendCounter}`);
    return this.frame(gcmSeal(this.sendDek, message, aad));
  }

  decrypt(frame: Uint8Array): Uint8Array {
    if (!this.recvDek) throw new IntegrityFailure('c1_key');
    const counter = this.recvCounter;
    const inner = this.unframe(frame);
    return gcmOpen(this.recvDek, inner, enc.encode(`securtex:c1:ws:v1:${this.projectId}:s2c:${counter}`));
  }

  destroy(): void {
    for (const k of [this.sendKey, this.recvKey, this.sendDek, this.recvDek]) k?.fill(0);
  }

  private frame(inner: Uint8Array): Uint8Array {
    if (!this.sendKey) throw new IntegrityFailure('c2_key');
    const header = new Uint8Array(8);
    new DataView(header.buffer).setBigUint64(0, this.sendCounter);
    const sealed = chachaSeal(this.sendKey, concat(new Uint8Array(4), header), inner, enc.encode(`securtex:c2:ws:v1:${this.projectId}:c2s`));
    this.sendCounter += 1n;
    return concat(header, sealed);
  }

  private unframe(frame: Uint8Array): Uint8Array {
    if (!this.recvKey || frame.length < 24) throw new IntegrityFailure('c2_frame');
    const counter = new DataView(frame.buffer, frame.byteOffset, 8).getBigUint64(0);
    // Una trama repetida o fuera de orden se rechaza: los contadores son el nonce.
    if (counter !== this.recvCounter) throw new IntegrityFailure('c2_replay');
    const plain = chachaOpen(this.recvKey, concat(new Uint8Array(4), frame.subarray(0, 8)), frame.subarray(8), enc.encode(`securtex:c2:ws:v1:${this.projectId}:s2c`), 'c2_frame');
    this.recvCounter += 1n;
    return plain;
  }
}
