import { describe, expect, it } from 'vitest';
import { oidcRegistrationEmail } from '../../src/domain/oidc-registration';

describe('Correo de una nueva identidad OIDC', () => {
  it('conserva la verificación explícita de Google y Microsoft', () => {
    for (const provider of ['google', 'microsoft'] as const) {
      expect(oidcRegistrationEmail(provider, ' Demo@Example.com ', true)).toEqual({ email: 'demo@example.com', verified: true });
    }
  });
  it.each([undefined, false, 'true', 1])('Microsoft mantiene pendiente un correo sin confirmación: %s', (claim) => {
    expect(oidcRegistrationEmail('microsoft', 'demo@example.com', claim)).toEqual({ email: 'demo@example.com', verified: false });
  });
  it.each([undefined, false, 'true', 1])('Google sigue rechazando la ausencia de verificación: %s', (claim) => {
    expect(() => oidcRegistrationEmail('google', 'demo@example.com', claim)).toThrow();
  });
  it.each([null, undefined, 1, {}, 'correo-invalido'])('rechaza correos ausentes o inválidos: %s', (email) => {
    expect(() => oidcRegistrationEmail('microsoft', email, true)).toThrow();
  });
});
