import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Sobre C1 + C2 (14-Criptografia-Multicapa §4-§5): AES-256-GCM dentro de
 * ChaCha20-Poly1305, con la DEK envuelta para la clave X25519 del servicio.
 */
export class EnvelopeDto {
  @IsIn([1]) readonly v!: 1;
  @IsString() @Matches(B64URL) @MaxLength(64) readonly epk!: string;
  @IsString() @Matches(B64URL) @MaxLength(32) readonly n1!: string;
  @IsString() @Matches(B64URL) @MaxLength(128) readonly wdek!: string;
  @IsString() @Matches(B64URL) @MaxLength(32) readonly n2!: string;
  /** El contenido ocupa como mucho 1 MB; cifrado y en base64url, algo más. */
  @IsString() @Matches(B64URL) @MaxLength(1_400_000) readonly body!: string;
}

/** La ruta y el contenido los valida además el dominio (SafeFilePath, cuotas). */
export class CreateFileDto {
  /** Ruta relativa, p. ej. «capitulos/intro.tex». */
  @IsString() @MaxLength(200)
  readonly path!: string;

  /** Contenido inicial sellado (C1 + C2). */
  @ValidateNested() @Type(() => EnvelopeDto)
  readonly envelope!: EnvelopeDto;
}

export class WriteFileDto {
  @ValidateNested() @Type(() => EnvelopeDto)
  readonly envelope!: EnvelopeDto;

  /** Versión sobre la que se editó. Si no coincide con la actual: 409. */
  @IsInt() @Min(1)
  readonly baseVersion!: number;
}

export class RenameFileDto {
  @IsString() @MaxLength(200)
  readonly path!: string;
}

/** Respuesta sellada para la clave efímera que el cliente envió en `X-SecurTex-Reply-Key`. */
export class SealedResponseDto {
  readonly envelope!: EnvelopeDto;
}

export class FileMetaDto {
  readonly id!: string;
  readonly path!: string;
  readonly kind!: string;
  readonly size!: number;
  readonly version!: number;
  readonly updatedAt!: Date;
}

export class FileWithContentDto extends FileMetaDto {
  readonly content!: string;
}

export class SecurityFindingDto {
  readonly rule!: string;
  readonly severity!: 'blocking' | 'warning';
  readonly title!: string;
  readonly file!: string;
  readonly line!: number;
  readonly snippet!: string;
  readonly alternative!: string;
}

export class AnalysisDto {
  /** `blocked`: el servidor no permitiría compilar este proyecto. */
  readonly verdict!: 'clean' | 'warnings' | 'blocked';
  readonly findings!: SecurityFindingDto[];
  readonly analyzedFiles!: number;
}

export class AdminUserDto {
  readonly id!: string;
  readonly primaryEmail!: string;
  readonly firstName!: string;
  readonly lastName!: string;
  readonly status!: 'pending' | 'active' | 'suspended' | 'deleted';
  readonly isSystemAdmin!: boolean;
  readonly emailVerifiedAt!: Date | null;
  readonly lastLoginAt!: Date | null;
  readonly createdAt!: Date;
  readonly mfaEnabled!: boolean;
  readonly activeSessions!: number;
}

export class TransportKeyDto {
  readonly alg!: 'X25519';
  /** Clave pública de 32 bytes en base64url. */
  readonly key!: string;
  readonly contexts!: string[];
}
