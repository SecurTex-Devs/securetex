import { ForbiddenError } from './errors';

/** Una misma decisión para altas por contraseña y por proveedor externo. */
export function requirePublicRegistration(enabled: boolean): void {
  if (!enabled) throw new ForbiddenError('registration_disabled', 'El registro de cuentas no está disponible. Puedes probar la demo.');
}
