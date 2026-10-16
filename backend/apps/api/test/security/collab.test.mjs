// Colaboración en tiempo real: canal cifrado C1 + C2, autorización por rol,
// revocación inmediata y protección contra CSWSH y tramas manipuladas.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import * as Y from 'yjs';
import { connectCollab, context, open, replyKeys, waitClose } from './crypto-client.mjs';
import { verifiedUser } from './helpers.mjs';

const MSG = { SYNC1: 1, SYNC2: 2, UPDATE: 3, AWARENESS: 4, FLUSH: 5, SAVED: 6, TREE: 7, ERROR: 8, ACCESS: 9 };

async function joinDoc(conn) {
  const doc = new Y.Doc();
  conn.send(MSG.SYNC1, Y.encodeStateVector(doc));
  const step2 = await conn.next(MSG.SYNC2);
  Y.applyUpdate(doc, step2.payload);
  return doc;
}

describe('Colaboración en tiempo real cifrada', () => {
  let owner, editor, viewer, stranger, projectId, mainId;
  const sockets = [];

  before(async () => {
    [owner, editor, viewer, stranger] = await Promise.all([verifiedUser('colab-duena'), verifiedUser('colab-editor'), verifiedUser('colab-lector'), verifiedUser('colab-ajeno')]);
    projectId = (await owner.client.post('/projects', { name: 'Tesis en equipo' })).body.id;
    for (const [m, role] of [[editor, 'editor'], [viewer, 'viewer']]) {
      await owner.client.post(`/projects/${projectId}/invitations`, { email: m.email, role });
      const inv = (await m.client.get('/invitations')).body.find((i) => i.project.id === projectId);
      await m.client.post(`/invitations/${inv.id}/accept`);
    }
    mainId = (await owner.client.get(`/projects/${projectId}/files`)).body.find((f) => f.path === 'main.tex').id;
  });

  after(() => { for (const s of sockets) s.ws.terminate(); });

  it('un origen ajeno no puede abrir el socket (CSWSH)', async () => {
    await assert.rejects(connectCollab(owner.client, projectId, { origin: 'https://evil.example' }), /HTTP 403/);
  });

  it('sin sesión se cierra con 4401 y un ajeno con 4404', async () => {
    const anon = await connectCollab({ cookieHeader: () => '' }, projectId);
    assert.equal(anon.closed?.code, 4401);
    const s = await connectCollab(stranger.client, projectId);
    assert.equal(s.closed?.code, 4404);
  });

  it('dos editores ven sus cambios en tiempo real y se guardan cifrados', async () => {
    const a = await connectCollab(owner.client, projectId);
    const b = await connectCollab(editor.client, projectId);
    sockets.push(a, b);
    assert.equal(a.readOnly, false);
    const docA = await joinDoc(a);
    const docB = await joinDoc(b);
    const textA = docA.getText(`file:${mainId}`);
    assert.match(textA.toString(), /\\documentclass/);

    docA.on('update', (u, origin) => { if (origin !== 'remote') a.send(MSG.UPDATE, u); });
    textA.insert(0, '% Escrito por la propietaria\n');
    const update = await b.next(MSG.UPDATE);
    Y.applyUpdate(docB, update.payload, 'remote');
    assert.ok(docB.getText(`file:${mainId}`).toString().startsWith('% Escrito por la propietaria'));

    a.send(MSG.FLUSH, new Uint8Array());
    const saved = JSON.parse((await a.next(MSG.SAVED)).payload.toString('utf8'));
    assert.ok(saved.ack >= 1);

    const keys = replyKeys();
    const res = await owner.client.get(`/projects/${projectId}/files/${mainId}`, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
    assert.equal(res.status, 200);
    const file = JSON.parse(open(res.body.envelope, keys, context(projectId, `file:${mainId}`)));
    assert.ok(file.content.startsWith('% Escrito por la propietaria'));
  });

  it('un lector recibe los cambios pero el servidor descarta los suyos', async () => {
    const v = await connectCollab(viewer.client, projectId);
    sockets.push(v);
    assert.equal(v.readOnly, true);
    const doc = await joinDoc(v);
    const text = doc.getText(`file:${mainId}`);
    let update = null;
    doc.on('update', (u) => { update = u; });
    text.insert(0, 'HACKEADO ');
    v.send(MSG.UPDATE, update);
    v.send(MSG.FLUSH, new Uint8Array());
    await v.next(MSG.SAVED);
    const keys = replyKeys();
    const res = await owner.client.get(`/projects/${projectId}/files/${mainId}`, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
    assert.ok(!JSON.parse(open(res.body.envelope, keys, context(projectId, `file:${mainId}`))).content.includes('HACKEADO'));
  });

  it('una trama manipulada cierra la conexión (Poly1305)', async () => {
    const c = await connectCollab(editor.client, projectId);
    const bogus = Buffer.alloc(40, 7);
    bogus.writeBigUInt64BE(1n, 0);
    c.sendRaw(bogus);
    const closed = await waitClose(c);
    assert.equal(closed.code, 4400);
  });

  it('revocar al editor le cierra el socket al instante (4403)', async () => {
    const c = await connectCollab(editor.client, projectId);
    sockets.push(c);
    await joinDoc(c);
    assert.equal((await owner.client.del(`/projects/${projectId}/members/${editor.id}`)).status, 200);
    const closed = await waitClose(c);
    assert.equal(closed.code, 4403);
  });

  it('la respuesta REST exige clave efímera y viaja sellada', async () => {
    assert.equal((await owner.client.get(`/projects/${projectId}/files/contents`)).status, 400);
    const keys = replyKeys();
    const res = await owner.client.get(`/projects/${projectId}/files/contents`, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
    assert.equal(res.status, 200);
    assert.ok(!JSON.stringify(res.body).includes('documentclass'), 'el contenido no viaja en claro');
    const files = JSON.parse(open(res.body.envelope, keys, context(projectId, 'files:contents')));
    assert.ok(files.some((f) => f.path === 'main.tex'));
  });
});
