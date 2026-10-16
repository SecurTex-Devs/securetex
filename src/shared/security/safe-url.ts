const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Todo `href` que provenga de contenido del usuario pasa por aquí
 * (Docs/02-Seguridad-en-el-Cliente.md §2.2). Bloquea javascript:, data:,
 * vbscript: y blob:.
 */
export function safeUrl(raw: string): string | null {
  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const url = new URL(raw, base);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Destino interno tras iniciar sesión (`?next=`). Solo rutas relativas del
 * propio origen: evita la redirección abierta a un dominio de phishing.
 */
export function safeInternalPath(raw: string | null | undefined, fallback = '/proyectos'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}
