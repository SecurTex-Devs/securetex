import type { ArtifactSignature, SynctexSignature } from '@/shared/crypto/artifact';
import { IntegrityFailure } from '@/shared/crypto/transport';

/**
 * Trama de `POST /projects/:id/compile`, ya fuera del sobre C1 + C2:
 *
 *   u32be(longitud de la cabecera) ‖ cabecera JSON ‖ bytes del PDF ‖ mapa SyncTeX
 *
 * (v2: `pdfBytes` y `synctexBytes` delimitan cada parte y deben sumar
 * exactamente lo que queda tras la cabecera.)
 *
 * El contrato OpenAPI solo describe el sobre (`SealedResponseDto`): lo que va
 * dentro está cifrado y es binario, así que no hay tipo generado. Por eso se
 * valida campo a campo aquí, sin confiar en la forma.
 */

export type ServerCompileStatus = 'success' | 'errors' | 'failed' | 'timeout' | 'too_large' | 'rejected';

export interface ServerDiagnostic {
  readonly level: 'error' | 'warning' | 'typesetting';
  readonly file: string | null;
  readonly line: number | null;
  readonly message: string;
}

export interface ServerCompile {
  readonly compilationId: string;
  readonly status: ServerCompileStatus;
  readonly engine: string;
  readonly mainFile: string;
  readonly durationMs: number;
  readonly runs: number;
  /** Registro real, saneado por el servidor. Se muestra siempre como texto. */
  readonly log: string;
  readonly diagnostics: readonly ServerDiagnostic[];
  readonly signature: ArtifactSignature | null;
  /** Firma Ed25519 propia del mapa SyncTeX; null si la compilación no trae mapa. */
  readonly synctexSignature: SynctexSignature | null;
}

const STATUSES: readonly ServerCompileStatus[] = ['success', 'errors', 'failed', 'timeout', 'too_large', 'rejected'];
const LEVELS = ['error', 'warning', 'typesetting'] as const;
const MAX_HEADER = 4 * 1024 * 1024;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function diagnostic(raw: unknown): ServerDiagnostic | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const level = LEVELS.find((l) => l === d['level']);
  if (!level || typeof d['message'] !== 'string') return null;
  return {
    level,
    message: d['message'],
    file: typeof d['file'] === 'string' ? d['file'] : null,
    line: typeof d['line'] === 'number' ? d['line'] : null,
  };
}

function signature(raw: unknown): ArtifactSignature | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s['alg'] !== 'Ed25519') return null;
  return { alg: 'Ed25519', pdfSha256: str(s['pdfSha256']), sourceTreeHash: str(s['sourceTreeHash']), value: str(s['value']) };
}

function synctexSignature(raw: unknown): SynctexSignature | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s['alg'] !== 'Ed25519') return null;
  return { alg: 'Ed25519', sha256: str(s['sha256']), value: str(s['value']) };
}

const size = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

export function parseCompileFrame(frame: Uint8Array): { readonly header: ServerCompile; readonly pdf: Uint8Array; readonly synctex: Uint8Array } {
  if (frame.length < 4) throw new IntegrityFailure('compile_frame');
  const length = new DataView(frame.buffer, frame.byteOffset, 4).getUint32(0);
  if (length > MAX_HEADER || 4 + length > frame.length) throw new IntegrityFailure('compile_frame');
  let h: Record<string, unknown>;
  try {
    h = JSON.parse(new TextDecoder().decode(frame.subarray(4, 4 + length))) as Record<string, unknown>;
  } catch {
    throw new IntegrityFailure('compile_frame');
  }
  const body = frame.length - 4 - length;
  const pdfBytes = size(h['pdfBytes']);
  const synctexBytes = size(h['synctexBytes']);
  if (h['v'] !== 2 || pdfBytes === null || synctexBytes === null || pdfBytes + synctexBytes !== body) throw new IntegrityFailure('compile_frame');
  const status = STATUSES.find((s) => s === h['status']) ?? 'failed';
  const diagnostics = Array.isArray(h['diagnostics']) ? h['diagnostics'].map(diagnostic).filter((d): d is ServerDiagnostic => d !== null) : [];
  return {
    header: {
      compilationId: str(h['compilationId']), status, engine: str(h['engine']), mainFile: str(h['mainFile']),
      durationMs: num(h['durationMs']), runs: num(h['runs']), log: str(h['log']), diagnostics, signature: signature(h['signature']),
      synctexSignature: synctexSignature(h['synctex']),
    },
    // Copias propias: ni el PDF ni el mapa deben compartir búfer con el texto plano del sobre.
    pdf: frame.slice(4 + length, 4 + length + pdfBytes),
    synctex: frame.slice(4 + length + pdfBytes),
  };
}
