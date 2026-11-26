import { Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { DemoService } from '../../application/demo/demo.service';
import type { RequestMeta } from '../../application/request-meta';
import { loadEnv } from '../../config/env';
import { DEMO } from '../../domain/demo';
import { setSessionCookies } from './cookies';
import { AllowDemo } from './demo-access';
import { Meta, Policy } from './security';

export class DemoConfigDto {
  @ApiProperty() readonly enabled!: boolean;
  @ApiProperty() readonly registrationEnabled!: boolean;
  @ApiProperty() readonly sessionMinutes!: number;
}

export class DemoSessionDto {
  @ApiProperty({ format: 'uuid' }) readonly projectId!: string;
  @ApiProperty({ format: 'date-time' }) readonly expiresAt!: Date;
}

@ApiTags('Demostración')
@Controller({ path: 'auth/demo', version: '1' })
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get()
  @Policy('public')
  @AllowDemo()
  @ApiOperation({ summary: 'Disponibilidad de la demo y del registro público' })
  config(): DemoConfigDto {
    const env = loadEnv();
    return { enabled: env.DEMO_ENABLED, registrationEnabled: env.REGISTRATION_ENABLED, sessionMinutes: DEMO.SESSION_TTL_MS / 60_000 };
  }

  @Post()
  @HttpCode(201)
  @Policy('public')
  @AllowDemo()
  @Throttle({ default: { limit: DEMO.STARTS_PER_HOUR, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Entrar en el documento público de demostración', description: 'Sesión de 30 minutos, sin contraseña, elevación ni acceso a cuentas, administración o proyectos nuevos. Exige Origin válido.' })
  @ApiResponse({ status: 201, type: DemoSessionDto })
  @ApiResponse({ status: 403, description: 'Origin o CSRF rechazado' })
  @ApiResponse({ status: 404, description: 'Demo no disponible' })
  @ApiResponse({ status: 429, description: 'Límite por IP o global alcanzado' })
  async start(@Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply): Promise<DemoSessionDto> {
    const { session, projectId } = await this.demo.start(meta);
    setSessionCookies(reply, session);
    return { projectId, expiresAt: session.expiresAt };
  }
}
