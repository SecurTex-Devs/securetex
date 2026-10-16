#!/usr/bin/env node
// Genera infra/.env con secretos aleatorios para el entorno LOCAL.
// Nunca se versiona (.gitignore). Uso:  node infra/generate-env.mjs
// Si el archivo ya existe, no lo toca (usa --force para regenerarlo).
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = join(dirname(fileURLToPath(import.meta.url)), '.env');
if (existsSync(target) && !process.argv.includes('--force')) {
  console.log(`${target} ya existe; no se modifica. Usa --force para regenerarlo.`);
  process.exit(0);
}

const secret = (bytes = 24) => randomBytes(bytes).toString('base64url');
const { privateKey } = generateKeyPairSync('ed25519');
const jwtKey = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const env = `# Generado por infra/generate-env.mjs — NO versionar.
POSTGRES_PASSWORD=${secret()}
DB_IDENTITY_PASSWORD=${secret()}
DB_APP_PASSWORD=${secret()}
DB_AUDIT_PASSWORD=${secret()}

# Clave Ed25519 (PKCS#8 DER en base64) para firmar los access tokens.
JWT_PRIVATE_KEY=${jwtKey}
# AES-256 para cifrar los secretos TOTP en reposo (sustituto local de Vault).
MFA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}
# Clave maestra de los archivos (envuelve las KEK de proyecto con AES-256-KW).
FILES_MASTER_KEY=${randomBytes(32).toString('base64')}

# Contraseña de las cuentas de demostración *@securtex.test (solo local).
SEED_DEMO_PASSWORD=Demo-${secret(9)}

# Comprobación de contraseñas filtradas (HIBP, k-anonimato). Requiere Internet.
HIBP_ENABLED=true

# Opcional: inicio de sesión con Google y Microsoft (OIDC). Redirect URI:
#   http://localhost:3000/api/v1/auth/oidc/google/callback
#   http://localhost:3000/api/v1/auth/oidc/microsoft/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT=consumers
`;

writeFileSync(target, env, { encoding: 'utf8', mode: 0o600 });
console.log(`Escrito ${target}`);
