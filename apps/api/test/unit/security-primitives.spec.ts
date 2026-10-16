import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { anonymizeIp, deviceLabel } from '../../src/infrastructure/security/client-info';
import { parseCompositeToken, randomSecret, secretMatches, sha256 } from '../../src/infrastructure/security/tokens';

describe('Tokens opacos', () => {
  it('256 bits del CSPRNG en base64url', () => {
    const s = randomSecret();
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(s, 'base64url')).toHaveLength(32);
  });

  it('comparación por hash, en tiempo constante', () => {
    const s = randomSecret();
    expect(secretMatches(s, sha256(s))).toBe(true);
    expect(secretMatches(`${s.slice(0, -1)}A`, sha256(s))).toBe(false);
  });

  it('el formato compuesto rechaza cualquier desviación', () => {
    const id = '01a14123-9707-7fbe-8b34-94eead66ab5d';
    const secret = randomSecret();
    expect(parseCompositeToken(`${id}.${secret}`)).toEqual({ id, secret });
    for (const bad of [undefined, '', id, `${id}.`, `${id}.${secret}x`, `../../${id}.${secret}`]) expect(parseCompositeToken(bad)).toBeNull();
  });
});

describe('Cifrado autenticado de secretos (AES-256-GCM)', () => {
  let box: import('../../src/infrastructure/security/secret-box').SecretBox;

  beforeAll(async () => {
    Object.assign(process.env, {
      APP_ORIGIN: 'http://localhost:3000',
      DATABASE_URL_IDENTITY: 'postgresql://u:p@localhost/db',
      DATABASE_URL_APP: 'postgresql://u:p@localhost/db',
      DATABASE_URL_AUDIT: 'postgresql://u:p@localhost/db',
      JWT_PRIVATE_KEY: 'x'.repeat(48),
      MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      TRANSPORT_PRIVATE_KEY: generateKeyPairSync('x25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      DATA_MASTER_KEY: randomBytes(32).toString('base64'),
      FILES_MASTER_KEY: randomBytes(32).toString('base64'),
    });
    const { SecretBox } = await import('../../src/infrastructure/security/secret-box');
    box = new SecretBox();
  });

  it('cifra y descifra con la misma AAD', () => {
    expect(box.open(box.seal('JBSWY3DPEHPK3PXP', 'user-1'), 'user-1')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('nonce único: dos cifrados del mismo texto son distintos', () => {
    expect(Buffer.from(box.seal('x', 'a')).equals(Buffer.from(box.seal('x', 'a')))).toBe(false);
  });

  it('un secreto copiado a otro usuario no descifra (AAD)', () => {
    expect(box.open(box.seal('secreto', 'user-1'), 'user-2')).toBeNull();
  });

  it.each([
    ['nonce', 1], ['etiqueta', 13], ['cifrado', 29],
  ])('rechaza la manipulación de un bit en el %s', (_parte, offset) => {
    const sealed = Buffer.from(box.seal('secreto-totp-de-prueba', 'u'));
    sealed[offset] = (sealed[offset] ?? 0) ^ 0x01;
    expect(box.open(sealed, 'u')).toBeNull();
  });
});

describe('Minimización de datos', () => {
  it('IP anonimizada a /24 y /48', () => {
    expect(anonymizeIp('203.0.113.77')).toBe('203.0.113.0/24');
    expect(anonymizeIp('::ffff:198.51.100.9')).toBe('198.51.100.0/24');
    expect(anonymizeIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::/48');
    expect(anonymizeIp(undefined)).toBe('desconocida');
  });

  it('etiqueta de dispositivo legible', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36')).toBe('Chrome · Windows');
  });
});
