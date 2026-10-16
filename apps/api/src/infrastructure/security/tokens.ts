import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AUTH } from '../../domain/constants';

/**
 * Tokens opacos de un solo uso.
 *
 * Formato entregado al cliente: `<id>.<secreto>`, donde el secreto son 256 bits
 * del CSPRNG. En base de datos solo se guarda SHA-256(secreto).
 *
 * ¿Por qué SHA-256 y no Argon2id? Argon2id existe para frenar la fuerza bruta
 * sobre secretos de baja entropía (contraseñas). Un secreto de 256 bits
 * aleatorios no es atacable por diccionario: SHA-256 da la misma garantía
 * frente a un volcado de la base de datos y permite comprobarlo en tiempo
 * constante sin coste de CPU en cada refresco (OWASP ASVS V2.9 / V3.5).
 */
export function randomSecret(bytes: number = AUTH.TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

/** Bytes con un ArrayBuffer propio: es lo que espera Prisma para columnas bytea. */
export type Bytes = Uint8Array<ArrayBuffer>;

export function toBytes(data: Uint8Array): Bytes {
  return new Uint8Array(data);
}

export function sha256(data: string | Uint8Array): Bytes {
  return toBytes(createHash('sha256').update(data).digest());
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Comparación en tiempo constante (AGENTS.md §3.5). */
export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface CompositeToken {
  readonly id: string;
  readonly secret: string;
}

const COMPOSITE_RE = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/;

export function formatCompositeToken(id: string, secret: string): string {
  return `${id}.${secret}`;
}

export function parseCompositeToken(raw: string | undefined): CompositeToken | null {
  if (!raw) return null;
  const match = COMPOSITE_RE.exec(raw);
  if (!match?.[1] || !match[2]) return null;
  return { id: match[1], secret: match[2] };
}

/** Comprueba un secreto contra su hash almacenado, en tiempo constante. */
export function secretMatches(secret: string, storedHash: Uint8Array): boolean {
  return safeEqual(sha256(secret), storedHash);
}
