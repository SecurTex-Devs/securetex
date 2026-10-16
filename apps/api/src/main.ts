import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApi, createApp } from './bootstrap';
import { loadEnv } from './config/env';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await createApp();

  // La documentación no se monta en producción: un esquema completo es un
  // mapa para un atacante (01-API §2.2).
  if (env.API_DOCS_ENABLED && env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, buildOpenApi(app), { jsonDocumentUrl: 'api/openapi.json' });
    // Swagger UI necesita sus propios scripts y estilos; solo en esa ruta y
    // solo en desarrollo se relaja la CSP de la API.
    app.getHttpAdapter().getInstance().addHook('onSend', async (req, reply, payload) => {
      if (req.url.startsWith('/api/docs')) {
        void reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
      }
      return payload;
    });
  }

  app.enableShutdownHooks();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  new Logger('Bootstrap').log(`SecurTex API escuchando en :${env.PORT}`);
}

void main();
