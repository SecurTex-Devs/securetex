import { Injectable } from '@nestjs/common';
import type { UserId } from '../../domain/values';
import { Databases } from '../db/databases';
import { FIELD, FieldCipher } from './field-cipher';

/** Lecturas puntuales de datos personales ya descifrados, para quien no tiene otra fuente (WebSocket, correo). */
@Injectable()
export class PersonalData {
  constructor(
    private readonly db: Databases,
    private readonly cipher: FieldCipher,
  ) {}

  async displayName(userId: UserId): Promise<string> {
    const u = await this.db.identity.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, primaryEmail: true } });
    if (!u) return 'Usuario';
    const name = `${this.cipher.decrypt(u.firstName, FIELD.userFirstName)} ${this.cipher.decrypt(u.lastName, FIELD.userLastName)}`.trim();
    return name || (this.cipher.decrypt(u.primaryEmail, FIELD.userEmail).split('@')[0] ?? 'Usuario');
  }
}
