/**
 * Estimación de fortaleza para dar retroalimentación inmediata. Es USABILIDAD,
 * no seguridad: la decisión la toma el servidor (política + filtraciones HIBP).
 */
export interface StrengthResult {
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly length: number;
  readonly rules: { readonly length: boolean; readonly mix: boolean; readonly email: boolean };
}

const COMMON = ['password', 'contraseña', '123456', 'qwerty', 'securtex', 'admin', 'letmein', 'iloveyou'];

export function estimateStrength(password: string, email = ''): StrengthResult {
  const length = [...password].length;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9\s]/, /\s/].filter((re) => re.test(password)).length;
  const words = password.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3).length;
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  const lowered = password.toLowerCase();
  const containsEmail = local.length >= 4 && lowered.includes(local);
  const common = COMMON.some((c) => lowered.includes(c));
  const uniqueRatio = length ? new Set(password).size / length : 0;

  // Entropía aproximada: longitud × variedad, penalizando repeticiones y patrones comunes.
  let bits = length * Math.log2(Math.max(10, classes * 18)) * Math.min(1, uniqueRatio * 1.6);
  if (words >= 3) bits += 12;
  if (common) bits -= 25;
  if (containsEmail) bits -= 20;

  const score = (length < 8 ? 0 : bits < 45 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as StrengthResult['score'];
  return {
    score: length < 12 ? (Math.min(score, 1) as StrengthResult['score']) : score,
    length,
    rules: { length: length >= 12, mix: classes >= 2 || words >= 3, email: !containsEmail },
  };
}
