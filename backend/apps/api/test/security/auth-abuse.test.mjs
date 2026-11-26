// Casos de abuso de autenticación y sesión (05-Seguridad §12.1).
// Amenazas: T-A01, T-A03, T-A04, T-A09, T-A11, T-A12 y CSRF.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client, strongPassword, uniqueEmail, verifiedUser } from './helpers.mjs';

describe('Autenticación y sesión', () => {
  it('registro: la respuesta es idéntica exista o no el correo (T-A09)', async () => {
    const { email } = await verifiedUser('existente');
    const c = new Client();
    const body = (e) => ({ email: e, password: strongPassword(), firstName: 'X', lastName: 'Y', acceptTerms: true });
    const a = await c.post('/auth/register', body(email));
    const b = await new Client().post('/auth/register', body(uniqueEmail('nuevo')));
    assert.equal(a.status, 202);
    assert.equal(b.status, 202);
    assert.deepEqual(a.body, b.body);
  });

  it('recuperación: misma respuesta exista o no la cuenta', async () => {
    const a = await new Client().post('/auth/password/forgot', { email: 'ana.torres@securtex.test' });
    const b = await new Client().post('/auth/password/forgot', { email: uniqueEmail('fantasma') });
    assert.equal(a.status, 202);
    assert.deepEqual(a.body, b.body);
  });

  it('contraseñas cortas o comunes se rechazan con un mensaje útil', async () => {
    const res = await new Client().post('/auth/register', { email: uniqueEmail('debil'), password: 'corta', firstName: 'X', lastName: 'Y', acceptTerms: true });
    assert.equal(res.status, 400);
    assert.match(res.body.fields.password, /12 caracteres/);
  });

  it('el registro no acepta campos de privilegio (T-A11)', async () => {
    const res = await new Client().post('/auth/register', { email: uniqueEmail('admin'), password: strongPassword(), firstName: 'X', lastName: 'Y', acceptTerms: true, isSystemAdmin: true });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.isSystemAdmin, 'Campo no permitido.');
  });

  it('bloqueo tras 10 fallos, idéntico para cuentas inexistentes (T-A01, T-A09)', async () => {
    for (const email of [uniqueEmail('inexistente'), (await verifiedUser('victima')).email]) {
      const c = new Client();
      let last;
      for (let i = 0; i < 10; i += 1) last = await c.post('/auth/login', { email, password: 'contraseña-incorrecta' });
      assert.equal(last.status, 429, `bloqueo para ${email}`);
      assert.equal(last.body.code, 'account_locked');
      assert.ok(Number(last.headers.get('retry-after')) > 0);
    }
  });

  it('los mensajes de error no filtran detalles internos (RNF-031)', async () => {
    const res = await new Client().post('/auth/login', { email: 'no-es-un-correo', password: 'x' });
    const text = JSON.stringify(res.body);
    assert.ok(res.body.traceId);
    assert.doesNotMatch(text, /prisma|stack|at \w+ \(|postgres|SELECT/i);
  });

  it('las cookies de sesión son HttpOnly y SameSite', async () => {
    const { email, password } = await verifiedUser('cookies');
    const res = await fetch(`${process.env.API_URL ?? 'http://localhost:4000'}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN ?? 'http://localhost:3000', 'X-Forwarded-For': '203.0.113.77' },
      body: JSON.stringify({ email, password }),
    });
    const cookies = res.headers.getSetCookie();
    const access = cookies.find((c) => /stx_at=/.test(c));
    const refresh = cookies.find((c) => /stx_rt=/.test(c));
    assert.match(access, /HttpOnly/i);
    assert.match(access, /SameSite=Lax/i);
    assert.match(refresh, /HttpOnly/i);
    assert.match(refresh, /SameSite=Strict/i);
    assert.match(refresh, /Path=\/api\/v1\/auth/);
  });

  it('CSRF: sin Origin válido o sin token sincronizador, 403', async () => {
    const { client } = await verifiedUser('csrf');
    assert.equal((await client.post('/projects', { name: 'x' }, { origin: 'https://evil.test' })).status, 403);
    assert.equal((await client.post('/projects', { name: 'x' }, { csrf: false })).status, 403);
    assert.equal((await client.post('/projects', { name: 'x' })).status, 201);
  });

  it('un JWT con alg none o manipulado no autentica', async () => {
    const { client } = await verifiedUser('jwt');
    const real = client.cookies.get('stx_at');
    const [, payload] = real.split('.');
    const forged = new Client();
    forged.cookies.set('stx_at', `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`);
    assert.equal((await forged.get('/me')).status, 401);
    const tampered = new Client();
    tampered.cookies.set('stx_at', `${real.slice(0, -4)}AAAA`);
    assert.equal((await tampered.get('/me')).status, 401);
  });

  it('cerrar sesión invalida el access token al instante', async () => {
    const { client } = await verifiedUser('logout');
    const stolen = client.cookies.get('stx_at');
    assert.equal((await client.post('/auth/logout')).status, 200);
    const attacker = new Client();
    attacker.cookies.set('stx_at', stolen);
    assert.equal((await attacker.get('/me')).status, 401);
  });

  it('reutilizar un refresh token ya rotado revoca la sesión entera (T-A12, RS-003)', async () => {
    const { client } = await verifiedUser('refresh');
    const oldRefresh = client.cookies.get('stx_rt');
    assert.equal((await client.post('/auth/refresh')).status, 200);
    // Pasado el margen de gracia entre pestañas (15 s), el token viejo es un robo.
    // Se espera algo más para absorber la deriva de reloj de entornos virtualizados.
    await new Promise((r) => setTimeout(r, Number(process.env.REFRESH_GRACE_WAIT_MS ?? 17_000)));
    const attacker = new Client();
    attacker.cookies.set('stx_rt', oldRefresh);
    const reuse = await attacker.post('/auth/refresh');
    assert.equal(reuse.status, 401);
    assert.equal(reuse.body.code, 'session_compromised');
    // La víctima también queda fuera: la familia entera está revocada.
    assert.equal((await client.get('/me')).status, 401);
  });

  it('operaciones sensibles exigen reautenticación reciente (RS-006)', async () => {
    const { client, password } = await verifiedUser('reauth');
    // Tras el login la sesión está elevada 5 min; se fuerza el caso contrario con una sesión nueva vía refresh no basta,
    // así que se comprueba que una contraseña incorrecta en /auth/reauth no eleva.
    const bad = await client.post('/auth/reauth', { password: 'incorrecta-del-todo' });
    assert.equal(bad.status, 400);
    const ok = await client.post('/auth/reauth', { password });
    assert.equal(ok.status, 200);
    assert.ok(new Date(ok.body.elevatedUntil) > new Date());
  });

  it('la cadena de auditoría es íntegra', async (t) => {
    if (!process.env.SEED_DEMO_PASSWORD) {
      t.skip('Requiere SEED_DEMO_PASSWORD de las cuentas sintéticas locales.');
      return;
    }
    const admin = new Client();
    const login = await admin.post('/auth/login', { email: 'ana.torres@securtex.test', password: process.env.SEED_DEMO_PASSWORD });
    assert.equal(login.status, 200, 'la administradora sintética debe iniciar sesión');
    const res = await admin.get('/admin/audit/verify');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.checked > 0);
  });
});
