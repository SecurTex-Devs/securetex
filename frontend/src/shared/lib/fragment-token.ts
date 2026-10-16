/**
 * Lee el token de un enlace de correo (`/verificar#token=…`) y lo borra de la
 * barra de direcciones al instante. El fragmento nunca viaja al servidor ni
 * aparece en Referer; borrarlo evita además que quede en el historial
 * (AGENTS.md §1.4: ningún token en la URL).
 */
export function consumeFragmentToken(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('token');
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
