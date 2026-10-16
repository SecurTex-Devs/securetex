import { IsBoolean, IsIn, IsObject, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * DTO de identidad. El ValidationPipe global usa whitelist +
 * forbidNonWhitelisted: cualquier campo no declarado aquí (p. ej. `role`,
 * `isSystemAdmin`, `emailVerifiedAt`) produce un 400, no una escalada (T-A11).
 *
 * Las reglas de negocio (fortaleza de la contraseña, formato del correo) viven
 * en los objetos de valor del dominio; aquí solo se acotan tipos y tamaños.
 */

export class RegisterDto {
  /** Correo con el que se creará la cuenta. */
  @IsString() @MaxLength(254)
  readonly email!: string;

  /** Entre 12 y 128 caracteres; se comprueba contra filtraciones. */
  @IsString() @MaxLength(256)
  readonly password!: string;

  @IsString() @Length(1, 80, { message: 'Escribe tu nombre.' })
  readonly firstName!: string;

  @IsString() @MaxLength(80)
  readonly lastName!: string;

  /** Aceptación de términos y política de privacidad. */
  @IsBoolean() @IsIn([true], { message: 'Debes aceptar los términos para continuar.' })
  readonly acceptTerms!: boolean;
}

export class LoginDto {
  @IsString() @MaxLength(254)
  readonly email!: string;

  @IsString() @MaxLength(256)
  readonly password!: string;

  /** «No cerrar sesión»: cookie persistente de hasta 7 días. */
  @IsOptional() @IsBoolean()
  readonly remember?: boolean;
}

export class TokenDto {
  /** Token de un solo uso recibido por correo (256 bits, base64url). */
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'El enlace no es válido.' })
  readonly token!: string;
}

export class EmailDto {
  @IsString() @MaxLength(254)
  readonly email!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString() @MaxLength(256)
  readonly password!: string;
}

export class MfaVerifyDto {
  /** `totp` para la aplicación autenticadora; `recovery` para un código de respaldo. */
  @IsIn(['totp', 'recovery'])
  readonly kind!: 'totp' | 'recovery';

  @IsString() @Length(6, 16)
  readonly code!: string;
}

export class TotpCodeDto {
  @IsString() @Matches(/^\d{6}$/, { message: 'Introduce los 6 dígitos de tu aplicación.' })
  readonly code!: string;
}

export class ReauthDto {
  @IsOptional() @IsString() @MaxLength(256)
  readonly password?: string;

  @IsOptional() @IsString() @Matches(/^\d{6}$/)
  readonly code?: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(256)
  readonly newPassword!: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 80) readonly firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) readonly lastName?: string;
  @IsOptional() @IsString() @MaxLength(80) readonly institution?: string;
  @IsOptional() @IsString() @MaxLength(80) readonly roleTitle?: string;
  @IsOptional() @IsIn(['es', 'en']) readonly locale?: 'es' | 'en';
  @IsOptional() @IsString() @MaxLength(64) @Matches(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/) readonly timezone?: string;
}

export class DeleteAccountDto {
  /** Debe ser exactamente «ELIMINAR MI CUENTA». */
  @IsString() @MaxLength(40)
  readonly confirmation!: string;
}

export class SavePreferencesDto {
  /** Objeto plano de hasta 4 KB: tema, tipografía, atajos… */
  @IsObject()
  readonly prefs!: Record<string, unknown>;
}
