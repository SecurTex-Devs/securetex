import { IsInt, IsString, MaxLength, Min } from 'class-validator';

/** La ruta y el contenido los valida además el dominio (SafeFilePath, cuotas). */
export class CreateFileDto {
  /** Ruta relativa, p. ej. «capitulos/intro.tex». */
  @IsString() @MaxLength(200)
  readonly path!: string;

  @IsString() @MaxLength(1_000_000)
  readonly content!: string;
}

export class WriteFileDto {
  @IsString() @MaxLength(1_000_000)
  readonly content!: string;

  /** Versión sobre la que se editó. Si no coincide con la actual: 409. */
  @IsInt() @Min(1)
  readonly baseVersion!: number;
}

export class RenameFileDto {
  @IsString() @MaxLength(200)
  readonly path!: string;
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
