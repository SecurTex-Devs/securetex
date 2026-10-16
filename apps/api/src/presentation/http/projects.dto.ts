import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { TEMPLATE_IDS, type TemplateId } from '../../domain/templates';
import { INVITABLE_ROLES, type InvitableRole } from '../../domain/values';

const ENGINES = ['pdflatex', 'xelatex', 'lualatex'] as const;
type Engine = (typeof ENGINES)[number];
const FILTERS = ['all', 'owned', 'shared', 'archived', 'trash'] as const;
const SORTS = ['name', '-name', 'lastActivity', '-lastActivity'] as const;
const TAG_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'slate'] as const;

export class ListProjectsQueryDto {
  @IsOptional() @IsIn(FILTERS) readonly filter?: (typeof FILTERS)[number];
  @IsOptional() @IsString() @MaxLength(80) readonly q?: string;
  @IsOptional() @IsUUID() readonly tag?: string;
  @IsOptional() @IsIn(SORTS) readonly sort?: (typeof SORTS)[number];
}

export class CreateProjectDto {
  @IsString() @Length(1, 120, { message: 'Ponle un nombre de entre 1 y 120 caracteres.' })
  readonly name!: string;

  @IsOptional() @IsIn(ENGINES)
  readonly compiler?: Engine;

  /** Plantilla de partida del catálogo del equipo. Por defecto, documento en blanco. */
  @IsOptional() @IsIn(TEMPLATE_IDS)
  readonly template?: TemplateId;
}

/**
 * No incluye ownerId, confidential ni ningún campo de acceso: el propietario
 * no se cambia con un PATCH y RLS además lo impide a nivel de columna.
 */
export class UpdateProjectDto {
  @IsOptional() @IsString() @Length(1, 120)
  readonly name?: string;

  @IsOptional() @IsIn(ENGINES)
  readonly compiler?: Engine;

  @IsOptional() @IsString() @MaxLength(200)
  readonly mainFile?: string;
}

export class InviteMemberDto {
  @IsString() @MaxLength(254)
  readonly email!: string;

  /** `owner` NO es asignable por invitación (T-A11). */
  @IsIn(INVITABLE_ROLES, { message: 'Elige Editor, Revisor o Lector.' })
  readonly role!: InvitableRole;
}

export class ChangeRoleDto {
  @IsIn(INVITABLE_ROLES)
  readonly role!: InvitableRole;
}

export class CreateTagDto {
  @IsString() @Length(1, 40)
  readonly name!: string;

  @IsOptional() @IsIn(TAG_COLORS)
  readonly color?: (typeof TAG_COLORS)[number];
}

export class SetTagsDto {
  @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true })
  readonly tagIds!: string[];
}
