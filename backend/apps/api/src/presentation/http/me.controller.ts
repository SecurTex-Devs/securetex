import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Prisma } from '@prisma/client';
import type { FastifyReply } from 'fastify';
import { AccountService } from '../../application/account/account.service';
import type { Actor, RequestMeta } from '../../application/request-meta';
import { ValidationError } from '../../domain/errors';
import { DeleteAccountDto, SavePreferencesDto, UpdateProfileDto } from './auth.dto';
import { clearSessionCookies } from './cookies';
import { ActivityDto, DeletionImpactDto, IdentityDto, PreferencesDto, ProfileDto, SessionDto, StatusResponseDto } from './responses.dto';
import { CurrentActor, Meta, Policy } from './security';
import { AllowDemo } from './demo-access';

const HOUR = 3_600_000;
// Incluye los comandos LaTeX personalizados de la paleta del editor.
const MAX_PREFS_BYTES = 32_768;

@ApiTags('Cuenta')
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly account: AccountService) {}

  @Get()
  @AllowDemo()
  @Policy('authenticated')
  @ApiOperation({ summary: 'Perfil del usuario actual' })
  async me(@CurrentActor() actor: Actor): Promise<ProfileDto> {
    return { ...await this.account.profile(actor), isDemo: actor.isDemo === true };
  }

  @Patch()
  @Policy('authenticated')
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @ApiOperation({ summary: 'Actualizar el perfil' })
  async update(@Body() dto: UpdateProfileDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ProfileDto> {
    return this.account.updateProfile(actor, dto, meta);
  }

  @Get('sessions')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Sesiones activas', description: 'Dispositivo, IP anonimizada y última actividad (RF-008).' })
  async sessions(@CurrentActor() actor: Actor): Promise<SessionDto[]> {
    return this.account.listSessions(actor);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(200)
  @Policy('authenticated')
  @Throttle({ default: { limit: 20, ttl: HOUR } })
  @ApiOperation({ summary: 'Revocar una sesión propia' })
  async revokeSession(@Param('sessionId', new ParseUUIDPipe()) sessionId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.account.revokeSession(actor, sessionId, meta);
    return { status: 'revoked' };
  }

  @Get('identities')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Proveedores de identidad vinculados' })
  async identities(@CurrentActor() actor: Actor): Promise<IdentityDto[]> {
    return this.account.identities(actor);
  }

  @Delete('identities/:identityId')
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @ApiOperation({ summary: 'Desvincular un proveedor externo', description: 'Exige reautenticación y que quede otra forma de entrar.' })
  async unlinkIdentity(@Param('identityId', new ParseUUIDPipe()) identityId: string, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.account.unlinkIdentity(actor, identityId, meta);
    return { status: 'unlinked' };
  }

  @Get('activity')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Actividad reciente de la cuenta', description: 'Vista de solo lectura sobre la auditoría propia (F-024).' })
  async activity(@CurrentActor() actor: Actor): Promise<ActivityDto[]> {
    return (await this.account.activity(actor)).map((e) => ({ ...e, metadata: (e.metadata ?? {}) as Record<string, unknown> }));
  }

  @Get('preferences')
  @AllowDemo()
  @Policy('authenticated')
  @ApiOperation({ summary: 'Preferencias del editor' })
  async preferences(@CurrentActor() actor: Actor): Promise<PreferencesDto> {
    return { prefs: (await this.account.preferences(actor)) as Record<string, unknown> };
  }

  @Put('preferences')
  @Policy('authenticated')
  @Throttle({ default: { limit: 300, ttl: HOUR } })
  @ApiOperation({ summary: 'Guardar las preferencias del editor' })
  async savePreferences(@Body() dto: SavePreferencesDto, @CurrentActor() actor: Actor): Promise<PreferencesDto> {
    const prefs = dto.prefs as unknown;
    const isPlainObject = typeof prefs === 'object' && prefs !== null && !Array.isArray(prefs);
    // Límite de tamaño: un objeto libre no puede convertirse en almacenamiento arbitrario.
    if (!isPlainObject || JSON.stringify(prefs).length > MAX_PREFS_BYTES) {
      throw new ValidationError({ prefs: 'Preferencias no válidas.' });
    }
    return { prefs: (await this.account.savePreferences(actor, prefs as Prisma.InputJsonObject)) as Record<string, unknown> };
  }

  @Get('deletion-impact')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Qué se perdería al eliminar la cuenta' })
  async deletionImpact(@CurrentActor() actor: Actor): Promise<DeletionImpactDto> {
    return this.account.deletionImpact(actor);
  }

  @Delete()
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 3, ttl: 24 * HOUR } })
  @ApiOperation({ summary: 'Eliminar la cuenta', description: 'Requiere reautenticación reciente y la frase de confirmación.' })
  async deleteAccount(@Body() dto: DeleteAccountDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply): Promise<StatusResponseDto> {
    await this.account.deleteAccount(actor, dto.confirmation, meta);
    clearSessionCookies(reply);
    return { status: 'deleted' };
  }
}
