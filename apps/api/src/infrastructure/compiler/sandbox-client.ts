import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../../config/env';
import { COMPILE } from '../../domain/constants';
import type { CompileEngine } from '../../domain/compile';
import { ServiceUnavailableError } from '../../domain/errors';

export interface SandboxRequest {
  readonly engine: CompileEngine;
  readonly mainFile: string;
  /** `base64` para imágenes y PDF; el resto es texto UTF-8. */
  readonly files: ReadonlyArray<{ readonly path: string; readonly content: string; readonly encoding: 'utf8' | 'base64' }>;
}

/** Lo que el sandbox dice de sí mismo. Es salida de código hostil: se valida todo antes de usarla. */
export interface SandboxOutcome {
  readonly status: 'success' | 'errors' | 'failed' | 'timeout' | 'too_large';
  readonly runs: number;
  readonly durationMs: number;
  readonly log: string;
  readonly pdf: Buffer;
  /** Mapa SyncTeX que calculó el trabajador (vacío si no hay). Sin validar todavía. */
  readonly synctex: Buffer;
}

const STATUSES = new Set(['success', 'errors', 'failed', 'timeout', 'too_large']);
const MAX_HEADER_BYTES = 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const exists = (p: string) => access(p).then(() => true, () => false);

/**
 * Adaptador hacia el sandbox de compilación. El contenedor del compilador no
 * tiene interfaz de red (network_mode: none): no puede abrir un socket hacia
 * la API, la base de datos ni Internet. La única vía es un volumen tmpfs
 * (noexec, nosuid) compartido, con un protocolo de archivos de un solo uso:
 *
 *   API        <id>.req.json  (escrito en .tmp y renombrado: atómico)
 *   sandbox    <id>.claimed → compila en su propio tmpfs → <id>.res
 *
 * Todo lo que deja cada compilación en el volumen se borra en `finally`,
 * también si vence el plazo o el sandbox no responde.
 */
@Injectable()
export class SandboxClient {
  private readonly logger = new Logger(SandboxClient.name);
  private readonly dir = loadEnv().COMPILE_JOBS_DIR;
  private readonly timeoutMs = loadEnv().COMPILE_TIMEOUT_MS;

  async run(request: SandboxRequest): Promise<SandboxOutcome> {
    const id = randomUUID();
    const path = (suffix: string) => join(this.dir, `${id}.${suffix}`);
    try {
      await writeFile(path('req.tmp'), JSON.stringify(request), { encoding: 'utf8', mode: 0o600 });
      await rename(path('req.tmp'), path('req.json'));
      return await this.await(id, path);
    } finally {
      await Promise.all(['req.tmp', 'req.json', 'claimed', 'res.tmp', 'res'].map((s) => rm(path(s), { force: true })));
    }
  }

  private async await(id: string, path: (suffix: string) => string): Promise<SandboxOutcome> {
    const started = Date.now();
    const deadline = started + this.timeoutMs + COMPILE.WAIT_GRACE_MS;
    while (Date.now() < deadline) {
      await sleep(COMPILE.POLL_MS);
      const result = await readFile(path('res')).catch(() => null);
      if (result) return this.parse(result);
      if (Date.now() - started > COMPILE.CLAIM_TIMEOUT_MS && (await exists(path('req.json')))) {
        this.logger.error(`El sandbox no reclamó la compilación ${id} en ${COMPILE.CLAIM_TIMEOUT_MS} ms`);
        throw this.unavailable();
      }
    }
    // El sandbox no respondió ni con su propio plazo: se trata como plazo vencido.
    return { status: 'timeout', runs: 0, durationMs: Date.now() - started, log: '', pdf: Buffer.alloc(0), synctex: Buffer.alloc(0) };
  }

  /**
   * u32be(longitud) ‖ cabecera JSON ‖ PDF ‖ mapa SyncTeX, con `pdfBytes` y
   * `synctexBytes` en la cabecera sumando exactamente el resto. Cualquier
   * desviación es un fallo, nunca un éxito.
   */
  private parse(raw: Buffer): SandboxOutcome {
    if (raw.length < 4) throw this.unavailable();
    const headerLength = raw.readUInt32BE(0);
    if (headerLength > MAX_HEADER_BYTES || 4 + headerLength > raw.length) throw this.unavailable();
    let header: unknown;
    try {
      header = JSON.parse(raw.toString('utf8', 4, 4 + headerLength));
    } catch {
      throw this.unavailable();
    }
    const h = (header ?? {}) as Record<string, unknown>;
    const status = typeof h['status'] === 'string' && STATUSES.has(h['status']) ? (h['status'] as SandboxOutcome['status']) : 'failed';
    const body = raw.subarray(4 + headerLength);
    const pdfBytes = h['pdfBytes'];
    const synctexBytes = h['synctexBytes'];
    const sized = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
    if (!sized(pdfBytes) || !sized(synctexBytes) || pdfBytes + synctexBytes !== body.length) throw this.unavailable();
    return {
      status,
      runs: typeof h['runs'] === 'number' ? h['runs'] : 0,
      durationMs: typeof h['durationMs'] === 'number' ? h['durationMs'] : 0,
      log: typeof h['log'] === 'string' ? h['log'] : '',
      pdf: Buffer.from(body.subarray(0, pdfBytes)),
      synctex: Buffer.from(body.subarray(pdfBytes)),
    };
  }

  private unavailable(): ServiceUnavailableError {
    return new ServiceUnavailableError('compiler_unavailable', 'El compilador no está disponible en este momento. Inténtalo de nuevo en unos segundos.');
  }
}
