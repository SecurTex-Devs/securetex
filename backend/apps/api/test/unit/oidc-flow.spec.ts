import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OidcService } from '../../src/application/auth/oidc.service';
import type { AuthService } from '../../src/application/auth/auth.service';
import type { AuditLog } from '../../src/application/audit/audit-log';
import type { Databases } from '../../src/infrastructure/db/databases';
import type { FieldCipher } from '../../src/infrastructure/security/field-cipher';
import { formatCompositeToken, randomSecret, sha256 } from '../../src/infrastructure/security/tokens';

const state = vi.hoisted(() => ({
  claims: { sub: 'identidad-sintetica', email: 'demo@example.com', email_verified: true as unknown, given_name: 'Demo' },
  env: { REGISTRATION_ENABLED: true, GOOGLE_CLIENT_ID: 'prueba', GOOGLE_CLIENT_SECRET: 'prueba',
    MICROSOFT_CLIENT_ID: 'prueba', MICROSOFT_CLIENT_SECRET: 'prueba', MICROSOFT_TENANT: 'common', APP_ORIGIN: 'https://app.example.com' },
}));
vi.mock('../../src/config/env', () => ({ loadEnv: () => state.env }));
// Solo se simula la respuesta ya validada de la biblioteca: estas pruebas no
// pretenden acreditar firmas OIDC, consentimiento ni conectividad del proveedor.
vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({})),
  authorizationCodeGrant: vi.fn(async () => ({ claims: () => state.claims })),
}));

function fixture(provider: 'google' | 'microsoft') {
  const secret = randomSecret();
  const challengeId = randomUUID();
  const challenge = { id: challengeId, kind: 'oidc', secretHash: sha256(secret), consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000), data: { provider, state: 'estado', nonce: 'nonce', verifier: 'verificador' } };
  const userId = randomUUID();
  const identity = {
    authChallenge: { findUnique: vi.fn(async () => challenge), updateMany: vi.fn(async () => ({ count: 1 })) },
    userIdentity: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
    user: { findUnique: vi.fn(), create: vi.fn(async (_input: unknown) => ({ id: userId })) },
  };
  const auth = { finishPrimaryAuth: vi.fn(async () => ({ kind: 'session', session: {} })), sendVerification: vi.fn(async () => {}) };
  const audit = { record: vi.fn(async () => {}) };
  const cipher = { index: (_label: string, value: string) => value, emailIndex: (value: string) => value, encrypt: (value: string) => value };
  const service = new OidcService({ identity } as unknown as Databases, auth as unknown as AuthService,
    audit as unknown as AuditLog, cipher as unknown as FieldCipher);
  const meta = { traceId: randomUUID(), ip: undefined, userAgent: undefined };
  const callback = () => service.callback(provider, new URL('https://app.example.com/callback'), formatCompositeToken(challengeId, secret), null, meta);
  return { identity, auth, audit, callback, challenge, userId };
}

beforeEach(() => { state.env.REGISTRATION_ENABLED = true; state.claims.email_verified = true; });

describe('Alta y acceso por proveedor', () => {
  it('Google crea una cuenta activa sin correo adicional cuando confirma la dirección', async () => {
    const f = fixture('google');
    expect(await f.callback()).toMatchObject({ kind: 'session', verificationRequired: false });
    expect(f.identity.user.create.mock.calls[0]?.[0]).toMatchObject({ data: { status: 'active', emailVerifiedAt: expect.any(Date) } });
    expect(f.auth.sendVerification).not.toHaveBeenCalled();
  });
  it('Microsoft sin confirmación crea una cuenta pendiente y envía la verificación', async () => {
    state.claims.email_verified = undefined;
    const f = fixture('microsoft');
    expect(await f.callback()).toMatchObject({ kind: 'session', verificationRequired: true });
    expect(f.identity.user.create.mock.calls[0]?.[0]).toMatchObject({ data: { status: 'pending', emailVerifiedAt: null } });
    expect(f.auth.sendVerification).toHaveBeenCalledWith(f.userId, 'demo@example.com', 'Demo');
  });
  it('no vincula por coincidencia de correo', async () => {
    const f = fixture('microsoft');
    f.identity.user.findUnique.mockResolvedValue({ id: randomUUID() });
    await expect(f.callback()).rejects.toMatchObject({ code: 'oidc_link_required' });
    expect(f.identity.user.create).not.toHaveBeenCalled();
    expect(f.auth.finishPrimaryAuth).not.toHaveBeenCalled();
  });
  it('cerrar las altas impide nuevas cuentas OIDC', async () => {
    state.env.REGISTRATION_ENABLED = false;
    const f = fixture('google');
    await expect(f.callback()).rejects.toMatchObject({ code: 'registration_disabled' });
    expect(f.identity.user.create).not.toHaveBeenCalled();
  });
  it('el cierre de altas conserva el acceso de identidades existentes', async () => {
    state.env.REGISTRATION_ENABLED = false;
    const f = fixture('microsoft');
    f.identity.userIdentity.findUnique.mockResolvedValue({ id: randomUUID(), userId: f.userId, user: { status: 'active', emailVerifiedAt: new Date() } });
    expect(await f.callback()).toMatchObject({ kind: 'session', verificationRequired: false });
    expect(f.identity.user.create).not.toHaveBeenCalled();
    expect(f.auth.finishPrimaryAuth).toHaveBeenCalledWith({ id: f.userId }, 'microsoft', true, expect.objectContaining({ traceId: expect.any(String) }));
  });
  it.each(['suspended', 'deleted'])('rechaza una identidad de cuenta %s', async (status) => {
    const f = fixture('google');
    f.identity.userIdentity.findUnique.mockResolvedValue({ id: randomUUID(), userId: f.userId, user: { status, emailVerifiedAt: new Date() } });
    await expect(f.callback()).rejects.toMatchObject({ code: 'account_unavailable' });
    expect(f.auth.finishPrimaryAuth).not.toHaveBeenCalled();
  });
  it('un reto consumido no inicia sesión', async () => {
    const f = fixture('google');
    f.identity.authChallenge.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.callback()).rejects.toMatchObject({ code: 'oidc_state_invalid' });
    expect(f.auth.finishPrimaryAuth).not.toHaveBeenCalled();
  });
});
