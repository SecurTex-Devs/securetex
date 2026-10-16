import { Injectable } from '@nestjs/common';
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { loadEnv } from '../../config/env';
import { AUTH } from '../../domain/constants';
import { randomSecret, sha256Hex } from './tokens';

const ISSUER = 'securtex-api';
const AUDIENCE = 'securtex-web';

export interface AccessClaims {
  readonly userId: string;
  readonly sessionId: string;
}

/**
 * Access tokens de 10 minutos (RS-004) firmados con Ed25519 (05-Seguridad §7.4).
 * El algoritmo está fijado en la verificación: `alg: none` o un cambio a HS256
 * se rechazan siempre. El token viaja en una cookie HttpOnly, nunca en
 * localStorage (T-A03).
 */
@Injectable()
export class AccessTokenService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly kid: string;

  constructor() {
    const der = Buffer.from(loadEnv().JWT_PRIVATE_KEY, 'base64');
    this.privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    if (this.privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('JWT_PRIVATE_KEY debe ser una clave Ed25519');
    }
    this.publicKey = createPublicKey(this.privateKey);
    this.kid = sha256Hex(this.publicKey.export({ format: 'der', type: 'spki' })).slice(0, 16);
  }

  async issue(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid, typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setJti(randomSecret(16))
      .setExpirationTime(Math.floor((Date.now() + AUTH.ACCESS_TOKEN_TTL_MS) / 1000))
      .sign(this.privateKey);
  }

  async verify(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: ['EdDSA'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const sid = payload['sid'];
      if (typeof payload.sub !== 'string' || typeof sid !== 'string') return null;
      return { userId: payload.sub, sessionId: sid };
    } catch {
      return null;
    }
  }
}
