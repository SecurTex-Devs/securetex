import { Injectable } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto';
import { loadEnv } from '../../config/env';

/** Prefijo DER de una clave pública Ed25519 en SPKI: lo que hay delante de los 32 bytes crudos. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const UUID_HEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const TREE_DOMAIN = 'securtex:c4b:tree:v1';
const SYNCTEX_DOMAIN = Buffer.from('securtex:c4b:synctex:v1', 'utf8');

export interface SourceTreeInput {
  readonly engine: string;
  readonly mainFile: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly content: string }>;
}

export interface ArtifactSignature {
  readonly pdfSha256: Buffer;
  readonly signature: Buffer;
}

function idBytes(compilationId: string): Buffer {
  if (!UUID_HEX.test(compilationId)) throw new Error('compilationId debe ser un UUID');
  return Buffer.from(compilationId.replace(/-/g, ''), 'hex');
}

const sha256 = (...parts: readonly (string | Uint8Array)[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};

/**
 * Capa C4b de 14-Criptografia-Multicapa §7.1: firma Ed25519 de cada PDF.
 *
 *   firma = Ed25519(SHA-256(pdf) ‖ compilationId ‖ sourceTreeHash)
 *
 * con compilationId en sus 16 bytes y sourceTreeHash de 32 bytes. El navegador
 * la verifica antes de renderizar: el PDF procede de este servicio y de este
 * árbol de fuentes, y no se sustituyó en el trayecto ni en ningún almacén.
 *
 * La clave privada vive aquí y NO en el contenedor del compilador a
 * propósito: ese contenedor ejecuta código hostil, y kpathsea expande
 * variables de entorno en los nombres de archivo (`\input{$CLAVE}` la
 * imprimiría en el registro). El sandbox no tiene ningún secreto que filtrar.
 *
 * El mapa SyncTeX que acompaña al PDF lleva su propia firma, separada por
 * dominio y atada al PDF de la misma compilación:
 *
 *   firma = Ed25519("securtex:c4b:synctex:v1" ‖ SHA-256(mapa) ‖ compilationId ‖ SHA-256(pdf))
 *
 * Así la firma del PDF no cambia y un mapa no se puede pegar a otro PDF.
 */
@Injectable()
export class ArtifactSigner {
  private readonly privateKey: KeyObject;
  readonly publicKeyRaw: Buffer;

  constructor() {
    this.privateKey = createPrivateKey({ key: Buffer.from(loadEnv().COMPILER_SIGNING_KEY, 'base64'), format: 'der', type: 'pkcs8' });
    if (this.privateKey.asymmetricKeyType !== 'ed25519') throw new Error('COMPILER_SIGNING_KEY debe ser una clave Ed25519');
    const spki = createPublicKey(this.privateKey).export({ format: 'der', type: 'spki' });
    this.publicKeyRaw = Buffer.from(spki.subarray(ED25519_SPKI_PREFIX.length));
  }

  /**
   * Huella del árbol de fuentes: motor, documento principal y, por ruta en
   * orden, SHA-256 de cada contenido. Cada campo va precedido de su longitud
   * para que no haya dos árboles distintos con la misma serialización.
   */
  sourceTreeHash(tree: SourceTreeInput): Buffer {
    const h = createHash('sha256');
    const field = (value: string | Uint8Array) => {
      const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
      const len = Buffer.alloc(4);
      len.writeUInt32BE(bytes.length);
      h.update(len).update(bytes);
    };
    field(TREE_DOMAIN);
    field(tree.engine);
    field(tree.mainFile);
    const files = [...tree.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const f of files) {
      field(f.path);
      field(sha256(f.content));
    }
    return h.digest();
  }

  sign(pdf: Uint8Array, compilationId: string, sourceTreeHash: Buffer): ArtifactSignature {
    const pdfSha256 = sha256(pdf);
    const message = Buffer.concat([pdfSha256, idBytes(compilationId), sourceTreeHash]);
    return { pdfSha256, signature: sign(null, message, this.privateKey) };
  }

  signSynctex(map: Uint8Array, compilationId: string, pdfSha256: Buffer): { readonly sha256: Buffer; readonly signature: Buffer } {
    if (pdfSha256.length !== 32) throw new Error('pdfSha256 debe tener 32 bytes');
    const digest = sha256(map);
    const message = Buffer.concat([SYNCTEX_DOMAIN, digest, idBytes(compilationId), pdfSha256]);
    return { sha256: digest, signature: sign(null, message, this.privateKey) };
  }
}
