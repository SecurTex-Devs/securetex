import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { API, Client, verifiedUser } from '../security/helpers.mjs';
import { context, open, replyKeys, seal } from '../security/crypto-client.mjs';
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
// Esta prueba reinicia únicamente la demo de Compose local.
assert.equal(API, 'http://localhost:4000');
async function read(client, id, fileId) {
  const keys = replyKeys();
  const response = await client.get(`/projects/${id}/files/${fileId}`, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
  assert.equal(response.status, 200);
  return JSON.parse(open(response.body.envelope, keys, context(id, `file:${fileId}`))).content;
}
async function visit() {
  const client = new Client();
  const response = await client.post('/auth/demo');
  assert.equal(response.status, 201);
  return { client, id: response.body.projectId };
}
function reset(args) {
  const result = spawnSync('docker', ['compose', '--profile', 'demo', 'exec', '-T', 'demo-reset', 'node', 'dist/scripts/seed-demo.js', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, 'el proceso de reinicio debe completar su trabajo');
}

const normal = await verifiedUser('regresion-reinicio');
const created = await normal.client.post('/projects', { name: 'Documento normal que debe conservarse' });
assert.equal(created.status, 201);
const normalId = created.body.id;
const normalFile = (await normal.client.get(`/projects/${normalId}/files`)).body[0];
const before = await read(normal.client, normalId, normalFile.id);
const visitor = await visit();
const file = (await visitor.client.get(`/projects/${visitor.id}/files`)).body[0];
const changed = '% Cambio temporal para probar el reinicio\n' + await read(visitor.client, visitor.id, file.id);
assert.equal((await visitor.client.put(`/projects/${visitor.id}/files/${file.id}/content`, { envelope: await seal(changed, context(visitor.id, `file:${file.id}:write`)), baseVersion: file.version })).status, 200);
reset(['--reset']);
assert.equal((await visitor.client.get('/me')).status, 401);
assert.equal((await visitor.client.post('/auth/refresh')).status, 401);
assert.equal((await normal.client.get('/me')).status, 200);
assert.equal((await normal.client.get(`/projects/${normalId}`)).body.name, 'Documento normal que debe conservarse');
assert.equal(await read(normal.client, normalId, normalFile.id), before);
let fresh = await visit();
assert.notEqual(fresh.id, visitor.id);
const freshFiles = (await fresh.client.get(`/projects/${fresh.id}/files`)).body;
assert.equal(freshFiles.length, 1);
assert.ok((await read(fresh.client, fresh.id, freshFiles[0].id)).startsWith('% Puedes cambiar el texto'));
console.log('OK: reinicio restaura el documento, invalida la demo y conserva la sesión y los datos normales');

assert.match(fresh.id, /^[0-9a-f-]{36}$/);
const aged = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'securtex_owner', '-d', 'securtex', '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE projects SET created_at=now()-interval '2 days' WHERE id='${fresh.id}'`], { cwd: root, encoding: 'utf8' });
assert.equal(aged.status, 0);
reset([]);
assert.equal((await fresh.client.get('/me')).status, 401);
const caughtUp = await visit();
assert.notEqual(caughtUp.id, fresh.id);
assert.equal((await normal.client.get('/me')).status, 200);
assert.equal(await read(normal.client, normalId, normalFile.id), before);
console.log('OK: el arranque recupera un reinicio nocturno pendiente sin modificar las cuentas normales');
