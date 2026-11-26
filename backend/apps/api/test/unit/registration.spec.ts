import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/domain/errors';
import { requirePublicRegistration } from '../../src/domain/registration';

describe('Política de altas públicas', () => {
  it('mantiene las altas cuando están habilitadas para el entorno local', () => {
    expect(() => requirePublicRegistration(true)).not.toThrow();
  });

  it('cierra las altas con una respuesta uniforme sin identificar cuentas', () => {
    try {
      requirePublicRegistration(false);
      expect.fail('Debe rechazar el alta');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ForbiddenError);
      if (error instanceof ForbiddenError) {
        expect(error.httpStatus).toBe(403);
        expect(error.code).toBe('registration_disabled');
      }
    }
  });
});
