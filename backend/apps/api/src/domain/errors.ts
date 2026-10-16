import type { SecurityFinding } from './latex-analyzer';

/**
 * Errores de dominio tipados (03-Estandares §4.1). La frontera HTTP los
 * convierte en Problem Details (RFC 9457) sin exponer detalles internos.
 *
 * `detail` es el texto que verá la persona usuaria: dice qué ha pasado y qué
 * hacer, sin culpar y sin jerga (03-Sistema-de-Diseno §6).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  abstract readonly title: string;

  constructor(readonly detail: string) {
    super(detail);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'validation';
  readonly httpStatus = 400;
  readonly title = 'Datos no válidos';

  constructor(readonly fields: Readonly<Record<string, string>>, detail = 'Revisa los campos marcados.') {
    super(detail);
  }
}

export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401;
  readonly title = 'Sesión no válida';

  constructor(readonly code: string = 'unauthorized', detail = 'Tu sesión ha caducado. Vuelve a iniciar sesión.') {
    super(detail);
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'invalid_credentials';
  readonly httpStatus = 401;
  readonly title = 'Credenciales incorrectas';

  constructor(readonly remainingAttempts: number | null) {
    super('El correo o la contraseña no son correctos.');
  }
}

export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
  readonly title = 'Permisos insuficientes';

  constructor(readonly code: string = 'forbidden', detail = 'Tu rol no permite realizar esta acción.') {
    super(detail);
  }
}

export class ReauthRequiredError extends DomainError {
  readonly code = 'reauth_required';
  readonly httpStatus = 403;
  readonly title = 'Confirma tu identidad';

  constructor() {
    super('Por seguridad, confirma tu contraseña para continuar.');
  }
}

/** «No existe» y «no tienes acceso» son indistinguibles (T-P07). */
export class NotFoundError extends DomainError {
  readonly code = 'not_found';
  readonly httpStatus = 404;
  readonly title = 'No encontrado';

  constructor() {
    super('No hemos encontrado lo que buscas. Puede que no exista o que no tengas acceso.');
  }
}

export class ConflictError extends DomainError {
  readonly httpStatus = 409;
  readonly title = 'Conflicto';

  constructor(readonly code: string, detail: string) {
    super(detail);
  }
}

export class RateLimitedError extends DomainError {
  readonly httpStatus = 429;
  readonly title = 'Demasiados intentos';

  constructor(
    readonly retryAfterSeconds: number,
    readonly code: string = 'rate_limited',
    detail = 'Has hecho demasiados intentos. Espera un momento y vuelve a probar.',
  ) {
    super(detail);
  }
}

export class ServiceUnavailableError extends DomainError {
  readonly httpStatus = 503;
  readonly title = 'No disponible';

  constructor(readonly code: string, detail: string) {
    super(detail);
  }
}

/**
 * El análisis autoritativo encontró algo bloqueante: el proyecto no llega al
 * sandbox. Se devuelven los hallazgos para que la interfaz muestre dónde y
 * qué alternativa hay (P-47).
 */
export class CompileBlockedError extends DomainError {
  readonly code = 'compile_blocked';
  readonly httpStatus = 422;
  readonly title = 'Compilación bloqueada';

  constructor(readonly findings: readonly SecurityFinding[]) {
    super('El proyecto contiene construcciones que no se pueden compilar por seguridad. Revisa los avisos marcados.');
  }
}

/**
 * El contenido almacenado no supera la verificación de integridad (C4): el
 * HMAC, la etiqueta GCM o el envoltorio de la clave no coinciden. No se
 * descifra nada y se registra como incidente (P-50).
 */
export class IntegrityError extends DomainError {
  readonly code = 'integrity_violation';
  readonly httpStatus = 409;
  readonly title = 'Contenido no verificable';

  constructor(readonly stage: string) {
    super('No hemos podido verificar la integridad de este archivo, así que no lo mostramos. El equipo de seguridad ya ha sido avisado.');
  }
}
