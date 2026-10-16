import { z } from 'zod';

const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'debe ser una clave de 32 bytes en base64');

const boolFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/**
 * Configuración validada y centralizada (03-Estandares §3: prohibido
 * `process.env.X` disperso). Si falta algo, el proceso no arranca.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_ORIGIN: z.string().url(),
  TRUST_PROXY: z.string().default('loopback,uniquelocal'),

  DATABASE_URL_IDENTITY: z.string().url(),
  DATABASE_URL_APP: z.string().url(),
  DATABASE_URL_AUDIT: z.string().url(),

  /** Clave privada Ed25519 (PKCS#8, base64) para firmar los access tokens. */
  JWT_PRIVATE_KEY: z.string().min(40),
  /** Cifrado en reposo de los secretos TOTP. Sustituto local de Vault Transit. */
  MFA_ENCRYPTION_KEY: base64Key32,
  /** Clave maestra que envuelve las KEK de proyecto. Sustituto local de Vault Transit. */
  FILES_MASTER_KEY: base64Key32,
  /** Clave privada X25519 (PKCS#8, base64) del servicio: abre los sobres C2 de los clientes. */
  TRANSPORT_PRIVATE_KEY: z.string().min(40),
  /** Clave maestra de las columnas cifradas (C3c) y de los índices ciegos; de ella se derivan subclaves con HKDF. */
  DATA_MASTER_KEY: base64Key32,
  COOKIE_SECURE: boolFromString,

  SMTP_HOST: z.string().default('mailpit'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  MAIL_FROM: z.string().default('SecurTex <no-reply@securtex.test>'),

  HIBP_ENABLED: boolFromString,

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT: z.string().default('consumers'),

  API_DOCS_ENABLED: boolFromString,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    // Solo se listan los nombres de las variables, nunca sus valores.
    throw new Error(`Configuración inválida:\n  ${fields}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.API_DOCS_ENABLED) {
    throw new Error('La documentación de la API no puede servirse en producción (01-API §2.2).');
  }
  cached = parsed.data;
  return cached;
}
