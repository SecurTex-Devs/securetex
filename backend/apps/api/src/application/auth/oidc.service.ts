import { Injectable, Logger } from '@nestjs/common';
import type { IdpProvider } from '@prisma/client';
import { loadEnv } from '../../config/env';
import { AUTH } from '../../domain/constants';
import { requirePublicRegistration } from '../../domain/registration';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../domain/errors';
import { Email } from '../../domain/values';
import { Databases } from '../../infrastructure/db/databases';
import { FIELD, FieldCipher } from '../../infrastructure/security/field-cipher';
import { formatCompositeToken, parseCompositeToken, randomSecret, secretMatches, sha256 } from '../../infrastructure/security/tokens';
import { AuditLog } from '../audit/audit-log';
import type { RequestMeta } from '../request-meta';
import { AuthService, type LoginResult } from './auth.service';

type ExternalProvider = Extract<IdpProvider, 'google' | 'microsoft'>;

interface ProviderConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

type OidcClient = typeof import('openid-client');
type Configuration = Awaited<ReturnType<OidcClient['discovery']>>;

interface ChallengeData {
  readonly provider: ExternalProvider;
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  /** Presente solo al VINCULAR desde Ajustes: la cuenta a la que se añade el proveedor. */
  readonly linkUserId?: string;
}

export type OidcOutcome = LoginResult | { readonly kind: 'linked'; readonly provider: ExternalProvider };

/**
 * Inicio de sesión con Google y Microsoft (RF-002, RF-003) mediante OpenID
 * Connect con Authorization Code + PKCE S256.
 *
 * · `state` y `nonce` de 256 bits, de un solo uso y ligados al navegador por
 *   una cookie HttpOnly (T-A05).
 * · Un client_id por proveedor y validación estricta de iss/aud (T-A07),
 *   delegada en openid-client, que además valida firma, exp y nonce.
 * · Sin vinculación automática por correo: si ya existe una cuenta local con
 *   ese correo, se exige iniciar sesión y vincular desde Ajustes. Vincular a
 *   ciegas permitiría apropiarse de una cuenta con un correo no verificado.
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly env = loadEnv();
  private readonly configs = new Map<ExternalProvider, Promise<Configuration>>();

  constructor(
    private readonly db: Databases,
    private readonly auth: AuthService,
    private readonly audit: AuditLog,
    private readonly cipher: FieldCipher,
  ) {}

  enabledProviders(): readonly ExternalProvider[] {
    return (['google', 'microsoft'] as const).filter((p) => this.providerConfig(p) !== null);
  }

  async start(provider: string, linkUserId?: string): Promise<{ readonly url: string; readonly challengeToken: string }> {
    const p = this.asProvider(provider);
    const client = await this.client();
    const config = await this.configuration(p);
    const data: ChallengeData = {
      provider: p,
      state: client.randomState(),
      nonce: client.randomNonce(),
      verifier: client.randomPKCECodeVerifier(),
      ...(linkUserId ? { linkUserId } : {}),
    };
    const secret = randomSecret();
    const challenge = await this.db.identity.authChallenge.create({
      data: { kind: 'oidc', secretHash: sha256(secret), data: { ...data }, expiresAt: new Date(Date.now() + AUTH.OIDC_CHALLENGE_TTL_MS) },
    });
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri(p),
      scope: 'openid email profile',
      code_challenge: await client.calculatePKCECodeChallenge(data.verifier),
      code_challenge_method: 'S256',
      state: data.state,
      nonce: data.nonce,
      prompt: 'select_account',
    });
    return { url: url.href, challengeToken: formatCompositeToken(challenge.id, secret) };
  }

  async callback(provider: string, currentUrl: URL, rawChallenge: string | undefined, sessionUserId: string | null, meta: RequestMeta): Promise<OidcOutcome> {
    const p = this.asProvider(provider);
    const data = await this.consumeChallenge(rawChallenge, p);
    const client = await this.client();
    const config = await this.configuration(p);
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: data.verifier,
      expectedState: data.state,
      expectedNonce: data.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub) throw new UnauthorizedError('oidc_failed', 'No hemos podido completar el inicio de sesión con el proveedor.');
    if (data.linkUserId) {
      // El reto se creó con una sesión reautenticada; la vuelta debe llegar con esa misma sesión.
      if (sessionUserId !== data.linkUserId) throw new UnauthorizedError('oidc_state_invalid', 'El inicio de sesión ha caducado. Inténtalo de nuevo.');
      await this.link(p, claims.sub, claims['email'], data.linkUserId, meta);
      return { kind: 'linked', provider: p };
    }
    const userId = await this.resolveUser(p, claims.sub, claims['email'], claims['email_verified'], claims, meta);
    return this.auth.finishPrimaryAuth({ id: userId }, p, true, meta);
  }

  /**
   * Vincular un proveedor a la cuenta ya autenticada (RF-005). Una identidad
   * externa pertenece a una sola cuenta: si ya está en otra, se rechaza.
   */
  private async link(provider: ExternalProvider, subject: string, rawEmail: unknown, userId: string, meta: RequestMeta): Promise<void> {
    const subjectIndex = this.cipher.index(`subject:${provider}`, subject);
    const existing = await this.db.identity.userIdentity.findUnique({ where: { provider_subjectIndex: { provider, subjectIndex } }, select: { userId: true } });
    if (existing && existing.userId !== userId) {
      await this.audit.record({ type: 'auth.oidc.link_conflict', severity: 'warning', actorUserId: userId, outcome: 'denied', metadata: { provider } }, meta);
      throw new ConflictError('oidc_already_linked', 'Esa cuenta del proveedor ya está vinculada a otro usuario de SecurTex.');
    }
    if (!existing) {
      const email = typeof rawEmail === 'string' ? rawEmail.slice(0, 254) : null;
      await this.db.identity.userIdentity.create({
        data: {
          userId, provider, subjectIndex, lastUsedAt: new Date(),
          providerSubject: this.cipher.encrypt(subject, FIELD.identitySubject),
          providerEmail: email ? this.cipher.encrypt(email, FIELD.identityEmail) : null,
        },
      });
    }
    await this.audit.record({ type: 'auth.oidc.linked', severity: 'notice', actorUserId: userId, target: { type: 'user', id: userId }, outcome: 'success', metadata: { provider } }, meta);
  }

  private async resolveUser(
    provider: ExternalProvider,
    subject: string,
    rawEmail: unknown,
    emailVerified: unknown,
    claims: Record<string, unknown>,
    meta: RequestMeta,
  ): Promise<string> {
    const subjectIndex = this.cipher.index(`subject:${provider}`, subject);
    const identity = await this.db.identity.userIdentity.findUnique({
      where: { provider_subjectIndex: { provider, subjectIndex } },
      include: { user: { select: { status: true } } },
    });
    if (identity) {
      if (identity.user.status === 'suspended' || identity.user.status === 'deleted') throw new UnauthorizedError('account_unavailable');
      await this.db.identity.userIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date() } });
      return identity.userId;
    }
    // Microsoft personal no siempre envía email_verified; solo se acepta si lo afirma.
    if (typeof rawEmail !== 'string' || emailVerified !== true) {
      throw new UnauthorizedError('oidc_email_unverified', 'Tu proveedor no ha confirmado tu correo. Regístrate con correo y contraseña.');
    }
    const email = Email.of(rawEmail);
    const existing = await this.db.identity.user.findUnique({ where: { emailIndex: this.cipher.emailIndex(email.toString()) } });
    if (existing) {
      await this.audit.record({ type: 'auth.oidc.link_required', severity: 'notice', actorUserId: existing.id, outcome: 'denied', metadata: { provider } }, meta);
      throw new UnauthorizedError('oidc_link_required', 'Ya existe una cuenta con ese correo. Inicia sesión y vincula el proveedor desde Ajustes.');
    }
    requirePublicRegistration(this.env.REGISTRATION_ENABLED);
    const user = await this.db.identity.user.create({
      data: {
        primaryEmail: this.cipher.encrypt(email.toString(), FIELD.userEmail),
        emailIndex: this.cipher.emailIndex(email.toString()),
        emailVerifiedAt: new Date(),
        status: 'active',
        firstName: this.cipher.encrypt(typeof claims['given_name'] === 'string' ? claims['given_name'].slice(0, 80) : '', FIELD.userFirstName),
        lastName: this.cipher.encrypt(typeof claims['family_name'] === 'string' ? claims['family_name'].slice(0, 80) : '', FIELD.userLastName),
        identities: {
          create: {
            provider, subjectIndex, lastUsedAt: new Date(),
            providerSubject: this.cipher.encrypt(subject, FIELD.identitySubject),
            providerEmail: this.cipher.encrypt(email.toString(), FIELD.identityEmail),
          },
        },
      },
    });
    await this.audit.record({ type: 'auth.register.success', actorUserId: user.id, outcome: 'success', metadata: { provider } }, meta);
    return user.id;
  }

  private async consumeChallenge(raw: string | undefined, provider: ExternalProvider): Promise<ChallengeData> {
    const parsed = parseCompositeToken(raw);
    const row = parsed ? await this.db.identity.authChallenge.findUnique({ where: { id: parsed.id } }) : null;
    const data = row?.data as ChallengeData | undefined;
    const valid = parsed && row && row.kind === 'oidc' && !row.consumedAt && row.expiresAt > new Date() && secretMatches(parsed.secret, row.secretHash) && data?.provider === provider;
    if (!valid || !data) throw new UnauthorizedError('oidc_state_invalid', 'El inicio de sesión ha caducado. Inténtalo de nuevo.');
    const claimed = await this.db.identity.authChallenge.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) throw new UnauthorizedError('oidc_state_invalid');
    return data;
  }

  private asProvider(raw: string): ExternalProvider {
    if ((raw === 'google' || raw === 'microsoft') && this.providerConfig(raw)) return raw;
    throw new NotFoundError();
  }

  private providerConfig(p: ExternalProvider): ProviderConfig | null {
    const e = this.env;
    if (p === 'google' && e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) {
      return { issuer: 'https://accounts.google.com', clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET };
    }
    if (p === 'microsoft' && e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET) {
      // Un tenant concreto (o «consumers») tiene un issuer fijo y validable.
      // «common» no: su issuer depende de cada inquilino (T-A07).
      return { issuer: `https://login.microsoftonline.com/${e.MICROSOFT_TENANT}/v2.0`, clientId: e.MICROSOFT_CLIENT_ID, clientSecret: e.MICROSOFT_CLIENT_SECRET };
    }
    return null;
  }

  private redirectUri(p: ExternalProvider): string {
    return `${this.env.APP_ORIGIN}/api/v1/auth/oidc/${p}/callback`;
  }

  private async configuration(p: ExternalProvider): Promise<Configuration> {
    const cfg = this.providerConfig(p);
    if (!cfg) throw new NotFoundError();
    let pending = this.configs.get(p);
    if (!pending) {
      pending = this.client().then((c) => c.discovery(new URL(cfg.issuer), cfg.clientId, cfg.clientSecret));
      pending.catch(() => {
        this.logger.warn(`No se pudo descubrir la configuración OIDC de ${p}`);
        this.configs.delete(p);
      });
      this.configs.set(p, pending);
    }
    return pending;
  }

  private async client(): Promise<OidcClient> {
    // openid-client v6 es solo ESM; se carga bajo demanda.
    return import('openid-client');
  }
}
