#!/usr/bin/env node
// Copia el contrato OpenAPI generado por el backend (../backend) y regenera los tipos.
// Los tipos de la API NUNCA se escriben a mano (AGENTS.md §1.7).
//   pnpm api:sync     → copia contracts/openapi.json desde ../backend
//   pnpm api:check    → falla si la copia local está desactualizada
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(process.env.BACKEND_CONTRACT ?? '../backend/contracts/openapi.json');
const target = resolve('contracts/openapi.json');
if (!existsSync(source)) {
  console.error(`No se encuentra el contrato del backend en ${source}`);
  process.exit(1);
}
const fresh = readFileSync(source, 'utf8');
if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== fresh) {
    console.error('El contrato local está desactualizado. Ejecuta pnpm api:sync.');
    process.exit(1);
  }
  console.log('Contrato al día.');
  process.exit(0);
}
writeFileSync(target, fresh);
execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['api:generate'], { stdio: 'inherit', shell: process.platform === 'win32' });
console.log('Contrato sincronizado y tipos regenerados.');
