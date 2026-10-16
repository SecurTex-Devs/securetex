import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { loadEnv } from '../../config/env';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2_500;

/**
 * Comprobación de contraseñas filtradas por k-anonimato (RF-010, F-265).
 *
 * Solo salen del servidor los 5 primeros caracteres del SHA-1 de la contraseña;
 * la contraseña y su hash completo nunca se transmiten. SHA-1 aquí es el
 * protocolo de HIBP, no una función de seguridad (excepción documentada en
 * 05-Seguridad §7.4). La cabecera Add-Padding oculta incluso el tamaño de la
 * respuesta a un observador de red.
 *
 * Si el servicio no responde, se permite continuar (fail open) y se registra:
 * bloquear el registro por la caída de un tercero sería peor para el usuario,
 * y la política local ya filtra las contraseñas más comunes.
 */
@Injectable()
export class BreachedPasswordChecker {
  private readonly logger = new Logger(BreachedPasswordChecker.name);
  private readonly enabled = loadEnv().HIBP_ENABLED;

  async isBreached(password: string): Promise<boolean> {
    if (!this.enabled) return false;
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    try {
      const response = await fetch(`${RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'SecurTex-academic' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return false;
      const body = await response.text();
      return body.split('\n').some((line) => {
        const [candidate, count] = line.trim().split(':');
        return candidate === suffix && Number(count) > 0;
      });
    } catch {
      this.logger.warn('HIBP no disponible: se omite la comprobación de filtraciones');
      return false;
    }
  }
}
