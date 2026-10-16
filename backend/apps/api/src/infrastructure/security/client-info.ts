import { isIP } from 'node:net';
import { sha256Hex } from './tokens';

/**
 * Minimización de datos (05-Seguridad §10.1): la IP se guarda truncada a /24
 * (IPv4) o /48 (IPv6) y el agente de usuario como hash. Se conserva la
 * utilidad forense sin acumular datos personales innecesarios.
 */
export function anonymizeIp(ip: string | undefined): string {
  if (!ip) return 'desconocida';
  const clean = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(clean) === 4) {
    const parts = clean.split('.');
    return `${parts.slice(0, 3).join('.')}.0/24`;
  }
  if (isIP(clean) === 6) {
    const groups = expandIpv6(clean).slice(0, 3);
    return `${groups.join(':')}::/48`;
  }
  return 'desconocida';
}

function expandIpv6(ip: string): string[] {
  const [head = '', tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const fill = new Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0');
  return [...h, ...fill, ...t];
}

export function hashUserAgent(ua: string | undefined): string {
  return `sha256:${sha256Hex(ua ?? '')}`;
}

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

/** «Chrome · Windows». Solo se deriva el texto para mostrarlo; no se usa para decidir nada. */
export function deviceLabel(ua: string | undefined): string {
  const source = ua ?? '';
  const browser = BROWSERS.find(([re]) => re.test(source))?.[1] ?? 'Navegador';
  const system = SYSTEMS.find(([re]) => re.test(source))?.[1] ?? 'dispositivo desconocido';
  return `${browser} · ${system}`;
}
