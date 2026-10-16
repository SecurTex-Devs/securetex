import { Injectable } from '@nestjs/common';
import { ValidationError } from '../../domain/errors';
import { checkPasswordPolicy, passwordRejectionMessage, type Email } from '../../domain/values';
import { BreachedPasswordChecker } from '../../infrastructure/security/breached-passwords';
import { PasswordHasher } from '../../infrastructure/security/passwords';

/**
 * Valida una contraseña nueva (política local + filtraciones) y la hashea.
 * Punto único para registro, restablecimiento y cambio de contraseña.
 */
@Injectable()
export class NewPasswordService {
  constructor(
    private readonly hasher: PasswordHasher,
    private readonly breached: BreachedPasswordChecker,
  ) {}

  async validateAndHash(password: string, email: Email, field = 'password'): Promise<string> {
    const rejection = checkPasswordPolicy(password, email);
    if (rejection) throw new ValidationError({ [field]: passwordRejectionMessage(rejection) });
    if (await this.breached.isBreached(password)) {
      throw new ValidationError({ [field]: passwordRejectionMessage('breached') });
    }
    return this.hasher.hash(password);
  }
}
