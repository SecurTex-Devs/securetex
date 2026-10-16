import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CollabService } from '../../application/collab/collab.service';
import { CompileService, type CompileOutput } from '../../application/compile/compile.service';
import { FilesService } from '../../application/files/files.service';
import type { Actor, RequestMeta } from '../../application/request-meta';
import { ValidationError } from '../../domain/errors';
import { envelopeContext, TransportCrypto } from '../../infrastructure/security/transport';
import { AnalysisDto, CreateFileDto, FileMetaDto, FileVersionDto, RenameFileDto, SealedResponseDto, UploadFileDto, WriteFileDto } from './files.dto';
import { DuplicateProjectDto } from './projects.dto';
import { ProjectDto, StatusResponseDto } from './responses.dto';
import { CurrentActor, Meta, Policy } from './security';

const MINUTE = 60_000;
const uuid = new ParseUUIDPipe();
const REPLY_KEY = 'x-securtex-reply-key';

const replyKeyHeader = ApiHeader({ name: 'X-SecurTex-Reply-Key', required: true, description: 'Clave pública X25519 efímera del cliente (base64url): la respuesta se sella para ella (C2).' });

/**
 * Archivos del proyecto.
 *
 * En reposo: AES-256-GCM con DEK por archivo envuelta con la KEK del proyecto
 * (C3) y HMAC verificado antes de descifrar (C4). En tránsito, además de TLS:
 * el contenido viaja siempre en un sobre C1 + C2, en los dos sentidos.
 * Lectura: cualquier miembro. Escritura: editor o propietario.
 */
@ApiTags('Archivos')
@Controller({ path: 'projects/:projectId/files', version: '1' })
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly collab: CollabService,
    private readonly transport: TransportCrypto,
  ) {}

  @Get()
  @Policy('authenticated')
  @ApiOperation({ summary: 'Árbol de archivos (solo metadatos)' })
  async list(@Param('projectId', uuid) projectId: string, @CurrentActor() actor: Actor): Promise<FileMetaDto[]> {
    return this.files.list(actor, projectId);
  }

  @Get('contents')
  @Policy('authenticated')
  @Throttle({ default: { limit: 120, ttl: MINUTE } })
  @replyKeyHeader
  @ApiOperation({ summary: 'Todos los archivos, sellados para el cliente', description: 'C4 (HMAC) → C3 (descifrado) en el servidor; después C1 + C2 hacia el cliente.' })
  async contents(@Param('projectId', uuid) projectId: string, @Headers(REPLY_KEY) replyKey: string | undefined, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<SealedResponseDto> {
    const recipient = this.recipient(replyKey);
    await this.collab.persistNow(projectId);
    const files = await this.files.readAll(actor, projectId, meta);
    return { envelope: this.transport.seal(Buffer.from(JSON.stringify(files), 'utf8'), recipient, envelopeContext(projectId, 'files:contents')) };
  }

  @Get(':fileId')
  @Policy('authenticated')
  @replyKeyHeader
  @ApiOperation({ summary: 'Un archivo, sellado para el cliente' })
  async read(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @Headers(REPLY_KEY) replyKey: string | undefined, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<SealedResponseDto> {
    const recipient = this.recipient(replyKey);
    await this.collab.persistNow(projectId);
    const file = await this.files.read(actor, projectId, fileId, meta);
    return { envelope: this.transport.seal(Buffer.from(JSON.stringify(file), 'utf8'), recipient, envelopeContext(projectId, `file:${fileId}`)) };
  }

  @Post()
  @Policy('authenticated')
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  @ApiOperation({ summary: 'Crear un archivo de texto', description: 'Contenido en un sobre C1 + C2. Ruta validada por SafeFilePath; cuota de 1 MB por archivo y 20 MB por proyecto.' })
  async create(@Param('projectId', uuid) projectId: string, @Body() dto: CreateFileDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileMetaDto> {
    const content = this.opened(dto.envelope, envelopeContext(projectId, 'file:create'));
    const file = await this.files.create(actor, projectId, dto.path, content, meta);
    await this.collab.fileCreated(projectId, file.id, content);
    return file;
  }

  @Post('upload')
  @Policy('authenticated')
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @ApiOperation({ summary: 'Subir una imagen (PNG, JPG) o un PDF', description: 'Bytes en un sobre C1 + C2. Tipo real comprobado por magic bytes; máximo 5 MB; cifrado en reposo.' })
  async upload(@Param('projectId', uuid) projectId: string, @Body() dto: UploadFileDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileMetaDto> {
    const bytes = this.transport.open(dto.envelope, envelopeContext(projectId, 'file:upload'));
    const file = await this.files.upload(actor, projectId, dto.path, bytes, meta);
    await this.collab.treeChanged(projectId);
    return file;
  }

  @Put(':fileId/content')
  @Policy('authenticated')
  @Throttle({ default: { limit: 600, ttl: MINUTE } })
  @ApiOperation({ summary: 'Guardar el contenido', description: 'Sobre C1 + C2. Concurrencia optimista: 409 si `baseVersion` no es la actual. El editor usa la colaboración en tiempo real; esta ruta es para clientes de la API.' })
  async write(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @Body() dto: WriteFileDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileMetaDto> {
    const content = this.opened(dto.envelope, envelopeContext(projectId, `file:${fileId}:write`));
    await this.collab.persistNow(projectId);
    const file = await this.files.write(actor, projectId, fileId, content, dto.baseVersion, meta);
    await this.collab.fileCreated(projectId, file.id, content);
    return file;
  }

  @Get(':fileId/versions')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Historial de versiones de un archivo', description: 'Instantáneas cifradas con autor y fecha (F-150).' })
  async versions(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @CurrentActor() actor: Actor): Promise<FileVersionDto[]> {
    return this.files.listVersions(actor, projectId, fileId);
  }

  @Get(':fileId/versions/:versionId')
  @Policy('authenticated')
  @replyKeyHeader
  @ApiOperation({ summary: 'Contenido de una versión, sellado para el cliente' })
  async version(
    @Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @Param('versionId', uuid) versionId: string,
    @Headers(REPLY_KEY) replyKey: string | undefined, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta,
  ): Promise<SealedResponseDto> {
    const recipient = this.recipient(replyKey);
    const content = await this.files.readVersion(actor, projectId, fileId, versionId, meta);
    return { envelope: this.transport.seal(Buffer.from(content, 'utf8'), recipient, envelopeContext(projectId, `version:${versionId}`)) };
  }

  @Post(':fileId/versions/:versionId/restore')
  @HttpCode(200)
  @Policy('authenticated')
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @ApiOperation({ summary: 'Restaurar una versión', description: 'Crea un cambio nuevo con el contenido antiguo; no borra el historial intermedio. Lo ven al instante quienes estén editando.' })
  async restore(
    @Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @Param('versionId', uuid) versionId: string,
    @CurrentActor() actor: Actor, @Meta() meta: RequestMeta,
  ): Promise<StatusResponseDto> {
    const content = await this.files.restoreVersion(actor, projectId, fileId, versionId, meta);
    // Con la sala abierta, el cambio entra en el CRDT; si no, se escribe directamente (cifrado).
    if (!(await this.collab.replaceFile(projectId, fileId, content, actor.userId))) {
      await this.files.persistFromCollab(actor.userId, projectId, fileId, content);
      await this.files.snapshotVersion(actor.userId, projectId, fileId, content);
    }
    return { status: 'restored' };
  }

  @Patch(':fileId')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Renombrar o mover un archivo' })
  async rename(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @Body() dto: RenameFileDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileMetaDto> {
    const file = await this.files.rename(actor, projectId, fileId, dto.path, meta);
    await this.collab.treeChanged(projectId);
    return file;
  }

  @Delete(':fileId')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Eliminar un archivo', description: 'El documento principal no se puede eliminar.' })
  async remove(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.files.remove(actor, projectId, fileId, meta);
    await this.collab.fileDeleted(projectId, fileId);
    return { status: 'deleted' };
  }

  private recipient(header: string | undefined): Buffer {
    if (!header) throw new ValidationError({ replyKey: 'Falta la cabecera X-SecurTex-Reply-Key.' }, 'Falta la clave efímera del cliente para cifrar la respuesta.');
    return this.transport.parseReplyKey(header);
  }

  private opened(envelope: unknown, context: string): string {
    return this.transport.open(envelope, context).toString('utf8');
  }
}

/**
 * Texto plano del sobre de una compilación (v2): u32be(longitud) ‖ cabecera
 * JSON ‖ bytes del PDF ‖ mapa SyncTeX. `pdfBytes` y `synctexBytes` delimitan
 * cada parte. Binario a propósito: un PDF de 16 MB no se infla con un segundo
 * base64 dentro del JSON. El mapa lleva su propia firma (`synctex.signature`).
 */
function compileFrame(out: CompileOutput): Buffer {
  const b64 = (b: Buffer) => b.toString('base64url');
  const header = Buffer.from(JSON.stringify({
    v: 2,
    compilationId: out.compilationId, status: out.status, engine: out.engine, mainFile: out.mainFile,
    durationMs: out.durationMs, runs: out.runs, log: out.log, diagnostics: out.diagnostics, warnings: out.warnings,
    pdfBytes: out.pdf?.length ?? 0,
    signature: out.signature
      ? { alg: out.signature.alg, pdfSha256: b64(out.signature.pdfSha256), sourceTreeHash: b64(out.signature.sourceTreeHash), value: b64(out.signature.value) }
      : null,
    synctexBytes: out.synctex?.map.length ?? 0,
    synctex: out.synctex ? { alg: 'Ed25519', sha256: b64(out.synctex.sha256), value: b64(out.synctex.signature) } : null,
  }), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, out.pdf ?? Buffer.alloc(0), out.synctex?.map ?? Buffer.alloc(0)]);
}

@ApiTags('Proyectos')
@Controller({ path: 'projects/:projectId/duplicate', version: '1' })
export class DuplicateController {
  constructor(
    private readonly files: FilesService,
    private readonly collab: CollabService,
  ) {}

  @Post()
  @Policy('authenticated')
  @Throttle({ default: { limit: 10, ttl: 10 * MINUTE } })
  @ApiOperation({ summary: 'Hacer una copia del proyecto', description: 'Proyecto nuevo con su propia clave; los archivos se recifran.' })
  async duplicate(@Param('projectId', uuid) projectId: string, @Body() dto: DuplicateProjectDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ProjectDto> {
    // Se copia lo último que se haya escrito en la sala, no lo guardado hace unos segundos.
    await this.collab.persistNow(projectId);
    return this.files.duplicateProject(actor, projectId, dto.name, meta);
  }
}

@ApiTags('Compilación')
@Controller({ path: 'projects/:projectId/compile', version: '1' })
export class CompileController {
  constructor(
    private readonly files: FilesService,
    private readonly collab: CollabService,
    private readonly compiler: CompileService,
    private readonly transport: TransportCrypto,
  ) {}

  @Post()
  @HttpCode(200)
  @Policy('authenticated')
  // Lo más costoso del servicio (T-C04). Además: una compilación a la vez por persona.
  @Throttle({ default: { limit: 12, ttl: MINUTE } })
  @replyKeyHeader
  @ApiOperation({
    summary: 'Compilar el proyecto en el sandbox y devolver el PDF firmado',
    description: 'Autoriza `compile`, repite el análisis de seguridad (422 `compile_blocked` si hay algo bloqueante) y compila en un contenedor sin red, de solo lectura, sin capacidades y con -no-shell-escape, openin_any=p, openout_any=p y un plazo de 30 s. El PDF se valida (firma %PDF, %%EOF, 16 MB), se firma con Ed25519 (C4b) y viaja en un sobre C1 + C2 con contexto `compile:pdf`: u32be(longitud) ‖ cabecera JSON ‖ PDF ‖ mapa SyncTeX (v2; `pdfBytes` y `synctexBytes` delimitan cada parte). El mapa SyncTeX (PDF ↔ archivo:línea, solo rutas del proyecto, 4 MB como mucho) se valida y se firma aparte: Ed25519("securtex:c4b:synctex:v1" ‖ SHA-256(mapa) ‖ compilationId ‖ SHA-256(pdf)). 429 `compile_busy` si ya hay una compilación en curso; 503 `compiler_unavailable` si el sandbox no responde.',
  })
  async compile(@Param('projectId', uuid) projectId: string, @Headers(REPLY_KEY) replyKey: string | undefined, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<SealedResponseDto> {
    if (!replyKey) throw new ValidationError({ replyKey: 'Falta la cabecera X-SecurTex-Reply-Key.' }, 'Falta la clave efímera del cliente para cifrar la respuesta.');
    const recipient = this.transport.parseReplyKey(replyKey);
    // Se compila lo último que hay en la sala de colaboración, no lo último guardado.
    await this.collab.persistNow(projectId);
    const out = await this.compiler.compile(actor, projectId, meta);
    return { envelope: this.transport.seal(compileFrame(out), recipient, envelopeContext(projectId, 'compile:pdf')) };
  }

  @Post('analyze')
  @HttpCode(200)
  @Policy('authenticated')
  // La autocompilación lo invoca al dejar de escribir (como mucho cada 1,5 s).
  @Throttle({ default: { limit: 120, ttl: MINUTE } })
  @ApiOperation({ summary: 'Análisis de seguridad previo a la compilación', description: 'Decisión autoritativa del servidor: \\write18, lecturas fuera del proyecto, código Lua, E/S directa. Los bloqueos se auditan.' })
  async analyze(@Param('projectId', uuid) projectId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<AnalysisDto> {
    // Lo que se está editando en tiempo real se escribe antes de analizar: se analiza lo último.
    await this.collab.persistNow(projectId);
    const result = await this.files.analyze(actor, projectId, meta);
    return { ...result, findings: [...result.findings] };
  }
}
