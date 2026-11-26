// Sesión pública de demostración: alcance fijo, permisos reducidos y cuotas.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { Client, verifiedUser, strongPassword } from './helpers.mjs';
import { connectCollab, context, openBytes, replyKeys } from './crypto-client.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const uuid = /^[0-9a-f-]{36}$/;
async function demo() {
  const client = new Client();
  const response = await client.post('/auth/demo');
  assert.equal(response.status, 201, 'la demo debe estar habilitada y sembrada');
  return { client, serverDate: response.headers.get('date'), ...response.body };
}
async function compile(client, id) {
  const keys = replyKeys();
  const response = await client.post(`/projects/${id}/compile`, {}, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
  if (response.status !== 200) return response;
  const frame = openBytes(response.body.envelope, keys, context(id, 'compile:pdf'));
  const length = frame.readUInt32BE(0);
  return { ...response, compilation: JSON.parse(frame.toString('utf8', 4, 4 + length)) };
}

describe('Demostración pública limitada', () => {
  it('permite pasar de la demo a una cuenta normal con sus propias credenciales', async () => {
    const normal = await verifiedUser('salir-de-demo');
    const visitor = await demo();
    assert.equal((await visitor.client.post('/auth/login', { email: normal.email, password: normal.password })).status, 200);
    const me = await visitor.client.get('/me');
    assert.equal(me.body.id, normal.id);
    assert.equal(me.body.isDemo, false);
    assert.equal((await visitor.client.post('/projects', { name: 'Proyecto normal tras la demo' })).status, 201);
  });
  it('entra sin contraseña con una sesión de 30 minutos y sin administración', async () => {
    const visitor = await demo();
    const expires = new Date(visitor.expiresAt).getTime();
    // Docker Desktop y el host pueden tener desfase: ambas fechas deben ser del servidor.
    const remaining = expires - Date.parse(visitor.serverDate);
    assert.ok(remaining >= 29 * 60_000 && remaining <= 30 * 60_000 + 1000);
    const me = await visitor.client.get('/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.isDemo, true);
    assert.equal(me.body.isSystemAdmin, false);
    assert.equal((await visitor.client.get(`/projects/${visitor.projectId}`)).body.role, 'editor');
    assert.equal((await visitor.client.get('/projects')).body.items.length, 1);
  });

  it('rechaza Origin ajeno, CSRF ausente y cambios de cuenta o de privilegios', async () => {
    assert.equal((await new Client().post('/auth/demo', {}, { origin: 'https://evil.test' })).status, 403);
    const visitor = await demo();
    assert.equal((await visitor.client.post('/auth/demo', {}, { csrf: false })).status, 403);
    const forbidden = [
      ['get', '/admin/users'], ['get', '/me/sessions'], ['patch', '/me'],
      ['post', '/projects'], ['post', `/projects/${visitor.projectId}/duplicate`],
      ['post', `/projects/${visitor.projectId}/files`], ['post', '/auth/reauth'],
      ['post', `/projects/${visitor.projectId}/invitations`],
    ];
    for (const [method, path] of forbidden) {
      const result = await visitor.client[method](path, method === 'get' ? undefined : {});
      assert.equal(result.status, 403, path);
      assert.equal(result.body.code, 'demo_restricted', path);
    }
  });

  it('no amplía el alcance aunque alguien añada la cuenta demo a otro proyecto', async () => {
    const owner = await verifiedUser('ajeno-demo');
    const project = await owner.client.post('/projects', { name: 'Proyecto privado de la prueba' });
    assert.equal(project.status, 201);
    const visitor = await demo();
    const me = (await visitor.client.get('/me')).body;
    assert.match(project.body.id, uuid);
    assert.match(me.id, uuid);
    const sql = `INSERT INTO project_members(project_id,user_id,role) VALUES ('${project.body.id}','${me.id}','editor')`;
    const grant = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'securtex_owner', '-d', 'securtex', '-v', 'ON_ERROR_STOP=1', '-c', sql], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(grant.status, 0, 'preparar la membresía adicional');
    try {
      assert.equal((await visitor.client.get(`/projects/${project.body.id}`)).status, 404);
      const scopedList = await visitor.client.get('/projects');
      assert.equal(scopedList.body.items.length, 1);
      assert.equal(scopedList.body.counts.all, 1);
      const connection = await connectCollab(visitor.client, project.body.id);
      assert.equal(connection.closed?.code, 4404);
      connection.ws.terminate();
    } finally {
      const cleanup = `DELETE FROM project_members WHERE project_id='${project.body.id}' AND user_id='${me.id}'`;
      const removed = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'securtex_owner', '-d', 'securtex', '-c', cleanup], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(removed.status, 0, 'retirar únicamente la membresía de prueba');
    }
  });

  it('compila el documento de ejemplo y limita a tres compilaciones por minuto e IP', async () => {
    const visitor = await demo();
    for (let i = 0; i < 3; i++) {
      const result = await compile(visitor.client, visitor.projectId);
      assert.equal(result.status, 200);
      assert.equal(result.compilation.status, 'success');
      assert.equal(result.compilation.signature.alg, 'Ed25519');
    }
    const limited = await compile(visitor.client, visitor.projectId);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.code, 'demo_rate_limited');
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  });

  it('limita las peticiones también en las rutas de claves públicas', async () => {
    const visitor = await demo();
    let result;
    for (let i = 0; i < 121; i++) {
      result = await visitor.client.get('/crypto/artifact-key');
      if (result.status === 429) break;
      assert.equal(result.status, 200);
    }
    assert.equal(result.status, 429);
    assert.equal(result.body.code, 'demo_rate_limited');
  });

  it('los intentos de contraseña no bloquean las identidades sin contraseña', async () => {
    const email = 'demo.1@securtex.invalid';
    for (let i = 0; i < 11; i++) assert.equal((await new Client().post('/auth/login', { email, password: strongPassword() })).status, 401);
    assert.equal((await new Client().post('/auth/demo')).status, 201);
  });
});
