import { FILES, PASSWORD, PROJECTS } from './constants';
import { ValidationError } from './errors';

/**
 * Objetos de valor autovalidados (AGENTS.md §2.2): si existe una instancia,
 * ya pasó la validación. Un dato inválido es inconstruible.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<string, 'UserId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type SessionId = Brand<string, 'SessionId'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(raw: string): boolean {
  return UUID_RE.test(raw);
}

export function asUserId(raw: string): UserId {
  if (!isUuid(raw)) throw new ValidationError({ userId: 'Identificador no válido.' });
  return raw as UserId;
}

export function asProjectId(raw: string): ProjectId {
  if (!isUuid(raw)) throw new ValidationError({ projectId: 'Identificador no válido.' });
  return raw as ProjectId;
}

export class Email {
  private constructor(private readonly value: string) {}

  static of(raw: string): Email {
    const normalized = raw.normalize('NFC').trim().toLowerCase();
    // Comprobación estructural deliberadamente sencilla: la prueba real de que
    // el correo existe y es de la persona es la verificación (RF-001).
    const ok =
      normalized.length >= 3 &&
      normalized.length <= 254 &&
      /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(normalized);
    if (!ok) throw new ValidationError({ email: 'Escribe un correo válido, por ejemplo nombre@universidad.edu.ec.' });
    return new Email(normalized);
  }

  toString(): string {
    return this.value;
  }
}

export type PasswordRejection = 'too_short' | 'too_long' | 'contains_email' | 'common' | 'breached';

const PASSWORD_MESSAGES: Readonly<Record<PasswordRejection, string>> = {
  too_short: `Usa al menos ${PASSWORD.MIN_LENGTH} caracteres. Una frase de varias palabras es fácil de recordar.`,
  too_long: `Usa como máximo ${PASSWORD.MAX_LENGTH} caracteres.`,
  contains_email: 'No uses tu correo como parte de la contraseña.',
  common: 'Esta contraseña es demasiado común. Elige otra.',
  breached: 'Esta contraseña aparece en filtraciones conocidas. Elige otra.',
};

export function passwordRejectionMessage(reason: PasswordRejection): string {
  return PASSWORD_MESSAGES[reason];
}

/** Lista mínima local; la comprobación completa es HIBP por k-anonimato (RF-010). */
const COMMON_PASSWORDS = new Set([
  '123456789012', 'contraseña123', 'password1234', 'qwertyuiopas', 'aaaaaaaaaaaa',
  '111111111111', 'securtex1234', 'administrador', 'iloveyou1234', 'passwordpassword',
]);

/**
 * Política de contraseñas sin reglas de composición (NIST SP 800-63B): longitud,
 * no derivada del correo, no común. La filtración se comprueba aparte porque
 * requiere E/S.
 */
export function checkPasswordPolicy(password: string, email: Email): PasswordRejection | null {
  const length = [...password].length;
  if (length < PASSWORD.MIN_LENGTH) return 'too_short';
  if (length > PASSWORD.MAX_LENGTH) return 'too_long';
  const lowered = password.toLowerCase();
  const localPart = email.toString().split('@')[0] ?? '';
  if (localPart.length >= 4 && lowered.includes(localPart)) return 'contains_email';
  if (COMMON_PASSWORDS.has(lowered) || new Set(lowered).size <= 2) return 'common';
  return null;
}

export class ProjectName {
  private constructor(private readonly value: string) {}

  static of(raw: string): ProjectName {
    const normalized = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (normalized.length === 0) throw new ValidationError({ name: 'Ponle un nombre al proyecto.' });
    if (normalized.length > PROJECTS.NAME_MAX_LENGTH) {
      throw new ValidationError({ name: `Usa como máximo ${PROJECTS.NAME_MAX_LENGTH} caracteres.` });
    }
    // Caracteres de control: no aportan nada a un título y complican el escapado.
    if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new ValidationError({ name: 'El nombre contiene caracteres no permitidos.' });
    return new ProjectName(normalized);
  }

  toString(): string {
    return this.value;
  }
}

export const INVITABLE_ROLES = ['editor', 'reviewer', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export type ProjectRole = 'owner' | InvitableRole;

const RESERVED_NAMES = new Set(['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'LPT1', 'LPT2']);

/**
 * Ruta de archivo dentro de un proyecto (T-F01). Si existe una instancia, la
 * ruta es relativa, sin «..», sin separadores raros ni caracteres de control,
 * con una extensión de texto permitida. Es la misma regla que aplicará el
 * sandbox antes de materializar el árbol (openin_any=p).
 */
export class SafeFilePath {
  private constructor(private readonly value: string, readonly extension: string) {}

  static of(raw: string): SafeFilePath {
    const invalid = (msg: string) => new ValidationError({ path: msg });
    const path = raw.normalize('NFC').trim();
    if (!path || path.length > FILES.MAX_PATH_LENGTH) throw invalid('Usa un nombre de entre 1 y 200 caracteres.');
    if (path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path)) throw invalid('Usa una ruta relativa dentro del proyecto.');
    if (/[\u0000-\u001f\u007f<>:"|?*]/.test(path)) throw invalid('El nombre contiene caracteres no permitidos.');
    const segments = path.split('/');
    if (segments.length > FILES.MAX_PATH_DEPTH) throw invalid('Demasiadas carpetas anidadas.');
    for (const seg of segments) {
      if (!seg || seg === '.' || seg === '..') throw invalid('La ruta no puede salir del proyecto.');
      if (seg.startsWith('.')) throw invalid('No se permiten archivos ocultos.');
      if (RESERVED_NAMES.has((seg.split('.')[0] ?? '').toUpperCase())) throw invalid('Ese nombre está reservado por el sistema.');
    }
    const extension = (path.split('.').pop() ?? '').toLowerCase();
    if (!path.includes('.') || !(FILES.ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
      throw invalid('Extensión no permitida. Usa .tex, .bib, .cls, .sty, .bst o .txt.');
    }
    return new SafeFilePath(path, extension);
  }

  toString(): string {
    return this.value;
  }
}
