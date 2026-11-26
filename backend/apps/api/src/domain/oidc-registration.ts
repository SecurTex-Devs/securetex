import { UnauthorizedError } from './errors';
import { Email } from './values';

/** La identidad se prueba por OIDC; el correo se prueba por separado. */
export function oidcRegistrationEmail(provider: 'google' | 'microsoft', raw: unknown, verified: unknown): { readonly email: string; readonly verified: boolean } {
  if (typeof raw !== 'string' || (provider === 'google' && verified !== true)) {
    throw new UnauthorizedError('oidc_email_unverified', 'Tu proveedor no ha confirmado tu correo. Regístrate con correo y contraseña.');
  }
  return { email: Email.of(raw).toString(), verified: verified === true };
}
