import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import {
  CompileBlockedError,
  DomainError,
  InvalidCredentialsError,
  RateLimitedError,
  ValidationError,
} from '../../domain/errors';
import type { SecuredRequest } from './security';

interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  traceId: string;
  code: string;
  fields?: Readonly<Record<string, string>>;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  findings?: readonly unknown[];
}

const TYPE_BASE = 'https://securtex.app/errors/';

/**
 * Frontera de errores (RFC 9457). Nada interno sale al cliente: ni trazas,
 * ni SQL, ni rutas, ni versiones (RNF-031). El detalle completo va al log
 * junto al traceId, que es lo único que ve la persona usuaria.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<SecuredRequest>();
    const reply = http.getResponse<FastifyReply>();
    const traceId = req.traceId ?? 'sin-traza';
    const problem = this.toProblem(exception, req.url.split('?')[0] ?? '/', traceId);

    if (problem.status >= 500) {
      const err = exception instanceof Error ? `${exception.name}: ${exception.message}\n${exception.stack ?? ''}` : String(exception);
      this.logger.error(`[${traceId}] ${req.method} ${problem.instance} → ${err}`);
    }
    if (problem.retryAfterSeconds !== undefined) void reply.header('Retry-After', String(problem.retryAfterSeconds));
    void reply.status(problem.status).header('Content-Type', 'application/problem+json').send(problem);
  }

  private toProblem(exception: unknown, instance: string, traceId: string): Problem {
    if (exception instanceof DomainError) return this.fromDomain(exception, instance, traceId);
    if (exception instanceof ThrottlerException) {
      return { type: `${TYPE_BASE}rate_limited`, title: 'Demasiadas peticiones', status: 429, detail: 'Has hecho demasiadas peticiones seguidas. Espera un momento.', instance, traceId, code: 'rate_limited', retryAfterSeconds: 60 };
    }
    if (exception instanceof HttpException) return this.fromHttp(exception, instance, traceId);
    return { type: `${TYPE_BASE}server`, title: 'Algo ha salido mal', status: 500, detail: 'No hemos podido completar la operación. Inténtalo de nuevo en unos minutos.', instance, traceId, code: 'server' };
  }

  private fromDomain(e: DomainError, instance: string, traceId: string): Problem {
    const problem: Problem = { type: `${TYPE_BASE}${e.code}`, title: e.title, status: e.httpStatus, detail: e.detail, instance, traceId, code: e.code };
    if (e instanceof ValidationError) problem.fields = e.fields;
    if (e instanceof RateLimitedError) problem.retryAfterSeconds = e.retryAfterSeconds;
    if (e instanceof InvalidCredentialsError && e.remainingAttempts !== null) problem.remainingAttempts = e.remainingAttempts;
    // Los hallazgos del análisis son del propio proyecto de quien compila: dónde está y qué usar en su lugar.
    if (e instanceof CompileBlockedError) problem.findings = e.findings;
    return problem;
  }

  /** Errores del ValidationPipe y de Nest: se traducen sin filtrar su mensaje interno. */
  private fromHttp(e: HttpException, instance: string, traceId: string): Problem {
    const status = e.getStatus();
    if (status === HttpStatus.BAD_REQUEST) {
      return { type: `${TYPE_BASE}validation`, title: 'Datos no válidos', status, detail: 'Revisa los datos enviados.', instance, traceId, code: 'validation', fields: extractFields(e.getResponse()) };
    }
    if (status === HttpStatus.NOT_FOUND) {
      return { type: `${TYPE_BASE}not_found`, title: 'No encontrado', status, detail: 'No hemos encontrado lo que buscas.', instance, traceId, code: 'not_found' };
    }
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
      return { type: `${TYPE_BASE}too_large`, title: 'Demasiado grande', status, detail: 'La petición es demasiado grande.', instance, traceId, code: 'too_large' };
    }
    return { type: `${TYPE_BASE}http_${status}`, title: 'Petición rechazada', status, detail: 'No hemos podido procesar la petición.', instance, traceId, code: `http_${status}` };
  }
}

/** class-validator devuelve «campo mensaje»; se agrupa por campo para que la interfaz lo muestre junto a cada input. */
function extractFields(response: string | object): Record<string, string> {
  const messages = typeof response === 'object' && 'message' in response ? (response as { message: unknown }).message : [];
  const list = Array.isArray(messages) ? messages.filter((m): m is string => typeof m === 'string') : [];
  const fields: Record<string, string> = {};
  for (const m of list) {
    const match = /^property (\w+) should not exist$/.exec(m);
    if (match?.[1]) {
      fields[match[1]] = 'Campo no permitido.';
      continue;
    }
    const [field = '_', ...rest] = m.split(' ');
    fields[field] ??= rest.join(' ') || 'No es válido.';
  }
  return fields;
}
