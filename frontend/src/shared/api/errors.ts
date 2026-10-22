/**
 * Errores tipados de la aplicación a partir de Problem Details (RFC 9457).
 * Docs/05-Integracion-con-la-API.md §2.2: cada `kind` tiene un tratamiento
 * visible en la interfaz.
 */
export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'reauth_required'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'blocked'
  | 'network'
  | 'server';

interface ProblemBody {
  readonly code?: string;
  readonly detail?: string;
  readonly traceId?: string;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;
  readonly remainingAttempts?: number;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly traceId: string | null;
  readonly fields: Readonly<Record<string, string>>;
  readonly retryAfterSeconds: number | null;
  readonly remainingAttempts: number | null;

  constructor(status: number, body: ProblemBody | null) {
    super(body?.detail ?? 'Algo ha salido mal.');
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? (status === 0 ? 'network' : `http_${status}`);
    this.kind = kindFor(status, this.code);
    this.traceId = body?.traceId ?? null;
    this.fields = body?.fields ?? {};
    this.retryAfterSeconds = body?.retryAfterSeconds ?? null;
    this.remainingAttempts = body?.remainingAttempts ?? null;
  }
}

function kindFor(status: number, code: string): ApiErrorKind {
  if (status === 0) return 'network';
  if (code === 'reauth_required') return 'reauth_required';
  if (code === 'blocked') return 'blocked';
  if (status === 400) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  return 'server';
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** «2 min», «45 s»: tiempos de espera en lenguaje natural. */
export function humanWait(seconds: number): string {
  // Bloqueos de cuenta escalonados: hasta 24 h.
  if (seconds >= 3600) {
    const minutes = Math.ceil(seconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
  if (seconds >= 120) return `${Math.ceil(seconds / 60)} min`;
  if (seconds >= 60) return '1 min';
  return `${Math.max(1, Math.round(seconds))} s`;
}
