import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware de borde (Docs/02-Seguridad-en-el-Cliente.md §3):
 *  · CSP estricta con nonce por petición: sin 'unsafe-inline' ni 'unsafe-eval'
 *    en scripts (RS-023).
 *  · Cabeceras de seguridad en todas las respuestas (RS-024).
 *  · Puerta de rutas privadas: sin cookie de sesión, a /entrar. Es solo
 *    comodidad: la autorización real la hace la API en cada petición.
 */

const PRIVATE_PREFIXES = ['/proyectos', '/proyecto/', '/ajustes', '/admin', '/plantillas/publicar'];
const SESSION_COOKIES = ['stx_at', 'stx_rt', '__Host-stx_at', '__Secure-stx_rt'];
/** Páginas que reciben un token en el fragmento: no deben filtrar nada por Referer. */
const NO_REFERRER_PATHS = ['/verificar', '/nueva-contrasena'];

function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // En desarrollo, el overlay de Next inyecta estilos en línea; en producción, solo con nonce.
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    // Radix y KaTeX posicionan con atributos style; no ejecutan código.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isPrivate = PRIVATE_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p));
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (isPrivate && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  response.headers.set('Referrer-Policy', NO_REFERRER_PATHS.includes(pathname) ? 'no-referrer' : 'strict-origin-when-cross-origin');
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return response;
}

export const config = {
  matcher: [{ source: '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg).*)' }],
};
