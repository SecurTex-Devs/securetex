import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ArtifactSigner } from '../../infrastructure/security/artifact-signer';
import { TransportCrypto } from '../../infrastructure/security/transport';
import { ArtifactKeyDto, TransportKeyDto } from './files.dto';
import { Policy } from './security';

@ApiTags('Criptografía')
@Controller({ path: 'crypto', version: '1' })
export class CryptoController {
  constructor(
    private readonly transport: TransportCrypto,
    private readonly signer: ArtifactSigner,
  ) {}

  /**
   * Clave pública X25519 del servicio para la capa C2. Es pública por
   * definición; lo secreto es la privada, que nunca sale del proceso.
   */
  @Get('transport-key')
  @Policy('public')
  @SkipThrottle()
  @ApiOperation({ summary: 'Clave pública de transporte (C2)', description: 'X25519 en base64url. Los clientes sellan con ella los sobres C1 + C2.' })
  transportKey(): TransportKeyDto {
    return { alg: 'X25519', key: this.transport.publicKeyRaw.toString('base64url'), contexts: ['securtex:c2:v1', 'securtex:c2:ws:v1'] };
  }

  /** Clave pública Ed25519 con la que el navegador verifica cada PDF antes de mostrarlo (C4b). */
  @Get('artifact-key')
  @Policy('public')
  @SkipThrottle()
  @ApiOperation({ summary: 'Clave pública de firma de artefactos (C4b)', description: 'Ed25519 en base64url. Firma = Ed25519(SHA-256(pdf) ‖ compilationId ‖ sourceTreeHash).' })
  artifactKey(): ArtifactKeyDto {
    return { alg: 'Ed25519', key: this.signer.publicKeyRaw.toString('base64url'), message: 'sha256(pdf) || compilationId[16] || sourceTreeHash[32]' };
  }
}
