// Se ejecuta por stdin dentro de la API: cookies y claves efímeras solo en memoria.
import assert from 'node:assert/strict';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
const { API, Client } = await import('./test/security/helpers.mjs');
const { context, openBytes, replyKeys } = await import('./test/security/crypto-client.mjs');
let step = 'salud de API y base';
try {
  const health = await fetch(`${API}/api/v1/health`);
  assert.equal(health.status, 200);
  const status = await health.json();
  assert.equal(status.status, 'ok');
  assert.equal(status.database, true);
  step = 'configuración del registro';
  const visitor = new Client();
  const config = await visitor.get('/auth/demo');
  assert.equal(config.body.enabled, true);
  assert.equal(config.body.registrationEnabled, process.env.REGISTRATION_ENABLED === 'true');
  if (!config.body.registrationEnabled) {
    const denied = await visitor.post('/auth/register', {
      email: `smoke.${randomBytes(6).toString('hex')}@example.com`, password: randomBytes(24).toString('base64url'),
      firstName: 'Prueba', lastName: 'Demo', acceptTerms: true,
    });
    assert.equal(denied.status, 403);
  }
  step = 'sesión y alcance de demo';
  const started = await visitor.post('/auth/demo');
  assert.equal(started.status, 201);
  const id = started.body.projectId;
  const me = await visitor.get('/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.isDemo, true);
  assert.equal(me.body.isSystemAdmin, false);
  assert.equal((await visitor.get(`/projects/${id}`)).status, 200);
  assert.equal((await visitor.post('/projects', { name: 'No debe crearse' })).status, 403);
  if (process.argv.includes('--compile')) {
    step = 'compilación real y firma';
    const keys = replyKeys();
    const response = await visitor.post(`/projects/${id}/compile`, {}, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
    assert.equal(response.status, 200);
    const frame = openBytes(response.body.envelope, keys, context(id, 'compile:pdf'));
    const length = frame.readUInt32BE(0);
    const header = JSON.parse(frame.toString('utf8', 4, 4 + length));
    const pdf = frame.subarray(4 + length, 4 + length + header.pdfBytes);
    assert.equal(header.status, 'success');
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const digest = createHash('sha256').update(pdf).digest();
    assert.equal(digest.equals(Buffer.from(header.signature.pdfSha256, 'base64url')), true);
    const rawKey = (await (await fetch(`${API}/api/v1/crypto/artifact-key`)).json()).key;
    const publicKey = createPublicKey({ format: 'der', type: 'spki', key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(rawKey, 'base64url')]) });
    const message = Buffer.concat([digest, Buffer.from(header.compilationId.replace(/-/g, ''), 'hex'), Buffer.from(header.signature.sourceTreeHash, 'base64url')]);
    assert.equal(verify(null, message, publicKey, Buffer.from(header.signature.value, 'base64url')), true);
    console.log(`[SecureTex] PDF real y firma Ed25519 comprobados (${pdf.length} bytes).`);
  }
  assert.equal((await visitor.post('/auth/logout')).status, 200);
  console.log('[SecureTex] API, base, demo limitada y configuración del registro comprobados.');
} catch {
  console.error(`[SecureTex] Falló la comprobación: ${step}.`);
  process.exitCode = 1;
}
