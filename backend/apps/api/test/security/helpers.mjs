// Utilidades de la suite de casos de abuso. Se ejecuta contra la API real:
//   API_URL=http://localhost:4000 MAILPIT_URL=http://localhost:8025 pnpm test:security
// Datos sintéticos: correos en el dominio reservado .test.
import { randomBytes } from 'node:crypto';

export const API = process.env.API_URL ?? 'http://localhost:4000';
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:3000';

/** IP ficticia por cliente para no consumir el límite por IP de otras pruebas. */
const fakeIp = () => `198.51.100.${1 + (randomBytes(1)[0] % 250)}`;

export class Client {
  constructor() {
    this.cookies = new Map();
    this.ip = fakeIp();
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  get csrf() {
    return this.cookies.get('stx_csrf') ?? this.cookies.get('__Host-stx_csrf');
  }

  async request(method, path, body, { headers = {}, origin = ORIGIN, csrf = true } = {}) {
    const h = { 'X-Forwarded-For': this.ip, ...headers };
    if (origin) h.Origin = origin;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (this.cookies.size) h.Cookie = this.cookieHeader();
    if (csrf && this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    const res = await fetch(`${API}/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  }

  get(path, opts) { return this.request('GET', path, undefined, opts); }
  post(path, body = {}, opts) { return this.request('POST', path, body, opts); }
  patch(path, body = {}, opts) { return this.request('PATCH', path, body, opts); }
  put(path, body = {}, opts) { return this.request('PUT', path, body, opts); }
  del(path, body, opts) { return this.request('DELETE', path, body, opts); }
}

export const uniqueEmail = (tag) => `${tag}.${randomBytes(4).toString('hex')}@securtex.test`;
export const strongPassword = () => `Prueba-${randomBytes(9).toString('base64url')}`;

/** Busca en Mailpit el último correo enviado a `to` y extrae el token del fragmento. */
export async function tokenFromMail(to, subjectIncludes) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    const msg = (list.messages ?? []).find((m) => m.Subject.includes(subjectIncludes));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      const match = /#token=([A-Za-z0-9_-]{43})/.exec(full.Text);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No llegó el correo «${subjectIncludes}» a ${to}`);
}

/** Registra, verifica e inicia sesión. Devuelve el cliente autenticado. */
export async function verifiedUser(tag) {
  const email = uniqueEmail(tag);
  const password = strongPassword();
  const c = new Client();
  const reg = await c.post('/auth/register', { email, password, firstName: tag, lastName: 'Prueba', acceptTerms: true });
  if (reg.status !== 202) throw new Error(`registro: ${reg.status} ${JSON.stringify(reg.body)}`);
  const token = await tokenFromMail(email, 'Confirma tu correo');
  const ver = await c.post('/auth/verify-email', { token });
  if (ver.status !== 200) throw new Error(`verificación: ${ver.status}`);
  const login = await c.post('/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login: ${login.status} ${JSON.stringify(login.body)}`);
  const me = await c.get('/me');
  return { client: c, email, password, id: me.body.id };
}
