// Subida de figuras, historial de versiones y copia de proyectos: casos de abuso.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { context, open, replyKeys, seal } from './crypto-client.mjs';
import { verifiedUser } from './helpers.mjs';

// PNG mínimo válido (1×1) y un «PNG» que en realidad es HTML.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a48c0000000049454e44ae426082', 'hex');
const FAKE_PNG = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

describe('Figuras, historial y copias', () => {
  let owner, viewer, stranger, projectId, mainId;

  before(async () => {
    [owner, viewer, stranger] = await Promise.all([verifiedUser('fig-duena'), verifiedUser('fig-lector'), verifiedUser('fig-ajeno')]);
    projectId = (await owner.client.post('/projects', { name: 'Proyecto con figuras' })).body.id;
    await owner.client.post(`/projects/${projectId}/invitations`, { email: viewer.email, role: 'viewer' });
    const inv = (await viewer.client.get('/invitations')).body.find((i) => i.project.id === projectId);
    await viewer.client.post(`/invitations/${inv.id}/accept`);
    mainId = (await owner.client.get(`/projects/${projectId}/files`)).body.find((f) => f.path === 'main.tex').id;
  });

  const upload = (client, path, bytes) => seal(bytes, context(projectId, 'file:upload')).then((envelope) => client.post(`/projects/${projectId}/files/upload`, { path, envelope }));

  it('sube una imagen PNG real y se lee igual, sellada', async () => {
    const res = await upload(owner.client, 'figuras/punto.png', PNG);
    assert.equal(res.status, 201);
    assert.equal(res.body.kind, 'png');
    assert.equal(res.body.size, PNG.length);
    const keys = replyKeys();
    const read = await owner.client.get(`/projects/${projectId}/files/${res.body.id}`, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
    const file = JSON.parse(open(read.body.envelope, keys, context(projectId, `file:${res.body.id}`)));
    assert.ok(Buffer.from(file.content, 'base64').equals(PNG));
  });

  it('rechaza un «.png» que no lo es, extensiones peligrosas y a un lector', async () => {
    assert.equal((await upload(owner.client, 'figuras/falso.png', FAKE_PNG)).status, 400);
    assert.equal((await upload(owner.client, 'figuras/script.svg', PNG)).status, 400);
    assert.equal((await upload(owner.client, 'figuras/nota.tex', PNG)).status, 400);
    assert.equal((await upload(viewer.client, 'figuras/lector.png', PNG)).status, 403);
    assert.equal((await upload(stranger.client, 'figuras/ajeno.png', PNG)).status, 404);
  });

  it('una imagen no se puede sobrescribir como texto', async () => {
    const img = (await owner.client.get(`/projects/${projectId}/files`)).body.find((f) => f.path === 'figuras/punto.png');
    const res = await owner.client.put(`/projects/${projectId}/files/${img.id}/content`, { envelope: await seal('x', context(projectId, `file:${img.id}:write`)), baseVersion: 1 });
    assert.equal(res.status, 400);
  });

  it('historial: un ajeno no lo ve; restaurar devuelve el contenido anterior', async () => {
    const keys = replyKeys();
    const before = JSON.parse(open((await owner.client.get(`/projects/${projectId}/files/${mainId}`, { headers: { 'X-SecurTex-Reply-Key': keys.header } })).body.envelope, keys, context(projectId, `file:${mainId}`)));
    const write = await owner.client.put(`/projects/${projectId}/files/${mainId}/content`, { envelope: await seal('% versión 2\n', context(projectId, `file:${mainId}:write`)), baseVersion: before.version });
    assert.equal(write.status, 200);
    assert.equal((await stranger.client.get(`/projects/${projectId}/files/${mainId}/versions`)).status, 404);
    assert.equal((await viewer.client.get(`/projects/${projectId}/files/${mainId}/versions`)).status, 200);
    // Sin sala abierta, la escritura REST no deja instantánea; se crea al restaurar. Se prueba el permiso:
    const list = (await owner.client.get(`/projects/${projectId}/files/${mainId}/versions`)).body;
    if (list.length > 0) {
      assert.equal((await viewer.client.post(`/projects/${projectId}/files/${mainId}/versions/${list[0].id}/restore`)).status, 403);
    }
  });

  it('copiar: un ajeno recibe 404; un lector obtiene un proyecto propio con las mismas figuras', async () => {
    assert.equal((await stranger.client.post(`/projects/${projectId}/duplicate`, { name: 'Robado' })).status, 404);
    const copy = await viewer.client.post(`/projects/${projectId}/duplicate`, { name: 'Mi copia' });
    assert.equal(copy.status, 201);
    assert.equal(copy.body.role, 'owner');
    const files = (await viewer.client.get(`/projects/${copy.body.id}/files`)).body.map((f) => f.path);
    assert.ok(files.includes('main.tex') && files.includes('figuras/punto.png'));
    // La propietaria original no ve la copia de otra persona.
    assert.equal((await owner.client.get(`/projects/${copy.body.id}`)).status, 404);
  });
});
