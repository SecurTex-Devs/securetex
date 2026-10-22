// Bloqueo de cuentas aplicado por PostgreSQL (migración s5 · RF-009, T-A01).
// Además de la API, se ataca la base directamente con el rol de la API
// (securtex_identity), como haría alguien que robara sus credenciales o
// encontrara una inyección SQL: no debe poder quitar el bloqueo ni crear una
// sesión para la cuenta bloqueada.
//
// Requiere la pila levantada con `docker compose up` (usa `docker compose exec`).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, describe, it } from 'node:test';
import { Client, verifiedUser } from './helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ejecuta SQL dentro del contenedor de PostgreSQL con el rol indicado. */
function sql(role, statement) {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', role, '-d', 'securtex', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], { cwd: ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}
const asApi = (s) => sql('securtex_identity', s);
// Propietario de la base: solo para preparar escenarios (vencer un bloqueo, suspender).
const asOwner = (s) => sql('securtex_owner', s);
const keyOf = (userId) => {
  assert.match(userId, UUID);
  return `(SELECT decode(email_index, 'hex') FROM users WHERE id = '${userId}')`;
};

async function failTimes(email, n) {
  const c = new Client();
  let last;
  for (let i = 0; i < n; i += 1) last = await c.post('/auth/login', { email, password: 'contraseña-incorrecta' });
  return last;
}

function newSessionSql(userId) {
  return `INSERT INTO sessions (user_id, csrf_hash, ip_prefix, user_agent_hash, device_label, auth_method, idle_expires_at, expires_at)
          VALUES ('${userId}', '\\x00', 'x', 'x', 'x', 'password', now() + interval '1 hour', now() + interval '1 hour')`;
}

describe('Bloqueo de cuentas en la base', () => {
  let victim;

  before(async () => {
    assert.ok(asOwner('SELECT 1').ok, 'hace falta la pila levantada con docker compose');
    victim = await verifiedUser('bloqueo');
    const last = await failTimes(victim.email, 10);
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'account_locked');
  });

  it('bloqueada, ni la contraseña correcta deja entrar, y se dice hasta cuándo', async () => {
    const res = await new Client().post('/auth/login', { email: victim.email, password: victim.password });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'account_locked');
    assert.match(res.body.detail, /a partir de las \d{2}:\d{2}/);
    const retry = Number(res.headers.get('retry-after'));
    assert.ok(retry > 0 && retry <= 15 * 60, `Retry-After ${retry}`);
  });

  it('el rol de la API no puede leer, poner a cero, borrar ni crear contadores', () => {
    for (const s of [
      'SELECT * FROM login_throttle',
      `UPDATE login_throttle SET locked_until = NULL`,
      'DELETE FROM login_throttle',
      `INSERT INTO login_throttle (key_hash) VALUES ('\\x00000000000000000000000000000000')`,
    ]) {
      const r = asApi(s);
      assert.equal(r.ok, false, s);
      assert.match(r.err, /permission denied/, s);
    }
  });

  it('el rol de la API tampoco puede usar el desbloqueo manual de los operadores', () => {
    const r = asApi(`SELECT auth_unlock_account('${victim.id}')`);
    assert.equal(r.ok, false);
    assert.match(r.err, /permission denied/);
  });

  it('con acceso directo a la base no se crea una sesión para la cuenta bloqueada', () => {
    const r = asApi(newSessionSql(victim.id));
    assert.equal(r.ok, false);
    assert.match(r.err, /account_locked/);
  });

  it('registrar un acierto desde la base no quita un bloqueo vigente', async () => {
    assert.ok(asApi(`SELECT auth_register_login_success(${keyOf(victim.id)})`).ok);
    const res = await new Client().post('/auth/login', { email: victim.email, password: victim.password });
    assert.equal(res.status, 429);
  });

  it('una sesión no puede cambiar de dueño ni revivir tras revocarse', async () => {
    const other = await verifiedUser('dueno');
    const sessionId = asApi(`SELECT id FROM sessions WHERE user_id = '${other.id}' AND revoked_at IS NULL LIMIT 1`).out;
    assert.match(sessionId, UUID);
    const steal = asApi(`UPDATE sessions SET user_id = '${victim.id}' WHERE id = '${sessionId}'`);
    assert.equal(steal.ok, false);
    assert.match(steal.err, /session_immutable/);

    assert.equal((await other.client.post('/auth/logout')).status, 200);
    const revive = asApi(`UPDATE sessions SET revoked_at = NULL WHERE id = '${sessionId}'`);
    assert.equal(revive.ok, false);
    assert.match(revive.err, /session_immutable/);
  });

  it('una cuenta suspendida tampoco obtiene sesiones, ni desde la base', async () => {
    const user = await verifiedUser('suspendida');
    assert.ok(asOwner(`UPDATE users SET status = 'suspended' WHERE id = '${user.id}'`).ok);
    const r = asApi(newSessionSql(user.id));
    assert.equal(r.ok, false);
    assert.match(r.err, /account_unavailable/);
  });

  it('el bloqueo se agrava: 15 min, después 1 h y después 6 h', async () => {
    const user = await verifiedUser('escalonado');
    const expected = ['00:15:00', '01:00:00', '06:00:00'];
    for (const [i, duration] of expected.entries()) {
      if (i > 0) {
        // Se da por vencido el bloqueo anterior sin esperar (solo el propietario puede).
        assert.ok(asOwner(`UPDATE login_throttle SET locked_until = now() - interval '1 second' WHERE key_hash = ${keyOf(user.id)}`).ok);
      }
      const last = await failTimes(user.email, 10);
      assert.equal(last.status, 429, `bloqueo ${i + 1}`);
      const row = asOwner(`SELECT lock_level || ' ' || date_trunc('second', locked_until - last_locked_at) FROM login_throttle WHERE key_hash = ${keyOf(user.id)}`).out;
      assert.equal(row, `${i + 1} ${duration}`);
    }
  });

  it('el desbloqueo manual del operador devuelve el acceso', async () => {
    const user = await verifiedUser('desbloqueo');
    await failTimes(user.email, 10);
    assert.equal(asOwner(`SELECT auth_unlock_account('${user.id}')`).out, 't');
    const res = await new Client().post('/auth/login', { email: user.email, password: user.password });
    assert.equal(res.status, 200);
  });
});
