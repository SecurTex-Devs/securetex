/**
 * Constantes de seguridad con nombre (AGENTS.md §4: sin números mágicos).
 * Cada valor está trazado a su requisito.
 */
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const AUTH = {
  /** RS-004 · vida del access token */
  ACCESS_TOKEN_TTL_MS: 10 * MINUTE_MS,
  /** §8.2 · inactividad máxima de una sesión */
  SESSION_IDLE_TTL_MS: 12 * HOUR_MS,
  /** §8.2 · vida máxima con «No cerrar sesión» */
  SESSION_REMEMBER_TTL_MS: 7 * DAY_MS,
  /** Vida máxima sin «No cerrar sesión» */
  SESSION_DEFAULT_TTL_MS: 12 * HOUR_MS,
  /** Margen para dos pestañas que rotan el refresh a la vez: no es reutilización maliciosa */
  REFRESH_GRACE_MS: 15_000,
  /** RS-006 · reautenticación reciente */
  ELEVATION_TTL_MS: 5 * MINUTE_MS,
  /** RF-001 · verificación de correo */
  VERIFY_EMAIL_TTL_MS: 24 * HOUR_MS,
  /** P-03 · espera entre reenvíos del correo de verificación */
  VERIFY_EMAIL_RESEND_COOLDOWN_MS: 5 * MINUTE_MS,
  /** RF-007 · enlace de recuperación */
  RESET_PASSWORD_TTL_MS: 30 * MINUTE_MS,
  /** Reto de segundo factor pendiente */
  MFA_CHALLENGE_TTL_MS: 5 * MINUTE_MS,
  /** §8.2 · intentos por reto de segundo factor */
  MFA_MAX_ATTEMPTS: 5,
  /** Reto OIDC (state, nonce, PKCE) */
  OIDC_CHALLENGE_TTL_MS: 10 * MINUTE_MS,
  /** RF-009 · fallos antes de avisar de los intentos restantes */
  LOGIN_WARN_AFTER_FAILURES: 7,
  /** RF-009 · fallos antes del bloqueo temporal */
  LOGIN_LOCK_AFTER_FAILURES: 10,
  /** RF-009 · duración del bloqueo */
  LOGIN_LOCK_MS: 15 * MINUTE_MS,
  /** Ventana en la que se cuentan los fallos */
  LOGIN_WINDOW_MS: 15 * MINUTE_MS,
  /** RF-006 · códigos de respaldo */
  RECOVERY_CODE_COUNT: 10,
  /** Tokens de un solo uso: 256 bits del CSPRNG (AGENTS.md §3.5) */
  TOKEN_BYTES: 32,
} as const;

export const PASSWORD = {
  /** P-02 · mínimo de 12 caracteres, sin reglas de composición (NIST 800-63B) */
  MIN_LENGTH: 12,
  MAX_LENGTH: 128,
} as const;

export const ARGON2 = {
  /** 05-Seguridad §7.4 · m=64 MiB, t=3, p=4 */
  MEMORY_KIB: 65_536,
  TIME_COST: 3,
  PARALLELISM: 4,
  HASH_LENGTH: 32,
  /** T-A10 · hashes simultáneos: limita el DoS por coste de Argon2id */
  MAX_CONCURRENT: 4,
} as const;

export const PROJECTS = {
  NAME_MAX_LENGTH: 120,
  /** RF-023 · purga automática de la papelera */
  TRASH_RETENTION_MS: 30 * DAY_MS,
  INVITATION_TTL_MS: 7 * DAY_MS,
  TAG_NAME_MAX_LENGTH: 40,
} as const;

export const FILES = {
  /** F-074 · cuota por archivo de texto */
  MAX_FILE_BYTES: 1_000_000,
  /** F-074 · cuota por proyecto */
  MAX_PROJECT_BYTES: 20_000_000,
  MAX_FILES_PER_PROJECT: 200,
  MAX_PATH_LENGTH: 200,
  MAX_PATH_DEPTH: 4,
  /** Solo texto en esta entrega: las subidas binarias requieren antimalware (F-263). */
  ALLOWED_EXTENSIONS: ['tex', 'bib', 'cls', 'sty', 'txt', 'bst'],
} as const;

/** Colaboración en tiempo real (F-090 … F-095). */
export const COLLAB = {
  /** Cada cuánto se revalida la sesión y el rol de cada conexión abierta. */
  REVALIDATE_MS: 10_000,
  PERSIST_DEBOUNCE_MS: 1_500,
  MAX_PERSIST_DELAY_MS: 8_000,
  MAX_UPDATE_BYTES: 1_000_000,
  /** Tope de lo que una sala acepta en memoria hasta que se vacía (todas las conexiones cerradas). */
  MAX_ROOM_BYTES: 40_000_000,
  MAX_CONNECTIONS_PER_USER: 8,
  HANDSHAKE_TIMEOUT_MS: 5_000,
  MAX_FRAME_BYTES: 1_100_000,
} as const;
