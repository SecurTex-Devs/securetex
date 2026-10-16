import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../../config/env';
import { IntegrityError } from '../../domain/errors';

const PREFIX = 'c3c:v1:';
const IV_BYTES = 16;
const MAC_BYTES = 32;

/**
 * Columnas cifradas · capa C3c de 14-Criptografia-Multicapa §6.3.
 *
 * AES-256-CBC + HMAC-SHA-256 en modo encrypt-then-MAC: el MAC cubre versión,
 * contexto (tabla.columna), IV y criptograma, y se verifica en tiempo
 * constante ANTES de descifrar (sin oráculo de relleno, RS-075). Es una
 * familia distinta del AES-GCM de los archivos: dos capas, dos construcciones.
 *
 * Cifrado aleatorio (IV nuevo cada vez): dos correos iguales producen
 * criptogramas distintos. Para buscar por igualdad está `index()`, un HMAC
 * con su propia clave (índice ciego), nunca cifrado determinista.
 */
@Injectable()
export class FieldCipher {
  private readonly encKey: Buffer;
  private readonly macKey: Buffer;
  private readonly indexKey: Buffer;

  constructor() {
    const master = Buffer.from(loadEnv().DATA_MASTER_KEY, 'base64');
    const derive = (info: string) => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from(info, 'utf8'), 32));
    this.encKey = derive('securtex/c3c/field-enc/v1');
    this.macKey = derive('securtex/c3c/field-mac/v1');
    this.indexKey = derive('securtex/c3c/blind-index/v1');
    master.fill(0);
  }

  encrypt(value: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-cbc', this.encKey, iv);
    const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, ct, this.mac(context, iv, ct)]).toString('base64url');
  }

  decrypt(stored: string, context: string): string {
    // Una columna vacía (valor por defecto) es la única forma aceptada en claro.
    if (stored === '') return '';
    if (!stored.startsWith(PREFIX)) throw new IntegrityError('c3c_format');
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url');
    if (raw.length < IV_BYTES + 16 + MAC_BYTES) throw new IntegrityError('c3c_format');
    const iv = raw.subarray(0, IV_BYTES);
    const ct = raw.subarray(IV_BYTES, raw.length - MAC_BYTES);
    const mac = raw.subarray(raw.length - MAC_BYTES);
    if (!timingSafeEqual(mac, this.mac(context, iv, ct))) throw new IntegrityError('c3c_mac');
    const decipher = createDecipheriv('aes-256-cbc', this.encKey, iv);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new IntegrityError('c3c_padding');
    }
  }

  decryptOptional(stored: string | null, context: string): string | null {
    return stored === null ? null : this.decrypt(stored, context);
  }

  /** Índice ciego: HMAC-SHA-256 truncado a 128 bits del valor ya normalizado, separado por propósito. */
  index(purpose: string, normalized: string): string {
    return createHmac('sha256', this.indexKey).update(`${purpose}\u0000${normalized}`, 'utf8').digest().subarray(0, 16).toString('hex');
  }

  emailIndex(email: string): string {
    return this.index('email', email.normalize('NFC').trim().toLowerCase());
  }

  /** Unicidad de etiquetas sin distinguir mayúsculas ni tildes. */
  tagIndex(name: string): string {
    return this.index('tag', name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim());
  }

  private mac(context: string, iv: Buffer, ct: Buffer): Buffer {
    return createHmac('sha256', this.macKey).update(`${PREFIX}${context}\u0000`, 'utf8').update(iv).update(ct).digest();
  }
}

/** Contextos (tabla.columna) que ata cada criptograma a su sitio: no se puede mover un valor a otra columna. */
export const FIELD = {
  userEmail: 'users.primary_email',
  userFirstName: 'users.first_name',
  userLastName: 'users.last_name',
  userInstitution: 'users.institution',
  userRoleTitle: 'users.role_title',
  identitySubject: 'user_identities.provider_subject',
  identityEmail: 'user_identities.provider_email',
  sessionIp: 'sessions.ip_prefix',
  sessionDevice: 'sessions.device_label',
  mfaLabel: 'mfa_methods.label',
  projectName: 'projects.name',
  projectMainFile: 'projects.main_file',
  invitationEmail: 'invitations.email',
  tagName: 'tags.name',
  filePath: 'project_files.path',
  preferences: 'editor_preferences.prefs',
} as const;
