import type { NextRequest } from 'next/server';

/**
 * Proxy de la API en el MISMO origen que la aplicación. Ventajas de seguridad:
 *  · Las cookies de sesión son de primera parte y pueden ser SameSite=Strict.
 *  · CORS no hace falta: no se abre la API a ningún otro origen.
 *  · El navegador nunca conoce la dirección interna del backend.
 *
 * Solo se reenvía una lista cerrada de cabeceras; jamás las de infraestructura.
 */
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const FORWARD_REQUEST = ['accept', 'accept-language', 'content-type', 'cookie', 'origin', 'referer', 'user-agent', 'x-csrf-token', 'x-request-id'];
const DROP_RESPONSE = new Set(['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive']);
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  if (path.some((s) => !SEGMENT.test(s) || s === '.' || s === '..')) {
    return Response.json({ code: 'not_found', status: 404, title: 'No encontrado', detail: 'Ruta no válida.' }, { status: 404 });
  }
  const target = new URL(`/api/v1/${path.join('/')}`, API_URL);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : null,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      { code: 'server', status: 502, title: 'Servicio no disponible', detail: 'No hemos podido conectar con el servidor. Inténtalo de nuevo en unos segundos.' },
      { status: 502, headers: { 'Content-Type': 'application/problem+json' } },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase())) out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
