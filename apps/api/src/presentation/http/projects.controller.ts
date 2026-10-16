import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ProjectsService } from '../../application/projects/projects.service';
import type { Actor, RequestMeta } from '../../application/request-meta';
import {
  ChangeRoleDto, CreateProjectDto, CreateTagDto, InviteMemberDto, ListProjectsQueryDto, SetTagsDto, UpdateProjectDto,
} from './projects.dto';
import { InvitationDto, MembersDto, ProjectDto, ProjectListDto, ReceivedInvitationDto, StatusResponseDto, TagDto } from './responses.dto';
import { CurrentActor, Meta, Policy } from './security';

const MINUTE = 60_000;
const uuid = new ParseUUIDPipe();

/**
 * Todos los endpoints exigen sesión. La autorización por proyecto la decide el
 * dominio (ProjectsService → project-policy) y la repite RLS en PostgreSQL.
 * Los identificadores de ruta son UUIDv7, nunca enteros (RS-011).
 */
@ApiTags('Proyectos')
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @Policy('authenticated')
  @ApiOperation({ summary: 'Listar proyectos con filtros, búsqueda y etiquetas' })
  async list(@Query() q: ListProjectsQueryDto, @CurrentActor() actor: Actor): Promise<ProjectListDto> {
    return this.projects.list(actor, {
      filter: q.filter ?? 'all',
      sort: q.sort ?? '-lastActivity',
      ...(q.q ? { q: q.q } : {}),
      ...(q.tag ? { tagId: q.tag } : {}),
    });
  }

  @Post()
  @Policy('authenticated')
  @Throttle({ default: { limit: 30, ttl: 10 * MINUTE } })
  @ApiOperation({ summary: 'Crear un proyecto en blanco', description: 'Requiere el correo verificado (RF-001).' })
  async create(@Body() dto: CreateProjectDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ProjectDto> {
    return this.projects.create(actor, dto.name, dto.compiler, dto.template ?? 'blank', meta);
  }

  @Get(':projectId')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Detalle del proyecto', description: '404 uniforme si no existe o no eres miembro (T-P07).' })
  async get(@Param('projectId', uuid) id: string, @CurrentActor() actor: Actor): Promise<ProjectDto> {
    return this.projects.get(actor, id);
  }

  @Patch(':projectId')
  @Policy('authenticated')
  @Throttle({ default: { limit: 60, ttl: 10 * MINUTE } })
  @ApiOperation({ summary: 'Renombrar (propietario) o cambiar compilador y documento principal (editor)' })
  async update(@Param('projectId', uuid) id: string, @Body() dto: UpdateProjectDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ProjectDto> {
    return this.projects.update(actor, id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.compiler !== undefined ? { compiler: dto.compiler } : {}),
      ...(dto.mainFile !== undefined ? { mainFile: dto.mainFile } : {}),
    }, meta);
  }

  @Post(':projectId/archive')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Archivar' })
  async archive(@Param('projectId', uuid) id: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ProjectDto> {
    return this.projects.setLifecycle(actor, id, 'archive', meta);
  }

  @Post(':projectId/unarchive')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Desarchivar' })
  async unarchive(@Param('projectId', uuid) id: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ProjectDto> {
    return this.projects.setLifecycle(actor, id, 'unarchive', meta);
  }

  @Post(':projectId/trash')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Mover a la papelera', description: 'Se purga a los 30 días.' })
  async trash(@Param('projectId', uuid) id: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ProjectDto> {
    return this.projects.setLifecycle(actor, id, 'trash', meta);
  }

  @Post(':projectId/restore')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Restaurar desde la papelera' })
  async restore(@Param('projectId', uuid) id: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ProjectDto> {
    return this.projects.setLifecycle(actor, id, 'restore', meta);
  }

  @Delete(':projectId')
  @HttpCode(200)
  @Policy('authenticated')
  @Throttle({ default: { limit: 20, ttl: 10 * MINUTE } })
  @ApiOperation({ summary: 'Eliminar definitivamente', description: 'Solo desde la papelera y por el propietario.' })
  async remove(@Param('projectId', uuid) id: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.projects.deleteForever(actor, id, meta);
    return { status: 'deleted' };
  }

  @Post(':projectId/leave')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Abandonar un proyecto compartido' })
  async leave(@Param('projectId', uuid) id: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.projects.leave(actor, id, meta);
    return { status: 'left' };
  }

  @Get(':projectId/members')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Colaboradores e invitaciones pendientes' })
  async members(@Param('projectId', uuid) id: string, @CurrentActor() actor: Actor): Promise<MembersDto> {
    return this.projects.members(actor, id);
  }

  @Post(':projectId/invitations')
  @Policy('authenticated')
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @ApiOperation({ summary: 'Invitar por correo', description: 'Solo el propietario. El rol owner no es invitable.' })
  async invite(@Param('projectId', uuid) id: string, @Body() dto: InviteMemberDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<InvitationDto> {
    return this.projects.invite(actor, id, dto.email, dto.role, meta);
  }

  @Delete(':projectId/invitations/:invitationId')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Revocar una invitación pendiente' })
  async revokeInvitation(@Param('projectId', uuid) id: string, @Param('invitationId', uuid) invitationId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.projects.revokeInvitation(actor, id, invitationId, meta);
    return { status: 'revoked' };
  }

  @Patch(':projectId/members/:userId')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Cambiar el rol de un colaborador' })
  async changeRole(@Param('projectId', uuid) id: string, @Param('userId', uuid) userId: string, @Body() dto: ChangeRoleDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.projects.changeRole(actor, id, userId, dto.role, meta);
    return { status: 'updated' };
  }

  @Delete(':projectId/members/:userId')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Revocar el acceso de un colaborador' })
  async revokeMember(@Param('projectId', uuid) id: string, @Param('userId', uuid) userId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.projects.revokeMember(actor, id, userId, meta);
    return { status: 'revoked' };
  }

  @Put(':projectId/tags')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Asignar tus etiquetas privadas al proyecto' })
  async setTags(@Param('projectId', uuid) id: string, @Body() dto: SetTagsDto, @CurrentActor() actor: Actor): Promise<ProjectDto> {
    return this.projects.setProjectTags(actor, id, dto.tagIds);
  }
}

@ApiTags('Proyectos')
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @Policy('authenticated')
  @ApiOperation({ summary: 'Invitaciones recibidas pendientes' })
  async mine(@CurrentActor() actor: Actor): Promise<ReceivedInvitationDto[]> {
    return this.projects.myInvitations(actor);
  }

  @Post(':invitationId/accept')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Aceptar una invitación' })
  async accept(@Param('invitationId', uuid) id: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.projects.respondInvitation(actor, id, true, meta);
    return { status: 'accepted' };
  }

  @Post(':invitationId/decline')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Rechazar una invitación' })
  async decline(@Param('invitationId', uuid) id: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.projects.respondInvitation(actor, id, false, meta);
    return { status: 'declined' };
  }
}

@ApiTags('Etiquetas')
@Controller({ path: 'tags', version: '1' })
export class TagsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @Policy('authenticated')
  @ApiOperation({ summary: 'Tus etiquetas privadas' })
  async list(@CurrentActor() actor: Actor): Promise<TagDto[]> {
    return this.projects.tags(actor);
  }

  @Post()
  @Policy('authenticated')
  @Throttle({ default: { limit: 30, ttl: 10 * MINUTE } })
  @ApiOperation({ summary: 'Crear una etiqueta' })
  async create(@Body() dto: CreateTagDto, @CurrentActor() actor: Actor): Promise<TagDto> {
    return this.projects.createTag(actor, dto.name, dto.color ?? 'blue');
  }

  @Delete(':tagId')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Eliminar una etiqueta', description: 'No elimina los proyectos.' })
  async remove(@Param('tagId', uuid) id: string, @CurrentActor() actor: Actor): Promise<StatusResponseDto> {
    await this.projects.deleteTag(actor, id);
    return { status: 'deleted' };
  }
}
