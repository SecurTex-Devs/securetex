import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CollabService } from '../../application/collab/collab.service';
import { FilesService } from '../../application/files/files.service';
import type { Actor, RequestMeta } from '../../application/request-meta';
import { ValidationError } from '../../domain/errors';
import { envelopeContext, TransportCrypto } from '../../infrastructure/security/transport';
import { AnalysisDto, CreateFileDto, FileMetaDto, RenameFileDto, SealedResponseDto, WriteFileDto } from './files.dto';
import { StatusResponseDto } from './responses.dto';
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

@ApiTags('Compilación')
@Controller({ path: 'projects/:projectId/compile', version: '1' })
export class CompileController {
  constructor(
    private readonly files: FilesService,
    private readonly collab: CollabService,
  ) {}

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
