export const DEMO = {
  SESSION_TTL_MS: 30 * 60_000,
  STARTS_PER_HOUR: 10,
  GLOBAL_STARTS_PER_HOUR: 100,
  COMPILES_PER_MINUTE: 3,
  GLOBAL_COMPILES_PER_HOUR: 60,
  REQUESTS_PER_MINUTE: 120,
  GLOBAL_REQUESTS_PER_MINUTE: 1200,
  MAX_BUDGET_KEYS: 1024,
  OWNER_EMAIL: 'demo.owner@securtex.invalid',
  GUEST_EMAILS: Array.from({ length: 8 }, (_, index) => `demo.${index + 1}@securtex.invalid`),
} as const;

export const isDemoEmail = (email: string): boolean => email === DEMO.OWNER_EMAIL || DEMO.GUEST_EMAILS.includes(email);

/** El alcance se conserva en la sesión del servidor, nunca en un parámetro del cliente. */
export function demoProjectId(authMethod: string): string | null {
  const match = /^demo:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(authMethod);
  return match?.[1] ?? null;
}

/** Ventanas fijas acotadas: ni el número de IP ni la memoria pueden crecer sin límite. */
export class DemoBudget {
  private readonly windows = new Map<string, { count: number; until: number }>();

  consume(key: string, limit: number, windowMs: number, now = Date.now()): number | null {
    for (const [stored, value] of this.windows) if (value.until <= now) this.windows.delete(stored);
    const current = this.windows.get(key);
    if (!current && this.windows.size >= DEMO.MAX_BUDGET_KEYS) return Math.ceil(windowMs / 1000);
    const window = current ?? { count: 0, until: now + windowMs };
    this.windows.set(key, window);
    if (window.count >= limit) return Math.max(1, Math.ceil((window.until - now) / 1000));
    window.count++;
    return null;
  }
}
