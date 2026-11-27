import { describe, expect, it } from 'vitest';
import { oidcRegistrationEmail } from '../../src/domain/oidc-registration';

describe('Correo de una nueva identidad OIDC', () => {
  it('conserva la verificación explícita de Google', () => {
    expect(oidcRegistrationEmail('google', ' Demo@Example.com ', true)).toEqual({ email: 'demo@example.com', verified: true });
  });
  it.each([undefined, false, 'true', 1, true])('Microsoft mantiene pendiente el correo aunque incluya este claim: %s', (claim) => {
    expect(oidcRegistrationEmail('microsoft', 'demo@example.com', claim)).toEqual({ email: 'demo@example.com', verified: false });
  });
  it.each([undefined, false, 'true', 1])('Google sigue rechazando la ausencia de verificación: %s', (claim) => {
    expect(() => oidcRegistrationEmail('google', 'demo@example.com', claim)).toThrow();
  });
  it.each([null, undefined, 1, {}, 'correo-invalido'])('rechaza correos ausentes o inválidos: %s', (email) => {
    expect(() => oidcRegistrationEmail('microsoft', email, true)).toThrow();
  });
});
