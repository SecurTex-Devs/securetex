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
  /**
   * Orígenes de la aplicación web separados por comas. El primero es el
   * canónico (enlaces de los correos, OIDC). Para la red local se añade la
   * IP del equipo, p. ej. «http://192.168.1.50:3000,http://localhost:3000».
   */
  APP_ORIGIN: z.string().refine((v) => v.split(',').every((o) => URL.canParse(o.trim())), 'lista de URL separadas por comas'),
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
  /** Clave privada Ed25519 (PKCS#8, base64) que firma los PDF compilados (C4b). Nunca entra en el sandbox. */
  COMPILER_SIGNING_KEY: z.string().min(40),
  /** Volumen tmpfs compartido con el sandbox de compilación (sin red): peticiones y resultados. */
  COMPILE_JOBS_DIR: z.string().default('/jobs'),
  /** Debe coincidir con el plazo del trabajador del sandbox. */
  COMPILE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
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
  /** Cerrados por defecto; Compose habilita el registro únicamente para desarrollo. */
  REGISTRATION_ENABLED: boolFromString,
  DEMO_ENABLED: boolFromString,
});

export type Env = z.infer<typeof EnvSchema> & { readonly APP_ORIGINS: readonly string[] };

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
  const origins = parsed.data.APP_ORIGIN.split(',').map((o) => new URL(o.trim()).origin);
  cached = { ...parsed.data, APP_ORIGIN: origins[0] ?? '', APP_ORIGINS: origins };
  return cached;
}
