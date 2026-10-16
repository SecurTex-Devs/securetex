import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountService } from './application/account/account.service';
import { AdminUsersService } from './application/admin/admin-users.service';
import { EncryptedFileStore } from './application/files/file-store';
import { FilesService } from './application/files/files.service';
import { FileCrypto } from './infrastructure/security/envelope';
import { CompileController, FilesController } from './presentation/http/files.controller';
import { AuditLog } from './application/audit/audit-log';
import { AuthService } from './application/auth/auth.service';
import { NewPasswordService } from './application/auth/credentials';
import { EmailTokenService } from './application/auth/email-tokens';
import { LoginThrottle } from './application/auth/login-throttle';
import { MfaService } from './application/auth/mfa';
import { OidcService } from './application/auth/oidc.service';
import { SessionService } from './application/auth/sessions';
import { ProjectsService } from './application/projects/projects.service';
import { Databases } from './infrastructure/db/databases';
import { Mailer } from './infrastructure/mail/mailer';
import { AccessTokenService } from './infrastructure/security/access-tokens';
import { BreachedPasswordChecker } from './infrastructure/security/breached-passwords';
import { PasswordHasher } from './infrastructure/security/passwords';
import { SecretBox } from './infrastructure/security/secret-box';
import { AuthController } from './presentation/http/auth.controller';
import { MeController } from './presentation/http/me.controller';
import { ProblemDetailsFilter } from './presentation/http/problem-details.filter';
import { InvitationsController, ProjectsController, TagsController } from './presentation/http/projects.controller';
import { SecurityGuard } from './presentation/http/security';
import { AdminController, HealthController } from './presentation/http/system.controller';

@Module({
  imports: [
    // Límite global por IP; los endpoints sensibles declaran el suyo con @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController, MeController, ProjectsController, InvitationsController, TagsController, FilesController, CompileController, AdminController, HealthController],
  providers: [
    Databases, Mailer, PasswordHasher, SecretBox, AccessTokenService, BreachedPasswordChecker,
    AuditLog, SessionService, LoginThrottle, MfaService, EmailTokenService, NewPasswordService,
    AuthService, OidcService, AccountService, ProjectsService,
    FileCrypto, EncryptedFileStore, FilesService, AdminUsersService,
    // Orden: primero el límite de tasa (antes de gastar CPU en Argon2id, T-A10),
    // después identidad + política + CSRF.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SecurityGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
