import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concat, fromB64url, IntegrityFailure } from './transport';

/**
 * Capa C4b en el navegador (14-Criptografia-Multicapa §7.1 y §8): antes de
 * entregar un PDF a PDF.js se comprueba que lo firmó el servicio de
 * compilación con Ed25519 y que corresponde a este compilationId y a este
 * árbol de fuentes:
 *
 *   Ed25519.verify(firma, SHA-256(pdf) ‖ compilationId[16] ‖ sourceTreeHash[32], clave pública)
 *
 * Si algo no cuadra se lanza `IntegrityFailure` y el PDF no se muestra ni se
 * puede descargar. @noble (auditada) y no WebCrypto: en la red local la
 * aplicación se abre por http://IP, donde `crypto.subtle` no existe.
 */

export interface ArtifactSignature {
  readonly alg: 'Ed25519';
  readonly pdfSha256: string;
  readonly sourceTreeHash: string;
  readonly value: string;
}

let artifactKey: Promise<Uint8Array> | null = null;

/** Clave pública Ed25519 del servicio de compilación. */
export function artifactPublicKey(): Promise<Uint8Array> {
  artifactKey ??= fetch('/api/v1/crypto/artifact-key', { credentials: 'same-origin' })
    .then((r) => r.json() as Promise<{ alg: string; key: string }>)
    .then((j) => {
      const key = fromB64url(j.key);
      if (j.alg !== 'Ed25519' || key.length !== 32) throw new IntegrityFailure('c4b_key');
      return key;
    })
    .catch((e: unknown) => { artifactKey = null; throw e; });
  return artifactKey;
}

function uuidBytes(id: string): Uint8Array {
  const hex = id.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new IntegrityFailure('c4b_id');
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}

const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export async function verifyArtifact(pdf: Uint8Array, compilationId: string, signature: ArtifactSignature | null): Promise<void> {
  if (!signature || signature.alg !== 'Ed25519') throw new IntegrityFailure('c4b_missing');
  const digest = sha256(pdf);
  // La huella declarada debe ser la del PDF recibido; si no, ni se intenta verificar.
  if (!equalBytes(digest, fromB64url(signature.pdfSha256))) throw new IntegrityFailure('c4b_digest');
  const treeHash = fromB64url(signature.sourceTreeHash);
  if (treeHash.length !== 32) throw new IntegrityFailure('c4b_tree');
  const message = concat(digest, uuidBytes(compilationId), treeHash);
  let valid = false;
  try {
    valid = ed25519.verify(fromB64url(signature.value), message, await artifactPublicKey());
  } catch {
    valid = false;
  }
  if (!valid) throw new IntegrityFailure('c4b_signature');
}
