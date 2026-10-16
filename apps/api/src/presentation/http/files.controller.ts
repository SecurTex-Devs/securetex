import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FilesService } from '../../application/files/files.service';
import type { Actor, RequestMeta } from '../../application/request-meta';
import { AnalysisDto, CreateFileDto, FileMetaDto, FileWithContentDto, RenameFileDto, WriteFileDto } from './files.dto';
import { StatusResponseDto } from './responses.dto';
import { CurrentActor, Meta, Policy } from './security';

const MINUTE = 60_000;
const uuid = new ParseUUIDPipe();

/**
 * Archivos del proyecto. Se almacenan cifrados (AES-256-GCM con DEK por
 * archivo envuelta con la KEK del proyecto) y se verifica su HMAC antes de
 * descifrarlos. Lectura: cualquier miembro. Escritura: editor o propietario.
 */
@ApiTags('Archivos')
@Controller({ path: 'projects/:projectId/files', version: '1' })
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @Policy('authenticated')
  @ApiOperation({ summary: 'Árbol de archivos (solo metadatos)' })
  async list(@Param('projectId', uuid) projectId: string, @CurrentActor() actor: Actor): Promise<FileMetaDto[]> {
    return this.files.list(actor, projectId);
  }

  @Get('contents')
  @Policy('authenticated')
  @Throttle({ default: { limit: 120, ttl: MINUTE } })
  @ApiOperation({ summary: 'Todos los archivos descifrados', description: 'Verifica el HMAC de cada archivo antes de descifrarlo (C4).' })
  async contents(@Param('projectId', uuid) projectId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileWithContentDto[]> {
    return this.files.readAll(actor, projectId, meta);
  }

  @Get(':fileId')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Un archivo descifrado' })
  async read(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileWithContentDto> {
    return this.files.read(actor, projectId, fileId, meta);
  }

  @Post()
  @Policy('authenticated')
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  @ApiOperation({ summary: 'Crear un archivo de texto', description: 'Ruta validada por SafeFilePath; cuota de 1 MB por archivo y 20 MB por proyecto.' })
  async create(@Param('projectId', uuid) projectId: string, @Body() dto: CreateFileDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileMetaDto> {
    return this.files.create(actor, projectId, dto.path, dto.content, meta);
  }

  @Put(':fileId/content')
  @Policy('authenticated')
  @Throttle({ default: { limit: 600, ttl: MINUTE } })
  @ApiOperation({ summary: 'Guardar el contenido (autoguardado)', description: 'Concurrencia optimista: 409 si `baseVersion` no es la actual.' })
  async write(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @Body() dto: WriteFileDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileMetaDto> {
    return this.files.write(actor, projectId, fileId, dto.content, dto.baseVersion, meta);
  }

  @Patch(':fileId')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Renombrar o mover un archivo' })
  async rename(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @Body() dto: RenameFileDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<FileMetaDto> {
    return this.files.rename(actor, projectId, fileId, dto.path, meta);
  }

  @Delete(':fileId')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Eliminar un archivo', description: 'El documento principal no se puede eliminar.' })
  async remove(@Param('projectId', uuid) projectId: string, @Param('fileId', uuid) fileId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.files.remove(actor, projectId, fileId, meta);
    return { status: 'deleted' };
  }
}

@ApiTags('Compilación')
@Controller({ path: 'projects/:projectId/compile', version: '1' })
export class CompileController {
  constructor(private readonly files: FilesService) {}

  @Post('analyze')
  @HttpCode(200)
  @Policy('authenticated')
  // La autocompilación lo invoca al dejar de escribir (como mucho cada 1,5 s).
  @Throttle({ default: { limit: 120, ttl: MINUTE } })
  @ApiOperation({ summary: 'Análisis de seguridad previo a la compilación', description: 'Decisión autoritativa del servidor: \\write18, lecturas fuera del proyecto, código Lua, E/S directa. Los bloqueos se auditan.' })
  async analyze(@Param('projectId', uuid) projectId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<AnalysisDto> {
    const result = await this.files.analyze(actor, projectId, meta);
    return { ...result, findings: [...result.findings] };
  }
}
