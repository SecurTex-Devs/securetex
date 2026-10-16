import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminUsersService } from '../../application/admin/admin-users.service';
import { AuditLog } from '../../application/audit/audit-log';
import type { Actor, RequestMeta } from '../../application/request-meta';
import { AdminUserDto } from './files.dto';
import { Databases } from '../../infrastructure/db/databases';
import { AuditEventDto, ChainVerificationDto, HealthDto, StatusResponseDto } from './responses.dto';
import { CurrentActor, Meta, Policy } from './security';

@ApiTags('Sistema')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly db: Databases) {}

  @Get()
  @Policy('public')
  @SkipThrottle()
  @ApiOperation({ summary: 'Sonda de salud' })
  async health(): Promise<HealthDto> {
    const database = await this.db.ping();
    return { status: database ? 'ok' : 'degraded', database };
  }
}

/**
 * Administración mínima (F-236): ver y verificar la auditoría global.
 * ⚠️ En el diseño completo va en un documento OpenAPI separado y no publicado.
 */
@ApiTags('Administración')
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly db: Databases,
    private readonly audit: AuditLog,
    private readonly users: AdminUsersService,
  ) {}

  @Get('users')
  @Policy('system_admin')
  @ApiOperation({ summary: 'Usuarios de la plataforma', description: 'Sin acceso al contenido de los proyectos.' })
  async listUsers(@Query('q') q?: string): Promise<AdminUserDto[]> {
    return this.users.list(typeof q === 'string' ? q : undefined);
  }

  @Post('users/:userId/suspend')
  @HttpCode(200)
  @Policy('system_admin')
  @ApiOperation({ summary: 'Suspender una cuenta', description: 'Revoca todas sus sesiones al instante. Auditado.' })
  async suspend(@Param('userId', new ParseUUIDPipe()) userId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.users.setSuspended(actor, userId, true, meta);
    return { status: 'suspended' };
  }

  @Post('users/:userId/reactivate')
  @HttpCode(200)
  @Policy('system_admin')
  @ApiOperation({ summary: 'Reactivar una cuenta' })
  async reactivate(@Param('userId', new ParseUUIDPipe()) userId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.users.setSuspended(actor, userId, false, meta);
    return { status: 'active' };
  }

  @Get('audit')
  @Policy('system_admin')
  @ApiOperation({ summary: 'Últimos eventos de auditoría (global)' })
  async events(): Promise<AuditEventDto[]> {
    const rows = await this.db.audit.auditEvent.findMany({ orderBy: { seq: 'desc' }, take: 200 });
    return rows.map((r) => ({
      seq: r.seq.toString(), id: r.id, occurredAt: r.occurredAt, eventType: r.eventType, severity: r.severity,
      actorUserId: r.actorUserId, actorIpPrefix: r.actorIpPrefix, targetType: r.targetType, targetId: r.targetId,
      outcome: r.outcome, reason: r.reason, hash: Buffer.from(r.hash).toString('hex'),
    }));
  }

  @Get('audit/verify')
  @Policy('system_admin')
  @ApiOperation({ summary: 'Verificar la integridad de la cadena de hashes' })
  async verify(): Promise<ChainVerificationDto> {
    return this.audit.verifyChain();
  }
}
