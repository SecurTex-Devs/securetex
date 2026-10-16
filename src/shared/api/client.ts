import createClient from 'openapi-fetch';
import { ApiError } from './errors';
import type { paths } from './generated';

/**
 * Cliente REST generado desde el contrato del backend (los tipos de
 * `generated.ts` NO se escriben a mano). Interceptores, en orden
 * (Docs/05-Integracion-con-la-API.md §2.1):
 *
 *  1. Correlación · X-Request-Id
 *  2. CSRF · X-CSRF-Token en toda petición que cambia estado
 *  3. Sesión · ante un 401 intenta refrescar UNA sola vez y repite
 *  4. Errores · Problem Details → ApiError tipado
 *
 * Las credenciales viajan en cookies HttpOnly que este código no puede leer.
 * Ningún token se guarda en localStorage ni sessionStorage (T-A03).
 */

const CSRF_COOKIE_NAMES = ['__Host-stx_csrf', 'stx_csrf'];
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const NO_REFRESH_PATHS = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/mfa/verify', '/api/v1/auth/register'];

function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split('; ')) {
    const eq = part.indexOf('=');
    if (CSRF_COOKIE_NAMES.includes(part.slice(0, eq))) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function requestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

let refreshing: Promise<boolean> | null = null;

/** Un único refresco en vuelo aunque fallen varias peticiones a la vez. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'X-Request-Id': requestId() } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => { refreshing = null; }, 0);
    });
  return refreshing;
}

function prepare(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set('X-Request-Id', requestId());
  if (UNSAFE.has(request.method)) {
    const csrf = readCsrfToken();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  return new Request(request, { headers, credentials: 'same-origin' });
}

async function sessionAwareFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  let response = await fetch(prepare(input));
  const path = new URL(input.url).pathname;
  if (response.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    if (await refreshSession()) response = await fetch(prepare(retry));
  }
  return response;
}

export const api = createClient<paths>({ baseUrl: '', fetch: sessionAwareFetch });

interface FetchResult<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly response: Response;
}

/** Devuelve los datos o lanza un ApiError tipado. */
export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, { detail: 'No hemos podido conectar. Comprueba tu conexión.' });
  }
  if (result.response.ok) return result.data as T;
  throw new ApiError(result.response.status, (result.error ?? null) as ConstructorParameters<typeof ApiError>[1]);
}
