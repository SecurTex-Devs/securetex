import { Injectable } from '@nestjs/common';
import type { ProjectFile } from '@prisma/client';
import { FILES } from '../../domain/constants';
import { ConflictError, IntegrityError, NotFoundError, ValidationError } from '../../domain/errors';
import { analyzeLatex, type SecurityFinding } from '../../domain/latex-analyzer';
import { asUserId, isUuid, SafeFilePath } from '../../domain/values';
import { Databases, type AppTx } from '../../infrastructure/db/databases';
import { AuditLog } from '../audit/audit-log';
import { ProjectsService } from '../projects/projects.service';
import type { Actor, RequestMeta } from '../request-meta';
import { EncryptedFileStore } from './file-store';

export interface FileMeta {
  readonly id: string;
  readonly path: string;
  readonly kind: string;
  readonly size: number;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface FileWithContent extends FileMeta {
  readonly content: string;
}

export interface AnalysisResult {
  readonly verdict: 'clean' | 'warnings' | 'blocked';
  readonly findings: readonly SecurityFinding[];
  readonly analyzedFiles: number;
}

function meta(f: ProjectFile): FileMeta {
  return { id: f.id, path: f.path, kind: f.kind, size: f.size, version: f.version, updatedAt: f.updatedAt };
}

function assertSize(content: string): void {
  if (Buffer.byteLength(content, 'utf8') > FILES.MAX_FILE_BYTES) {
    throw new ValidationError({ content: 'El archivo supera 1 MB.' }, 'El archivo es demasiado grande.');
  }
}

/**
 * Casos de uso de archivos (F-060 … F-072). Orden de AGENTS.md §4.2:
 * cargar y autorizar (ProjectsService.authorize) → reglas → persistir
 * cifrado (RLS) → auditar. La lectura verifica la integridad antes de descifrar.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly db: Databases,
    private readonly projects: ProjectsService,
    private readonly store: EncryptedFileStore,
    private readonly audit: AuditLog,
  ) {}

  async list(actor: Actor, projectId: string): Promise<FileMeta[]> {
    const { id } = await this.projects.authorize(actor, projectId, 'view');
    const rows = await this.db.asUser(asUserId(actor.userId), (tx) => tx.projectFile.findMany({ where: { projectId: id }, orderBy: { path: 'asc' } }));
    return rows.map(meta);
  }

  async read(actor: Actor, projectId: string, fileId: string, m: RequestMeta): Promise<FileWithContent> {
    const { id } = await this.projects.authorize(actor, projectId, 'view');
    return this.withIntegrity(actor, id, m, async (tx) => {
      const file = await this.find(tx, id, fileId);
      return { ...meta(file), content: await this.store.read(tx, file) };
    });
  }

  /** Todo el proyecto descifrado de una vez: lo que necesita el editor al abrirse. */
  async readAll(actor: Actor, projectId: string, m: RequestMeta): Promise<FileWithContent[]> {
    const { id } = await this.projects.authorize(actor, projectId, 'view');
    return this.withIntegrity(actor, id, m, async (tx) => {
      const rows = await tx.projectFile.findMany({ where: { projectId: id }, orderBy: { path: 'asc' } });
      const out: FileWithContent[] = [];
      for (const f of rows) out.push({ ...meta(f), content: await this.store.read(tx, f) });
      return out;
    });
  }

  async create(actor: Actor, projectId: string, rawPath: string, content: string, m: RequestMeta): Promise<FileMeta> {
    const { id } = await this.projects.authorize(actor, projectId, 'edit_content', m);
    const path = SafeFilePath.of(rawPath);
    assertSize(content);
    const file = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      await this.assertQuota(tx, id, Buffer.byteLength(content, 'utf8'), true);
      if (await tx.projectFile.findFirst({ where: { projectId: id, path: path.toString() }, select: { id: true } })) {
        throw new ConflictError('file_exists', 'Ya existe un archivo con ese nombre.');
      }
      return this.store.insert(tx, id, actor.userId, path, content);
    });
    await this.audit.record({ type: 'file.created', actorUserId: actor.userId, target: { type: 'file', id: file.id }, outcome: 'success', metadata: { projectId: id } }, m);
    return meta(file);
  }

  /**
   * Autoguardado con control de concurrencia optimista: si `baseVersion` no es
   * la actual, alguien escribió entre medias y se devuelve 409 en vez de pisarlo.
   */
  async write(actor: Actor, projectId: string, fileId: string, content: string, baseVersion: number, m: RequestMeta): Promise<FileMeta> {
    const { id } = await this.projects.authorize(actor, projectId, 'edit_content', m);
    assertSize(content);
    const file = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      const current = await this.find(tx, id, fileId);
      if (current.version !== baseVersion) throw new ConflictError('version_conflict', 'Este archivo ha cambiado en otra pestaña o dispositivo. Recarga para ver la última versión.');
      await this.assertQuota(tx, id, Buffer.byteLength(content, 'utf8') - current.size);
      const updated = await this.store.rewrite(tx, current, actor.userId, content);
      await tx.project.update({ where: { id }, data: { lastActivityAt: new Date() } });
      return updated;
    });
    return meta(file);
  }

  async rename(actor: Actor, projectId: string, fileId: string, rawPath: string, m: RequestMeta): Promise<FileMeta> {
    const { id, row } = await this.projects.authorize(actor, projectId, 'edit_content', m);
    const path = SafeFilePath.of(rawPath);
    const result = await this.db.asUser(asUserId(actor.userId), async (tx) => {
      const current = await this.find(tx, id, fileId);
      if (current.path === row.mainFile) throw new ConflictError('main_file', 'Es el documento principal: elige otro principal antes de renombrarlo.');
      if (await tx.projectFile.findFirst({ where: { projectId: id, path: path.toString(), NOT: { id: current.id } }, select: { id: true } })) {
        throw new ConflictError('file_exists', 'Ya existe un archivo con ese nombre.');
      }
      // La ruta no forma parte de la AAD: renombrar no obliga a recifrar.
      return tx.projectFile.update({ where: { id: current.id }, data: { path: path.toString(), kind: path.extension, updatedBy: actor.userId } });
    });
    await this.audit.record({ type: 'file.renamed', actorUserId: actor.userId, target: { type: 'file', id: result.id }, outcome: 'success', metadata: { projectId: id } }, m);
    return meta(result);
  }

  async remove(actor: Actor, projectId: string, fileId: string, m: RequestMeta): Promise<void> {
    const { id, row } = await this.projects.authorize(actor, projectId, 'edit_content', m);
    await this.db.asUser(asUserId(actor.userId), async (tx) => {
      const current = await this.find(tx, id, fileId);
      if (current.path === row.mainFile) throw new ConflictError('main_file', 'No puedes eliminar el documento principal.');
      await tx.projectFile.delete({ where: { id: current.id } });
    });
    await this.audit.record({ type: 'file.deleted', actorUserId: actor.userId, target: { type: 'file', id: fileId }, outcome: 'success', metadata: { projectId: id } }, m);
  }

  /**
   * Análisis de seguridad AUTORITATIVO antes de compilar (F-264). Los
   * bloqueos se auditan: son la señal más directa de un intento de abuso.
   */
  async analyze(actor: Actor, projectId: string, m: RequestMeta): Promise<AnalysisResult> {
    const files = await this.readAll(actor, projectId, m);
    const findings = analyzeLatex(files);
    const blocked = findings.some((f) => f.severity === 'blocking');
    // Solo se auditan los bloqueos: los avisos se repetirían en cada autocompilación.
    if (blocked) {
      await this.audit.record({
        type: 'compile.blocked',
        severity: 'warning',
        actorUserId: actor.userId,
        target: { type: 'project', id: projectId },
        outcome: 'denied',
        reason: findings.find((f) => f.severity === 'blocking')?.rule ?? 'unknown',
        metadata: { findings: findings.length },
      }, m);
    }
    return { verdict: blocked ? 'blocked' : findings.length ? 'warnings' : 'clean', findings, analyzedFiles: files.length };
  }

  private async find(tx: AppTx, projectId: string, fileId: string): Promise<ProjectFile> {
    if (!isUuid(fileId)) throw new NotFoundError();
    const file = await tx.projectFile.findFirst({ where: { id: fileId, projectId } });
    if (!file) throw new NotFoundError();
    return file;
  }

  /** Cuotas (F-074): número de archivos en las altas y tamaño total siempre. */
  private async assertQuota(tx: AppTx, projectId: string, extraBytes: number, isNewFile = false): Promise<void> {
    const agg = await tx.projectFile.aggregate({ where: { projectId }, _sum: { size: true }, _count: true });
    if (isNewFile && agg._count >= FILES.MAX_FILES_PER_PROJECT) {
      throw new ValidationError({ path: 'El proyecto ya tiene 200 archivos.' }, 'Has alcanzado el número máximo de archivos.');
    }
    if ((agg._sum.size ?? 0) + extraBytes > FILES.MAX_PROJECT_BYTES) {
      throw new ValidationError({ content: 'El proyecto supera su cuota de 20 MB.' }, 'Has alcanzado el espacio máximo del proyecto.');
    }
  }

  /** Un fallo de integridad (C4) se audita como incidente crítico antes de propagarse. */
  private async withIntegrity<T>(actor: Actor, projectId: string, m: RequestMeta, fn: (tx: AppTx) => Promise<T>): Promise<T> {
    try {
      return await this.db.asUser(asUserId(actor.userId), fn);
    } catch (e) {
      if (e instanceof IntegrityError) {
        await this.audit.record({ type: 'integrity.violation', severity: 'critical', actorUserId: actor.userId, target: { type: 'project', id: projectId }, outcome: 'failure', reason: e.stage }, m);
      }
      throw e;
    }
  }
}
