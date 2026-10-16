import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  COMPILE_ENGINES, pdfRejection, parseCompileLog, sanitizeCompileLog,
  type CompileDiagnostic, type CompileEngine, type CompileStatus,
} from '../../domain/compile';
import { COMPILE } from '../../domain/constants';
import { CompileBlockedError, RateLimitedError, ValidationError } from '../../domain/errors';
import type { SecurityFinding } from '../../domain/latex-analyzer';
import { validateSynctex, type SynctexRejection } from '../../domain/synctex';
import { SafeFilePath } from '../../domain/values';
import { SandboxClient, type SandboxRequest } from '../../infrastructure/compiler/sandbox-client';
import { ArtifactSigner } from '../../infrastructure/security/artifact-signer';
import { AuditLog, type AuditEntry } from '../audit/audit-log';
import { FilesService, isBinaryKind } from '../files/files.service';
import { ProjectsService } from '../projects/projects.service';
import type { Actor, RequestMeta } from '../request-meta';

export interface CompileSignature {
  readonly alg: 'Ed25519';
  readonly pdfSha256: Buffer;
  readonly sourceTreeHash: Buffer;
  readonly value: Buffer;
}

/** Mapa SyncTeX validado y reserializado por la API, con su propia firma Ed25519. */
export interface CompileSynctex {
  readonly map: Buffer;
  readonly sha256: Buffer;
  readonly signature: Buffer;
}

export interface CompileOutput {
  readonly compilationId: string;
  readonly status: CompileStatus;
  readonly engine: CompileEngine;
  readonly mainFile: string;
  readonly durationMs: number;
  readonly runs: number;
  /** Registro ya saneado (sin rutas absolutas ni caracteres de control). */
  readonly log: string;
  readonly diagnostics: readonly CompileDiagnostic[];
  /** Avisos no bloqueantes del análisis previo. */
  readonly warnings: readonly SecurityFinding[];
  readonly pdf: Buffer | null;
  readonly signature: CompileSignature | null;
  readonly synctex: CompileSynctex | null;
}

interface Job {
  readonly projectId: string;
  readonly request: SandboxRequest;
  readonly warnings: readonly SecurityFinding[];
}

/**
 * Caso de uso «compilar» (F-120, T-C01 … T-C05). Orden de AGENTS.md §4.2:
 * cargar y autorizar → reglas (análisis autoritativo; si bloquea, el proyecto
 * NO llega al sandbox) → ejecutar en el sandbox → validar la salida → firmar
 * (C4b) → auditar. No se persiste nada: el PDF solo existe en esta respuesta.
 */
@Injectable()
export class CompileService {
  private inFlight = 0;
  private readonly perUser = new Map<string, number>();

  constructor(
    private readonly projects: ProjectsService,
    private readonly files: FilesService,
    private readonly sandbox: SandboxClient,
    private readonly signer: ArtifactSigner,
    private readonly audit: AuditLog,
  ) {}

  async compile(actor: Actor, projectId: string, m: RequestMeta): Promise<CompileOutput> {
    const { id, row } = await this.projects.authorize(actor, projectId, 'compile', m);
    const { files, analysis } = await this.files.snapshot(actor, id, m);
    if (analysis.verdict === 'blocked') throw new CompileBlockedError(analysis.findings);
    const engine = (COMPILE_ENGINES as readonly string[]).includes(row.compiler) ? (row.compiler as CompileEngine) : 'pdflatex';
    // Toda ruta que entra al sandbox pasa otra vez por SafeFilePath (AGENTS.md §3.3).
    const mainFile = SafeFilePath.of(row.mainFile).toString();
    const sources = files.map((f) => ({ path: SafeFilePath.of(f.path).toString(), content: f.content, encoding: isBinaryKind(f.kind) ? 'base64' as const : 'utf8' as const }));
    if (!mainFile.endsWith('.tex') || !sources.some((f) => f.path === mainFile)) {
      throw new ValidationError({ mainFile: 'El documento principal no existe en el proyecto.' }, 'Elige un documento principal .tex en los ajustes del proyecto.');
    }
    const job: Job = { projectId: id, request: { engine, mainFile, files: sources }, warnings: analysis.findings };
    return this.withSlot(actor.userId, () => this.execute(actor, job, m));
  }

  private async execute(actor: Actor, job: Job, m: RequestMeta): Promise<CompileOutput> {
    const compilationId = randomUUID();
    const outcome = await this.sandbox.run(job.request);
    const log = sanitizeCompileLog(outcome.log);
    let status: CompileStatus = outcome.status;
    let pdf: Buffer | null = null;
    let rejection: string | null = null;
    if (status === 'success' || status === 'errors') {
      // La salida del sandbox es del atacante: solo se entrega si es un PDF de verdad.
      rejection = pdfRejection(outcome.pdf);
      if (rejection) status = rejection === 'too_large' ? 'too_large' : 'rejected';
      else pdf = outcome.pdf;
    }
    const signature = pdf ? this.sign(pdf, compilationId, job.request) : null;
    // El mapa solo acompaña a un PDF entregado, y solo si supera la validación.
    const checked = pdf && signature ? validateSynctex(outcome.synctex, new Set(job.request.files.map((f) => f.path))) : null;
    const synctex = checked && 'map' in checked && signature
      ? { map: checked.map, ...this.signer.signSynctex(checked.map, compilationId, signature.pdfSha256) }
      : null;
    const synctexRejection = checked && 'rejection' in checked ? checked.rejection : null;
    await this.audit.record(this.auditEntry(actor, job, { compilationId, status, rejection, durationMs: outcome.durationMs, runs: outcome.runs, pdfBytes: pdf?.length ?? 0, synctexBytes: synctex?.map.length ?? 0, synctexRejection }), m);
    return {
      compilationId, status, engine: job.request.engine, mainFile: job.request.mainFile,
      durationMs: outcome.durationMs, runs: outcome.runs, log, diagnostics: parseCompileLog(log),
      warnings: job.warnings, pdf, signature, synctex,
    };
  }

  private sign(pdf: Buffer, compilationId: string, request: SandboxRequest): CompileSignature {
    const sourceTreeHash = this.signer.sourceTreeHash(request);
    const { pdfSha256, signature } = this.signer.sign(pdf, compilationId, sourceTreeHash);
    return { alg: 'Ed25519', pdfSha256, sourceTreeHash, value: signature };
  }

  private auditEntry(actor: Actor, job: Job, r: { compilationId: string; status: CompileStatus; rejection: string | null; durationMs: number; runs: number; pdfBytes: number; synctexBytes: number; synctexRejection: SynctexRejection | null }): AuditEntry {
    const delivered = r.status === 'success' || r.status === 'errors';
    const suspicious = r.status === 'timeout' || r.status === 'too_large' || r.status === 'rejected';
    return {
      type: delivered ? 'compile.completed' : suspicious ? 'compile.output_rejected' : 'compile.failed',
      severity: suspicious ? 'warning' : 'info',
      actorUserId: actor.userId,
      target: { type: 'project', id: job.projectId },
      outcome: delivered ? 'success' : 'failure',
      ...(delivered ? {} : { reason: r.rejection ?? r.status }),
      // Nunca contenido del documento ni del registro (RS-052): solo metadatos.
      metadata: {
        compilationId: r.compilationId, engine: job.request.engine, status: r.status, durationMs: r.durationMs, runs: r.runs, pdfBytes: r.pdfBytes,
        // 'empty' es lo normal sin mapa; cualquier otro motivo es un mapa del sandbox descartado.
        synctexBytes: r.synctexBytes, ...(r.synctexRejection && r.synctexRejection !== 'empty' ? { synctexRejected: r.synctexRejection } : {}),
      },
    };
  }

  /**
   * Compilar es lo más caro del servicio (T-C04): una compilación a la vez
   * por persona y un tope global, además del límite de tasa del endpoint.
   */
  private async withSlot<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const mine = this.perUser.get(userId) ?? 0;
    if (mine >= COMPILE.MAX_IN_FLIGHT_PER_USER || this.inFlight >= COMPILE.MAX_IN_FLIGHT) {
      throw new RateLimitedError(COMPILE.RETRY_AFTER_SECONDS, 'compile_busy', 'Ya hay una compilación en curso. Espera a que termine y vuelve a probar.');
    }
    this.inFlight += 1;
    this.perUser.set(userId, mine + 1);
    try {
      return await fn();
    } finally {
      this.inFlight -= 1;
      const left = (this.perUser.get(userId) ?? 1) - 1;
      if (left > 0) this.perUser.set(userId, left);
      else this.perUser.delete(userId);
    }
  }
}
