import type { FastifyReply } from 'fastify';
import { loadEnv } from '../../config/env';
import type { IssuedSession } from '../../application/auth/sessions';

const secure = loadEnv().COOKIE_SECURE;

/**
 * Nombres de cookie. Con HTTPS se usan los prefijos `__Host-` / `__Secure-`,
 * que el navegador solo acepta con Secure y (en __Host-) sin Domain y con
 * Path=/: un subdominio comprometido no puede sobrescribirlas.
 */
export const COOKIES = {
  access: secure ? '__Host-stx_at' : 'stx_at',
  refresh: secure ? '__Secure-stx_rt' : 'stx_rt',
  csrf: secure ? '__Host-stx_csrf' : 'stx_csrf',
  mfa: secure ? '__Secure-stx_mfa' : 'stx_mfa',
  oidc: secure ? '__Secure-stx_oidc' : 'stx_oidc',
} as const;

const AUTH_PATH = '/api/v1/auth';

/**
 * · access: HttpOnly, el JavaScript no puede leerlo (T-A03).
 * · refresh: HttpOnly, SameSite=Strict y limitado a /api/v1/auth: solo viaja
 *   al endpoint que lo necesita.
 * · csrf: legible por el JavaScript propio para devolverlo en X-CSRF-Token
 *   (patrón de token sincronizador ligado a la sesión). No da acceso por sí solo.
 */
export function setSessionCookies(reply: FastifyReply, s: Pick<IssuedSession, 'accessToken' | 'refreshToken' | 'remember' | 'expiresAt'> & { csrfToken?: string }): void {
  const persistent = s.remember ? { expires: s.expiresAt } : {};
  reply.setCookie(COOKIES.access, s.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', ...persistent });
  reply.setCookie(COOKIES.refresh, s.refreshToken, { httpOnly: true, secure, sameSite: 'strict', path: AUTH_PATH, ...persistent });
  if (s.csrfToken) reply.setCookie(COOKIES.csrf, s.csrfToken, { httpOnly: false, secure, sameSite: 'strict', path: '/', ...persistent });
}

export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIES.access, { path: '/', secure });
  reply.clearCookie(COOKIES.refresh, { path: AUTH_PATH, secure });
  reply.clearCookie(COOKIES.csrf, { path: '/', secure });
}

export function setChallengeCookie(reply: FastifyReply, name: string, value: string, maxAgeSeconds: number, sameSite: 'strict' | 'lax'): void {
  reply.setCookie(name, value, { httpOnly: true, secure, sameSite, path: AUTH_PATH, maxAge: maxAgeSeconds });
}

export function clearChallengeCookie(reply: FastifyReply, name: string): void {
  reply.clearCookie(name, { path: AUTH_PATH, secure });
}
