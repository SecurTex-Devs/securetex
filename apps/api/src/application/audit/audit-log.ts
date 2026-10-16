import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Databases } from '../../infrastructure/db/databases';
import { anonymizeIp, hashUserAgent } from '../../infrastructure/security/client-info';
import { sha256, toBytes, type Bytes } from '../../infrastructure/security/tokens';
import type { RequestMeta } from '../request-meta';

export type AuditSeverity = 'info' | 'notice' | 'warning' | 'critical';

export interface AuditEntry {
  readonly type: string;
  readonly severity?: AuditSeverity;
  readonly actorUserId?: string | null;
  readonly target?: { readonly type: string; readonly id: string };
  readonly outcome: 'success' | 'failure' | 'denied';
  readonly reason?: string;
  /** Nunca contraseñas, tokens, cookies ni contenido de documentos (RS-052). */
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

const GENESIS: Bytes = new Uint8Array(32);
/** Clave arbitraria del bloqueo consultivo que serializa la cadena de hashes. */
const CHAIN_LOCK_KEY = 0x5ec7e;

/**
 * Registro de auditoría encadenado por hash (RS-050, RS-051, F-262):
 *   h(n) = SHA-256( h(n-1) ‖ forma canónica del evento n )
 *
 * Modificar o borrar un evento rompe todos los hashes posteriores, y
 * `verifyChain()` lo detecta. La tabla es además append-only en PostgreSQL.
 */
@Injectable()
export class AuditLog {
  private readonly logger = new Logger(AuditLog.name);

  constructor(private readonly db: Databases) {}

  async record(entry: AuditEntry, meta: RequestMeta): Promise<void> {
    try {
      await this.append(entry, meta);
    } catch (error: unknown) {
      // La auditoría no debe tumbar la operación del usuario, pero su fallo es
      // una alerta de seguridad en sí mismo.
      this.logger.error(`Fallo al escribir auditoría (${entry.type}): ${error instanceof Error ? error.message : 'desconocido'}`);
    }
  }

  private async append(entry: AuditEntry, meta: RequestMeta): Promise<void> {
    await this.db.audit.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;
      const last = await tx.auditEvent.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
      const prevHash: Bytes = last ? toBytes(last.hash) : GENESIS;
      const row = {
        occurredAt: new Date(),
        traceId: meta.traceId,
        eventType: entry.type,
        severity: entry.severity ?? 'info',
        actorUserId: entry.actorUserId ?? null,
        actorIpPrefix: anonymizeIp(meta.ip),
        actorUaHash: hashUserAgent(meta.userAgent),
        targetType: entry.target?.type ?? null,
        targetId: entry.target?.id ?? null,
        outcome: entry.outcome,
        reason: entry.reason ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonObject,
      };
      const hash = sha256(Buffer.concat([prevHash, Buffer.from(canonical(row), 'utf8')]));
      await tx.auditEvent.create({ data: { ...row, prevHash, hash } });
    });
  }

  /** Recalcula la cadena completa. Devuelve la primera secuencia rota, si la hay. */
  async verifyChain(): Promise<{ readonly ok: boolean; readonly checked: number; readonly brokenAtSeq: string | null }> {
    const events = await this.db.audit.auditEvent.findMany({ orderBy: { seq: 'asc' } });
    let prev: Bytes = GENESIS;
    for (const e of events) {
      const expected = sha256(Buffer.concat([prev, Buffer.from(canonical(e), 'utf8')]));
      if (!Buffer.from(e.prevHash).equals(prev) || !Buffer.from(e.hash).equals(expected)) {
        return { ok: false, checked: events.length, brokenAtSeq: e.seq.toString() };
      }
      prev = toBytes(e.hash);
    }
    return { ok: true, checked: events.length, brokenAtSeq: null };
  }
}

interface CanonicalFields {
  readonly occurredAt: Date;
  readonly traceId: string;
  readonly eventType: string;
  readonly severity: string;
  readonly actorUserId: string | null;
  readonly actorIpPrefix: string | null;
  readonly actorUaHash: string | null;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly outcome: string;
  readonly reason: string | null;
  readonly metadata: unknown;
}

/** Serialización estable: mismo evento ⇒ mismos bytes, sea cual sea el orden de las claves. */
function canonical(e: CanonicalFields): string {
  return JSON.stringify([
    e.occurredAt.toISOString(), e.traceId, e.eventType, e.severity, e.actorUserId, e.actorIpPrefix,
    e.actorUaHash, e.targetType, e.targetId, e.outcome, e.reason, sortKeys(e.metadata),
  ]);
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortKeys(obj[k])]));
}
