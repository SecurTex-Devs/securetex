import { authenticator } from 'otplib';

const STEP_SECONDS = 30;

// RFC 6238 · SHA-1 es el algoritmo que entienden todas las aplicaciones
// autenticadoras; aquí es un HMAC, donde SHA-1 sigue siendo seguro.
// Ventana de ±1 paso para tolerar desfases de reloj.
authenticator.options = { step: STEP_SECONDS, window: 1, digits: 6 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function totpUri(secret: string, accountName: string): string {
  return authenticator.keyuri(accountName, 'SecurTex', secret);
}

/**
 * Verifica un código y devuelve el paso de tiempo usado, o null.
 * El llamante debe rechazar pasos <= al último aceptado: un código observado
 * por encima del hombro no puede reutilizarse en los 30 s siguientes.
 */
export function verifyTotp(code: string, secret: string, nowMs: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = authenticator.checkDelta(code, secret);
  if (delta === null) return null;
  return Math.floor(nowMs / 1000 / STEP_SECONDS) + delta;
}
