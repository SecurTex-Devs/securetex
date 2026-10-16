/** Datos de la petición que los casos de uso necesitan para auditar y para la sesión. */
export interface RequestMeta {
  readonly traceId: string;
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
}

/** Quién actúa: lo fija el guard de autenticación a partir de la cookie, nunca del cuerpo. */
export interface Actor {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly isSystemAdmin: boolean;
  readonly elevatedUntil: Date | null;
}
