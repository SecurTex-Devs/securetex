import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApi, createApp } from '../bootstrap';

/**
 * Genera contracts/openapi.json desde el código (ADR-0008, code-first).
 * No necesita base de datos: Prisma conecta de forma diferida.
 */
async function main(): Promise<void> {
  const app = await createApp();
  await app.init();
  const document = buildOpenApi(app);
  const target = resolve(__dirname, '../../../../contracts/openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
  process.stdout.write(`Contrato escrito en ${target}\n`);
}

void main();
