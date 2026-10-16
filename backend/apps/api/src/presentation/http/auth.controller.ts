import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { AuthService } from '../../application/auth/auth.service';
import { MfaService } from '../../application/auth/mfa';
import { OidcService } from '../../application/auth/oidc.service';
import { SessionService } from '../../application/auth/sessions';
import type { Actor, RequestMeta } from '../../application/request-meta';
import { loadEnv } from '../../config/env';
import { AUTH } from '../../domain/constants';
import { DomainError } from '../../domain/errors';
import {
  ChangePasswordDto, EmailDto, LoginDto, MfaVerifyDto, ReauthDto, RegisterDto, ResetPasswordDto, TokenDto, TotpCodeDto,
} from './auth.dto';
import { clearChallengeCookie, clearSessionCookies, COOKIES, setChallengeCookie, setSessionCookies } from './cookies';
import {
  ClosedSessionsDto, ElevationDto, LoginResponseDto, MfaStatusDto, ProvidersDto, RecoveryCodesDto, RedirectUrlDto, RetryAfterDto,
  StatusResponseDto, TotpSetupDto,
} from './responses.dto';
import { CsrfExempt, CurrentActor, Meta, Policy, type SecuredRequest } from './security';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

@ApiTags('Autenticación')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly origin = loadEnv().APP_ORIGIN;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly oidc: OidcService,
  ) {}

  @Post('register')
  @HttpCode(202)
  @Policy('public')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Registro con correo y contraseña', description: 'Respuesta idéntica exista o no el correo (T-A09). Envía el enlace de verificación.' })
  async register(@Body() dto: RegisterDto, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.auth.register(dto, meta);
    return { status: 'verification_sent' };
  }

  @Post('verify-email')
  @HttpCode(200)
  @Policy('public')
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @ApiOperation({ summary: 'Verificar el correo con el token de un solo uso' })
  async verifyEmail(@Body() dto: TokenDto, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.auth.verifyEmail(dto.token, meta);
    return { status: 'verified' };
  }

  @Post('verify-email/resend')
  @HttpCode(200)
  @Policy('authenticated')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Reenviar el correo de verificación', description: 'Una vez cada 5 minutos.' })
  async resendVerification(@CurrentActor() actor: Actor): Promise<RetryAfterDto> {
    return this.auth.resendVerification(actor);
  }

  @Post('login')
  @HttpCode(200)
  @Policy('public')
  @Throttle({ default: { limit: 20, ttl: 15 * MINUTE } })
  @ApiOperation({ summary: 'Inicio de sesión local', description: 'Bloqueo por cuenta tras 10 fallos (15 min) y límite por IP. Si hay MFA, responde `mfa_required`.' })
  async login(@Body() dto: LoginDto, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply): Promise<LoginResponseDto> {
    const result = await this.auth.login(dto.email, dto.password, dto.remember === true, meta);
    if (result.kind === 'mfa_required') {
      setChallengeCookie(reply, COOKIES.mfa, result.challengeToken, AUTH.MFA_CHALLENGE_TTL_MS / 1000, 'strict');
      return { status: 'mfa_required' };
    }
    setSessionCookies(reply, result.session);
    return { status: 'authenticated' };
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @Policy('public')
  @Throttle({ default: { limit: 10, ttl: 10 * MINUTE } })
  @ApiOperation({ summary: 'Completar el segundo factor', description: 'Requiere la cookie del reto. Máximo 5 intentos por reto.' })
  async verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: SecuredRequest, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply): Promise<LoginResponseDto> {
    const session = await this.auth.completeMfa(req.cookies[COOKIES.mfa], { kind: dto.kind, code: dto.code }, meta);
    clearChallengeCookie(reply, COOKIES.mfa);
    setSessionCookies(reply, session);
    return { status: 'authenticated' };
  }

  @Post('refresh')
  @HttpCode(200)
  @Policy('public')
  @CsrfExempt()
  @Throttle({ default: { limit: 60, ttl: HOUR } })
  @ApiOperation({ summary: 'Rotar el refresh token', description: 'La reutilización de un token ya rotado revoca la sesión entera (RS-003).' })
  async refresh(@Req() req: SecuredRequest, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply): Promise<StatusResponseDto> {
    try {
      const rotated = await this.sessions.rotate(req.cookies[COOKIES.refresh], meta);
      setSessionCookies(reply, rotated);
      return { status: 'refreshed' };
    } catch (error: unknown) {
      if (error instanceof DomainError && error.code !== 'refresh_superseded') clearSessionCookies(reply);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(200)
  @Policy('authenticated')
  @ApiOperation({ summary: 'Cerrar la sesión actual' })
  async logout(@CurrentActor() actor: Actor, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply): Promise<StatusResponseDto> {
    await this.auth.logout(actor, meta);
    clearSessionCookies(reply);
    return { status: 'logged_out' };
  }

  @Post('logout-others')
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Cerrar todas las demás sesiones', description: 'Requiere reautenticación reciente.' })
  async logoutOthers(@CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ClosedSessionsDto> {
    return { closedSessions: await this.auth.logoutOthers(actor, meta) };
  }

  @Post('password/forgot')
  @HttpCode(202)
  @Policy('public')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Solicitar el enlace de recuperación', description: 'Respuesta idéntica exista o no la cuenta (RF-007).' })
  async forgot(@Body() dto: EmailDto, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.auth.forgotPassword(dto.email, meta);
    return { status: 'requested' };
  }

  @Post('password/reset')
  @HttpCode(200)
  @Policy('public')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Establecer una contraseña nueva con el token', description: 'Cierra todas las sesiones de la cuenta.' })
  async reset(@Body() dto: ResetPasswordDto, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.auth.resetPassword(dto.token, dto.password, meta);
    return { status: 'password_reset' };
  }

  @Post('password/change')
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Cambiar la contraseña', description: 'Requiere reautenticación reciente. Cierra las demás sesiones.' })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ClosedSessionsDto> {
    return { closedSessions: await this.auth.changePassword(actor, dto.newPassword, meta) };
  }

  @Post('reauth')
  @HttpCode(200)
  @Policy('authenticated')
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  @ApiOperation({ summary: 'Reautenticarse', description: 'Eleva la sesión 5 minutos para operaciones sensibles (RS-006).' })
  async reauth(@Body() dto: ReauthDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<ElevationDto> {
    const input = { ...(dto.password !== undefined ? { password: dto.password } : {}), ...(dto.code !== undefined ? { code: dto.code } : {}) };
    return { elevatedUntil: await this.auth.reauthenticate(actor, input, meta) };
  }

  @Get('mfa')
  @Policy('authenticated')
  @ApiOperation({ summary: 'Estado del segundo factor' })
  async mfaStatus(@CurrentActor() actor: Actor): Promise<MfaStatusDto> {
    return this.mfa.status(actor.userId);
  }

  @Post('mfa/totp/setup')
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @ApiOperation({ summary: 'Iniciar el alta de TOTP', description: 'Devuelve el secreto una sola vez.' })
  async totpSetup(@CurrentActor() actor: Actor): Promise<TotpSetupDto> {
    return this.mfa.beginTotpSetup(actor);
  }

  @Post('mfa/totp/confirm')
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @ApiOperation({ summary: 'Confirmar TOTP', description: 'Devuelve los 10 códigos de respaldo una sola vez.' })
  async totpConfirm(@Body() dto: TotpCodeDto, @CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<RecoveryCodesDto> {
    return { recoveryCodes: [...(await this.mfa.confirmTotpSetup(actor, dto.code, meta))] };
  }

  @Post('mfa/recovery-codes')
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Generar códigos de respaldo nuevos', description: 'Invalida los anteriores.' })
  async regenerateCodes(@CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<RecoveryCodesDto> {
    return { recoveryCodes: [...(await this.mfa.regenerateRecoveryCodes(actor, meta))] };
  }

  @Delete('mfa')
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @ApiOperation({ summary: 'Desactivar el segundo factor' })
  async disableMfa(@CurrentActor() actor: Actor, @Meta() meta: RequestMeta): Promise<StatusResponseDto> {
    await this.mfa.disable(actor, meta);
    return { status: 'disabled' };
  }

  @Get('providers')
  @Policy('public')
  @ApiOperation({ summary: 'Proveedores de identidad configurados' })
  providers(): ProvidersDto {
    return { providers: [...this.oidc.enabledProviders()] };
  }

  @Get('oidc/:provider')
  @Policy('public')
  @Throttle({ default: { limit: 20, ttl: HOUR } })
  @ApiOperation({ summary: 'Iniciar el flujo OIDC (Google o Microsoft)', description: 'Authorization Code + PKCE S256, state y nonce de un solo uso.' })
  async oidcStart(@Param('provider') provider: string, @Res() reply: FastifyReply): Promise<void> {
    try {
      const { url, challengeToken } = await this.oidc.start(provider);
      // SameSite=Lax: la cookie debe viajar en la navegación de vuelta desde el proveedor.
      setChallengeCookie(reply, COOKIES.oidc, challengeToken, AUTH.OIDC_CHALLENGE_TTL_MS / 1000, 'lax');
      void reply.redirect(url, 302);
    } catch (error: unknown) {
      void reply.redirect(this.loginErrorUrl(error), 302);
    }
  }

  /**
   * Vincular Google o Microsoft a la cuenta actual. POST (con CSRF) y sesión
   * reautenticada en los últimos 5 min: añadir una forma de entrar es una
   * acción sensible (RS-006). Devuelve la URL del proveedor; el navegador va allí.
   */
  @Post('oidc/:provider/link')
  @HttpCode(200)
  @Policy('elevated')
  @Throttle({ default: { limit: 10, ttl: 10 * MINUTE } })
  @ApiOperation({ summary: 'Iniciar la vinculación de un proveedor externo' })
  async oidcLink(@Param('provider') provider: string, @CurrentActor() actor: Actor, @Res({ passthrough: true }) reply: FastifyReply): Promise<RedirectUrlDto> {
    const { url, challengeToken } = await this.oidc.start(provider, actor.userId);
    setChallengeCookie(reply, COOKIES.oidc, challengeToken, AUTH.OIDC_CHALLENGE_TTL_MS / 1000, 'lax');
    return { url };
  }

  @Get('oidc/:provider/callback')
  @Policy('public')
  @ApiOperation({ summary: 'Retorno del proveedor OIDC' })
  async oidcCallback(@Param('provider') provider: string, @Req() req: SecuredRequest, @Meta() meta: RequestMeta, @Res() reply: FastifyReply): Promise<void> {
    const currentUrl = new URL(req.url, this.origin);
    const challenge = req.cookies[COOKIES.oidc];
    clearChallengeCookie(reply, COOKIES.oidc);
    try {
      const result = await this.oidc.callback(provider, currentUrl, challenge, req.actor?.userId ?? null, meta);
      if (result.kind === 'linked') {
        void reply.redirect(`${this.origin}/ajustes/cuentas?vinculado=${result.provider}`, 302);
        return;
      }
      if (result.kind === 'mfa_required') {
        setChallengeCookie(reply, COOKIES.mfa, result.challengeToken, AUTH.MFA_CHALLENGE_TTL_MS / 1000, 'strict');
        void reply.redirect(`${this.origin}/mfa`, 302);
        return;
      }
      setSessionCookies(reply, result.session);
      void reply.redirect(`${this.origin}/proyectos`, 302);
    } catch (error: unknown) {
      void reply.redirect(this.loginErrorUrl(error), 302);
    }
  }

  /** El motivo viaja como código corto en la URL; nunca un token ni un mensaje interno. */
  private loginErrorUrl(error: unknown): string {
    const code = error instanceof DomainError ? error.code : 'oidc_failed';
    return `${this.origin}/entrar?error=${encodeURIComponent(code)}`;
  }
}
