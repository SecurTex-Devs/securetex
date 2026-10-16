#!/usr/bin/env node
// Genera infra/.env con secretos aleatorios para el entorno LOCAL.
// Nunca se versiona (.gitignore). Uso:
//   node infra/generate-env.mjs                 crea el archivo si no existe
//   node infra/generate-env.mjs --add-missing   añade solo las claves que falten (no toca las demás)
//   node infra/generate-env.mjs --force         lo regenera entero (invalida sesiones y datos cifrados)
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = join(dirname(fileURLToPath(import.meta.url)), '.env');
const secret = (bytes = 24) => randomBytes(bytes).toString('base64url');
const key32 = () => randomBytes(32).toString('base64');
const pkcs8 = (type) => generateKeyPairSync(type).privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

/** [nombre, valor, comentario]. El orden es el del archivo generado. */
const ENTRIES = [
  ['POSTGRES_PASSWORD', secret(), null],
  ['DB_IDENTITY_PASSWORD', secret(), null],
  ['DB_APP_PASSWORD', secret(), null],
  ['DB_AUDIT_PASSWORD', secret(), null],
  ['JWT_PRIVATE_KEY', pkcs8('ed25519'), 'Clave Ed25519 (PKCS#8 DER en base64) para firmar los access tokens.'],
  ['MFA_ENCRYPTION_KEY', key32(), 'AES-256 para cifrar los secretos TOTP en reposo (sustituto local de Vault).'],
  ['FILES_MASTER_KEY', key32(), 'Clave maestra de los archivos (envuelve las KEK de proyecto con AES-256-KW).'],
  ['TRANSPORT_PRIVATE_KEY', pkcs8('x25519'), 'Clave X25519 del servicio: abre los sobres C2 (X25519 + HKDF + ChaCha20-Poly1305).'],
  ['DATA_MASTER_KEY', key32(), 'Clave maestra de las columnas cifradas (C3c) y de los índices ciegos.'],
  ['SEED_DEMO_PASSWORD', `Demo-${secret(9)}`, 'Contraseña de las cuentas de demostración *@securtex.test (solo local).'],
  ['HIBP_ENABLED', 'true', 'Comprobación de contraseñas filtradas (HIBP, k-anonimato). Requiere Internet.'],
  ['GOOGLE_CLIENT_ID', '', 'Opcional: inicio de sesión con Google y Microsoft (OIDC). Redirect URI:\n#   http://localhost:3000/api/v1/auth/oidc/google/callback\n#   http://localhost:3000/api/v1/auth/oidc/microsoft/callback'],
  ['GOOGLE_CLIENT_SECRET', '', null],
  ['MICROSOFT_CLIENT_ID', '', null],
  ['MICROSOFT_CLIENT_SECRET', '', null],
  ['MICROSOFT_TENANT', 'consumers', null],
];

const render = (entries) => entries.map(([k, v, c]) => `${c ? `\n# ${c}\n` : ''}${k}=${v}`).join('\n');

if (existsSync(target) && process.argv.includes('--add-missing')) {
  const current = readFileSync(target, 'utf8');
  const missing = ENTRIES.filter(([k]) => !new RegExp(`^${k}=`, 'm').test(current));
  if (missing.length === 0) {
    console.log('No falta ninguna clave.');
  } else {
    appendFileSync(target, `\n${render(missing)}\n`, 'utf8');
    console.log(`Añadidas: ${missing.map(([k]) => k).join(', ')}`);
  }
  process.exit(0);
}

if (existsSync(target) && !process.argv.includes('--force')) {
  console.log(`${target} ya existe; no se modifica. Usa --add-missing o --force.`);
  process.exit(0);
}

writeFileSync(target, `# Generado por infra/generate-env.mjs — NO versionar.\n${render(ENTRIES)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`Escrito ${target}`);
