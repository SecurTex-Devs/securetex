// Pruebas de acceso cruzado (AGENTS.md §3.1 y §5): obligatorias para todo
// endpoint de proyectos. Amenazas: T-P03 (autorización en cliente),
// T-P07 (enumeración), T-A11 (asignación masiva), IDOR.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { verifiedUser } from './helpers.mjs';

describe('Acceso cruzado entre usuarios', () => {
  let owner, stranger, viewer, reviewer, projectId;

  before(async () => {
    [owner, stranger, viewer, reviewer] = await Promise.all([
      verifiedUser('propietaria'), verifiedUser('ajeno'), verifiedUser('lector'), verifiedUser('revisor'),
    ]);
    const created = await owner.client.post('/projects', { name: 'Proyecto privado de prueba' });
    assert.equal(created.status, 201);
    projectId = created.body.id;
    for (const [member, role] of [[viewer, 'viewer'], [reviewer, 'reviewer']]) {
      const inv = await owner.client.post(`/projects/${projectId}/invitations`, { email: member.email, role });
      assert.equal(inv.status, 201);
      const mine = await member.client.get('/invitations');
      const invitation = mine.body.find((i) => i.project.id === projectId);
      assert.ok(invitation, 'la invitación debe aparecer al invitado');
      assert.equal((await member.client.post(`/invitations/${invitation.id}/accept`)).status, 200);
    }
  });

  it('un ajeno recibe 404 (no 403) al leer un proyecto privado', async () => {
    const res = await stranger.client.get(`/projects/${projectId}`);
    assert.equal(res.status, 404);
  });

  it('un ajeno no ve el proyecto en su listado', async () => {
    const res = await stranger.client.get('/projects');
    assert.equal(res.status, 200);
    assert.ok(!res.body.items.some((p) => p.id === projectId));
  });

  it('un ajeno no puede renombrar, archivar, borrar ni invitar: siempre 404', async () => {
    assert.equal((await stranger.client.patch(`/projects/${projectId}`, { name: 'hackeado' })).status, 404);
    assert.equal((await stranger.client.post(`/projects/${projectId}/archive`)).status, 404);
    assert.equal((await stranger.client.post(`/projects/${projectId}/trash`)).status, 404);
    assert.equal((await stranger.client.del(`/projects/${projectId}`)).status, 404);
    assert.equal((await stranger.client.post(`/projects/${projectId}/invitations`, { email: stranger.email, role: 'editor' })).status, 404);
    assert.equal((await stranger.client.get(`/projects/${projectId}/members`)).status, 404);
  });

  it('un lector ve el proyecto pero no puede renombrarlo (403 auditado)', async () => {
    assert.equal((await viewer.client.get(`/projects/${projectId}`)).status, 200);
    const res = await viewer.client.patch(`/projects/${projectId}`, { name: 'cambio no permitido' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'insufficient_role');
  });

  it('un revisor no puede gestionar el acceso', async () => {
    const res = await reviewer.client.post(`/projects/${projectId}/invitations`, { email: stranger.email, role: 'editor' });
    assert.equal(res.status, 403);
  });

  it('un lector no puede ascenderse a sí mismo', async () => {
    const res = await viewer.client.patch(`/projects/${projectId}/members/${viewer.id}`, { role: 'editor' });
    assert.equal(res.status, 403);
  });

  it('el rol owner no es invitable (asignación de rol no permitida)', async () => {
    const res = await owner.client.post(`/projects/${projectId}/invitations`, { email: stranger.email, role: 'owner' });
    assert.equal(res.status, 400);
  });

  it('campos no declarados producen 400 (asignación masiva, T-A11)', async () => {
    const res = await owner.client.patch(`/projects/${projectId}`, { name: 'ok', ownerId: stranger.id });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.ownerId, 'Campo no permitido.');
  });

  it('identificadores no UUID se rechazan', async () => {
    assert.equal((await owner.client.get('/projects/1')).status, 400);
    assert.equal((await owner.client.get("/projects/1' OR '1'='1")).status, 400);
  });

  it('el borrado definitivo exige papelera y propietario', async () => {
    const res = await owner.client.del(`/projects/${projectId}`);
    assert.equal(res.status, 409);
  });

  it('revocar al lector le retira el acceso al instante', async () => {
    assert.equal((await owner.client.del(`/projects/${projectId}/members/${viewer.id}`)).status, 200);
    assert.equal((await viewer.client.get(`/projects/${projectId}`)).status, 404);
  });

  it('una sesión ajena no se puede revocar conociendo su id (IDOR)', async () => {
    const sessions = await owner.client.get('/me/sessions');
    const target = sessions.body[0].id;
    assert.equal((await stranger.client.del(`/me/sessions/${target}`)).status, 404);
  });

  it('un usuario normal no accede a la auditoría global', async () => {
    assert.equal((await stranger.client.get('/admin/audit')).status, 403);
  });
});
