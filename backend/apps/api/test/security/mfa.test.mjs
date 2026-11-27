// Segundo factor TOTP (RF-006, T-A02): alta, inicio de sesión en dos pasos,
// rechazo de códigos reutilizados y códigos de respaldo de un solo uso.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import otplib from 'otplib';
import { Client, verifiedUser } from './helpers.mjs';

const { authenticator } = otplib;

describe('Verificación en dos pasos', () => {
  it('alta de TOTP, login en dos pasos, anti-reutilización y códigos de respaldo', async () => {
    const { client, email, password } = await verifiedUser('mfa');

    const setup = await client.post('/auth/mfa/totp/setup');
    assert.equal(setup.status, 200);
    assert.match(setup.body.qrDataUrl, /^data:image\/png;base64,/);
    const secret = setup.body.secret;

    assert.equal((await client.post('/auth/mfa/totp/confirm', { code: '000000' })).status, 400);
    const usedCode = authenticator.generate(secret);
    const confirm = await client.post('/auth/mfa/totp/confirm', { code: usedCode });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.recoveryCodes.length, 10);

    // Nuevo inicio de sesión: la contraseña sola ya no basta.
    const c = new Client();
    const first = await c.post('/auth/login', { email, password });
    assert.equal(first.body.status, 'mfa_required');
    assert.equal((await c.get('/me')).status, 401, 'sin sesión hasta completar el segundo factor');

    // Repetimos el valor confirmado aunque el login cruce una ventana de 30 s.
    const reused = await c.post('/auth/mfa/verify', { kind: 'totp', code: usedCode });
    assert.equal(reused.status, 400, 'un código TOTP no se puede reutilizar');

    const recovery = confirm.body.recoveryCodes[0];
    assert.equal((await c.post('/auth/mfa/verify', { kind: 'recovery', code: recovery })).status, 200);
    assert.equal((await c.get('/me')).status, 200);

    // El código de respaldo es de un solo uso.
    const d = new Client();
    await d.post('/auth/login', { email, password });
    assert.equal((await d.post('/auth/mfa/verify', { kind: 'recovery', code: recovery })).status, 400);
  });

  it('el reto de segundo factor se invalida tras 5 intentos', async () => {
    const { client, email, password } = await verifiedUser('mfa-fuerza');
    const { body } = await client.post('/auth/mfa/totp/setup');
    await client.post('/auth/mfa/totp/confirm', { code: authenticator.generate(body.secret) });
    const c = new Client();
    await c.post('/auth/login', { email, password });
    for (let i = 0; i < 5; i += 1) await c.post('/auth/mfa/verify', { kind: 'recovery', code: 'aaaaa-aaaaa' });
    const after = await c.post('/auth/mfa/verify', { kind: 'recovery', code: 'aaaaa-aaaaa' });
    assert.equal(after.status, 401);
    assert.equal(after.body.code, 'mfa_challenge_invalid');
  });
});
