import {
  createParamDecorator,
  Injectable,
  Logger,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../../config/env';
import { SessionService } from '../../application/auth/sessions';
import type { Actor, RequestMeta } from '../../application/request-meta';
import { ForbiddenError, ReauthRequiredError, UnauthorizedError } from '../../domain/errors';
import { COOKIES } from './cookies';

/**
 * Políticas de acceso a nivel de endpoint. Toda ruta DEBE declarar una
 * (AGENTS.md §1.5). La autorización fina por recurso vive en el dominio.
 *
 * | Política        | Exige                                                    |
 * |-----------------|----------------------------------------------------------|
 * | public          | nada                                                     |
 * | authenticated   | sesión válida                                            |
 * | elevated        | sesión + reautenticación en los últimos 5 min (RS-006)   |
 * | system_admin    | sesión de administrador del sistema                      |
 */
export type EndpointPolicy = 'public' | 'authenticated' | 'elevated' | 'system_admin';

const POLICY_KEY = 'securtex:policy';
const CSRF_EXEMPT_KEY = 'securtex:csrf-exempt';

export const Policy = (policy: EndpointPolicy) => SetMetadata(POLICY_KEY, policy);

/**
 * Exime del token sincronizador (no del control de Origin). Solo para
 * endpoints que aún no tienen sesión o que se autentican con otra cookie
 * SameSite=Strict (refresh).
 */
export const CsrfExempt = () => SetMetadata(CSRF_EXEMPT_KEY, true);

export interface SecuredRequest extends FastifyRequest {
  actor?: Actor;
  traceId?: string;
}

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<SecuredRequest>().actor;
  // Inalcanzable si la política es correcta; si no, se falla cerrado.
  if (!actor) throw new UnauthorizedError();
  return actor;
});

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<SecuredRequest>();
  return { traceId: req.traceId ?? randomUUID(), ip: req.ip, userAgent: req.headers['user-agent'] };
});

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Guard global único, en este orden:
 *   1. Identifica la sesión a partir de la cookie (nunca del cuerpo).
 *   2. Exige una política declarada: sin @Policy, 403 y error en el log (fail closed).
 *   3. Aplica la política.
 *   4. Anti-CSRF: Origin válido en toda petición que cambia estado y, con
 *      sesión, token sincronizador en X-CSRF-Token.
 */
@Injectable()
export class SecurityGuard implements CanActivate {
  private readonly logger = new Logger(SecurityGuard.name);
  private readonly allowedOrigin = new URL(loadEnv().APP_ORIGIN).origin;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SecuredRequest>();
    const policy = this.reflector.getAllAndOverride<EndpointPolicy | undefined>(POLICY_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!policy) {
      this.logger.error(`Endpoint sin política declarada: ${ctx.getClass().name}.${ctx.getHandler().name}`);
      throw new ForbiddenError('policy_missing', 'No tienes permiso para realizar esta acción.');
    }

    const actor = await this.sessions.authenticate(req.cookies[COOKIES.access]);
    if (actor) req.actor = actor;

    this.enforcePolicy(policy, actor);
    if (UNSAFE_METHODS.has(req.method)) await this.enforceCsrf(ctx, req, actor);
    return true;
  }

  private enforcePolicy(policy: EndpointPolicy, actor: Actor | null): void {
    if (policy === 'public') return;
    if (!actor) throw new UnauthorizedError();
    if (policy === 'system_admin' && !actor.isSystemAdmin) throw new ForbiddenError();
    if (policy === 'elevated' && !(actor.elevatedUntil && actor.elevatedUntil > new Date())) throw new ReauthRequiredError();
  }

  private async enforceCsrf(ctx: ExecutionContext, req: SecuredRequest, actor: Actor | null): Promise<void> {
    const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
    if (origin !== this.allowedOrigin) {
      throw new ForbiddenError('csrf_origin', 'Petición rechazada por seguridad. Recarga la página.');
    }
    const exempt = this.reflector.getAllAndOverride<boolean | undefined>(CSRF_EXEMPT_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!actor || exempt) return;
    const header = req.headers['x-csrf-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!(await this.sessions.verifyCsrf(actor.sessionId, token))) {
      throw new ForbiddenError('csrf_token', 'Petición rechazada por seguridad. Recarga la página.');
    }
  }
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
