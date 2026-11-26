// RF-007: el enlace de recuperación es de un solo uso y revoca las sesiones.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client, strongPassword, tokenFromMail, verifiedUser } from './helpers.mjs';

describe('Recuperación de contraseña por correo', () => {
  it('cambia la contraseña, cierra las sesiones y rechaza reutilizar el enlace', async () => {
    const user = await verifiedUser('recuperacion');
    const anonymous = new Client();
    assert.equal((await anonymous.post('/auth/password/forgot', { email: user.email })).status, 202);
    const token = await tokenFromMail(user.email, 'Restablece tu contraseña');
    const password = strongPassword();
    assert.equal((await anonymous.post('/auth/password/reset', { token, password })).status, 200);

    assert.equal((await user.client.get('/me')).status, 401, 'la sesión anterior queda revocada');
    assert.equal((await new Client().post('/auth/login', { email: user.email, password: user.password })).status, 401);
    assert.equal((await new Client().post('/auth/login', { email: user.email, password })).status, 200);
    assert.equal((await anonymous.post('/auth/password/reset', { token, password: strongPassword() })).status, 400);
  });

  it('rechaza un token inventado sin modificar la contraseña', async () => {
    const user = await verifiedUser('enlace-invalido');
    const result = await new Client().post('/auth/password/reset', { token: strongPassword(), password: strongPassword() });
    assert.equal(result.status, 400);
    assert.equal((await new Client().post('/auth/login', { email: user.email, password: user.password })).status, 200);
  });
});
