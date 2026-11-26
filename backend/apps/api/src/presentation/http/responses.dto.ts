/**
 * Forma de las respuestas. Existen para que el contrato OpenAPI se GENERE desde
 * el código (ADR-0008) y el frontend derive sus tipos de él, sin escribirlos.
 */

export class StatusResponseDto {
  /** Estado de la operación. */
  readonly status!: string;
}

export class LoginResponseDto {
  /** `authenticated` o `mfa_required` (en cuyo caso hay que llamar a /auth/mfa/verify). */
  readonly status!: 'authenticated' | 'mfa_required';
}

export class RetryAfterDto {
  readonly retryAfterSeconds!: number;
}

export class ElevationDto {
  readonly elevatedUntil!: Date;
}

export class ClosedSessionsDto {
  readonly closedSessions!: number;
}

export class ProvidersDto {
  /** Proveedores externos configurados en este despliegue. */
  readonly providers!: ('google' | 'microsoft')[];
}

export class MfaStatusDto {
  readonly totpEnabled!: boolean;
  readonly totpConfirmedAt!: Date | null;
  readonly recoveryCodesRemaining!: number;
}

export class TotpSetupDto {
  /** URI otpauth:// para aplicaciones que no leen QR. Se muestra una sola vez. */
  readonly otpauthUri!: string;
  /** QR como data:image/png;base64 (permitido por la CSP en img-src). */
  readonly qrDataUrl!: string;
  /** Secreto en base32 para introducirlo a mano. */
  readonly secret!: string;
}

export class RecoveryCodesDto {
  /** Se muestran una sola vez; en el servidor solo queda su hash. */
  readonly recoveryCodes!: string[];
}

export class ProfileDto {
  /** Presente al consultar la sesión; las acciones de cuenta se deniegan en la demo. */
  readonly isDemo?: boolean;
  readonly id!: string;
  readonly primaryEmail!: string;
  readonly emailVerified!: boolean;
  readonly emailVerifiedAt!: Date | null;
  readonly firstName!: string;
  readonly lastName!: string;
  readonly institution!: string;
  readonly roleTitle!: string;
  readonly locale!: string;
  readonly timezone!: string;
  readonly status!: 'pending' | 'active' | 'suspended' | 'deleted';
  readonly isSystemAdmin!: boolean;
  readonly createdAt!: Date;
  readonly passwordUpdatedAt!: Date | null;
  readonly hasPassword!: boolean;
  readonly mfa!: MfaStatusDto;
  readonly elevatedUntil!: Date | null;
}

export class SessionDto {
  readonly id!: string;
  /** «Chrome · Windows» */
  readonly deviceLabel!: string;
  /** IP anonimizada (/24 o /48). */
  readonly ipPrefix!: string;
  readonly authMethod!: string;
  readonly createdAt!: Date;
  readonly lastSeenAt!: Date;
  readonly expiresAt!: Date;
  /** La sesión desde la que se hace la petición. */
  readonly current!: boolean;
}

export class IdentityDto {
  readonly id!: string;
  readonly provider!: 'local' | 'google' | 'microsoft';
  readonly providerEmail!: string | null;
  readonly linkedAt!: Date;
  readonly lastUsedAt!: Date | null;
}

export class ActivityDto {
  readonly id!: string;
  readonly occurredAt!: Date;
  readonly eventType!: string;
  readonly outcome!: string;
  readonly actorIpPrefix!: string | null;
  readonly metadata!: Record<string, unknown>;
}

export class DeletionImpactDto {
  readonly ownedProjects!: number;
  readonly sharedOwnedProjects!: number;
}

export class PreferencesDto {
  readonly prefs!: Record<string, unknown>;
}

export class CollaboratorDto {
  readonly userId!: string;
  readonly role!: 'owner' | 'editor' | 'reviewer' | 'viewer';
  readonly name!: string;
}

export class ProjectOwnerDto {
  readonly id!: string;
  readonly name!: string;
}

export class ProjectDto {
  readonly id!: string;
  readonly name!: string;
  readonly compiler!: 'pdflatex' | 'xelatex' | 'lualatex';
  readonly mainFile!: string;
  readonly confidential!: boolean;
  readonly archived!: boolean;
  readonly trashedAt!: Date | null;
  readonly lastActivityAt!: Date;
  readonly createdAt!: Date;
  readonly owner!: ProjectOwnerDto;
  /** Tu rol en el proyecto. */
  readonly role!: 'owner' | 'editor' | 'reviewer' | 'viewer';
  /** Acciones que la interfaz puede ofrecer. Cortesía visual: el servidor vuelve a decidir. */
  readonly allowedActions!: string[];
  readonly collaborators!: CollaboratorDto[];
  readonly tagIds!: string[];
}

export class ProjectCountsDto {
  readonly all!: number;
  readonly owned!: number;
  readonly shared!: number;
  readonly archived!: number;
  readonly trash!: number;
}

export class ProjectListDto {
  readonly items!: ProjectDto[];
  readonly counts!: ProjectCountsDto;
}

export class MemberUserDto {
  readonly firstName!: string;
  readonly lastName!: string;
  readonly primaryEmail!: string;
}

export class MemberDto {
  readonly userId!: string;
  readonly role!: 'owner' | 'editor' | 'reviewer' | 'viewer';
  readonly createdAt!: Date;
  readonly user!: MemberUserDto;
}

export class InvitationDto {
  readonly id!: string;
  readonly email!: string;
  readonly role!: 'owner' | 'editor' | 'reviewer' | 'viewer';
  readonly createdAt!: Date;
  readonly expiresAt!: Date;
}

export class MembersDto {
  readonly members!: MemberDto[];
  readonly invitations!: InvitationDto[];
}

export class InvitationProjectDto {
  readonly id!: string;
  readonly name!: string;
}

export class ReceivedInvitationDto {
  readonly id!: string;
  readonly role!: 'owner' | 'editor' | 'reviewer' | 'viewer';
  readonly createdAt!: Date;
  readonly expiresAt!: Date;
  readonly project!: InvitationProjectDto;
}

export class TagCountDto {
  readonly projects!: number;
}

export class TagDto {
  readonly id!: string;
  readonly name!: string;
  readonly color!: string;
  readonly _count?: TagCountDto;
}

export class AuditEventDto {
  readonly seq!: string;
  readonly id!: string;
  readonly occurredAt!: Date;
  readonly eventType!: string;
  readonly severity!: string;
  readonly actorUserId!: string | null;
  readonly actorIpPrefix!: string | null;
  readonly targetType!: string | null;
  readonly targetId!: string | null;
  readonly outcome!: string;
  readonly reason!: string | null;
  /** Hash del evento (hex). */
  readonly hash!: string;
}

export class ChainVerificationDto {
  readonly ok!: boolean;
  readonly checked!: number;
  readonly brokenAtSeq!: string | null;
}

export class HealthDto {
  readonly status!: 'ok' | 'degraded';
  readonly database!: boolean;
}

export class RedirectUrlDto {
  /** URL del proveedor de identidad a la que debe navegar el navegador. */
  readonly url!: string;
}
