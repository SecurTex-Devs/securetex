import { fastifyCookie } from '@fastify/cookie';
import { fastifyHelmet } from '@fastify/helmet';
import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { ValidationError as ClassValidatorError } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { ValidationError } from './domain/errors';

// Subidas de imágenes: 5 MB cifrados en un sobre y en base64url (≈ 6,8 MB). Los DTO acotan cada campo.
const BODY_LIMIT_BYTES = 7_500_000;

/** Construye la aplicación con todos los controles transversales. Compartido por main y por el generador de contratos. */
export async function createApp(): Promise<NestFastifyApplication> {
  const env = loadEnv();
  const adapter = new FastifyAdapter({
    trustProxy: env.TRUST_PROXY.split(',').map((s) => s.trim()),
    bodyLimit: BODY_LIMIT_BYTES,
    // Petición que tarde más de 30 s: se corta (límites de recurso, 05-Seguridad §7.2).
    requestTimeout: 30_000,
    genReqId: () => randomUUID().replace(/-/g, ''),
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bufferLogs: false });

  await app.register(fastifyCookie);
  // La API solo devuelve JSON: la CSP más restrictiva posible.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', async (req, reply) => {
    (req as unknown as { traceId: string }).traceId = req.id;
    void reply.header('X-Request-Id', req.id);
    void reply.header('Cache-Control', 'no-store');
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // asignación masiva → 400 (T-A11)
      forbidUnknownValues: true,
      transform: true,
      validateCustomDecorators: true,
      exceptionFactory: (errors) => new ValidationError(collectFields(errors)),
    }),
  );
  return app;
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SecurTex API')
    .setDescription(
      'API REST de SecurTex · Sprint 1: identidad, sesiones, MFA, auditoría y proyectos.\n\n' +
        'Autenticación por cookies HttpOnly. Toda petición que cambia estado exige `Origin` válido y, con sesión, la cabecera `X-CSRF-Token`.\n\n' +
        'Errores en formato RFC 9457 (Problem Details).',
    )
    .setVersion('0.1.0')
    .addCookieAuth('stx_at')
    .build();
  return SwaggerModule.createDocument(app, config, { operationIdFactory: (controller, method) => `${controller.replace(/Controller$/, '')}_${method}` });
}

function collectFields(errors: readonly ClassValidatorError[], prefix = ''): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const e of errors) {
    const key = prefix ? `${prefix}.${e.property}` : e.property;
    const constraints = e.constraints ?? {};
    const first = constraints['whitelistValidation'] ? 'Campo no permitido.' : Object.values(constraints)[0];
    if (first) fields[key] = first;
    if (e.children?.length) Object.assign(fields, collectFields(e.children, key));
  }
  return fields;
}
