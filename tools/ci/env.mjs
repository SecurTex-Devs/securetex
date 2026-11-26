import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

if (process.env.CI !== 'true') throw new Error('Este generador solo se ejecuta en el runner efímero de CI.');
const privateKey = (type) => generateKeyPairSync(type).privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const values = {
  POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
  DB_IDENTITY_PASSWORD: randomBytes(24).toString('hex'),
  DB_APP_PASSWORD: randomBytes(24).toString('hex'),
  DB_AUDIT_PASSWORD: randomBytes(24).toString('hex'),
  JWT_PRIVATE_KEY: privateKey('ed25519'),
  TRANSPORT_PRIVATE_KEY: privateKey('x25519'),
  COMPILER_SIGNING_KEY: privateKey('ed25519'),
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  FILES_MASTER_KEY: randomBytes(32).toString('base64'),
  DATA_MASTER_KEY: randomBytes(32).toString('base64'),
  SEED_DEMO_PASSWORD: randomBytes(24).toString('base64url'),
  DEMO_ENABLED: 'true', HIBP_ENABLED: 'false',
};
writeFileSync(new URL('../../.env', import.meta.url), Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''), { mode: 0o600, flag: 'wx' });
console.log('Entorno efímero creado; no se muestran los valores.');
