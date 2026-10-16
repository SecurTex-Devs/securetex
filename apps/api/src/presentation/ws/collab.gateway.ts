import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { IncomingMessage, Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { AuditLog } from '../../application/audit/audit-log';
import { SessionService } from '../../application/auth/sessions';
import { CollabService, type CollabPeer } from '../../application/collab/collab.service';
import { ProjectsService } from '../../application/projects/projects.service';
import type { Actor, RequestMeta } from '../../application/request-meta';
import { loadEnv } from '../../config/env';
import { COLLAB } from '../../domain/constants';
import { IntegrityError, NotFoundError } from '../../domain/errors';
import { decide } from '../../domain/project-policy';
import { asUserId } from '../../domain/values';
import { PersonalData } from '../../infrastructure/security/personal-data';
import { TransportCrypto, type SecureChannel } from '../../infrastructure/security/transport';
import { COOKIES } from '../http/cookies';

const PATH = /^\/api\/v1\/collab\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const COLORS = ['#4f6bff', '#e0573d', '#1f9d6b', '#b25ad6', '#d4950f', '#2a9db5', '#d94c8a', '#6b7d2a'] as const;

/** Códigos de cierre propios (rango 4000-4999 reservado a la aplicación). */
export const CLOSE = { BAD_MESSAGE: 4400, UNAUTHENTICATED: 4401, FORBIDDEN: 4403, NOT_FOUND: 4404, TIMEOUT: 4408, INTEGRITY: 4409, TOO_MANY: 4429 } as const;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

const colorFor = (userId: string) => COLORS[createHash('sha256').update(userId).digest()[0]! % COLORS.length] ?? COLORS[0];

/**
 * Entrada WebSocket de la colaboración. Misma cadena de controles que HTTP:
 * Origin exacto (anti CSWSH), sesión por cookie HttpOnly, autorización en el
 * dominio y RLS. Después, canal cifrado C2 (X25519 + ChaCha20-Poly1305) con
 * bloques C1 (AES-256-GCM) dentro: el contenido nunca viaja en claro dentro
 * de la carga útil, aunque TLS termine antes de este proceso.
 */
@Injectable()
export class CollabGateway implements OnModuleDestroy {
  private readonly logger = new Logger(CollabGateway.name);
  private readonly allowedOrigins = new Set(loadEnv().APP_ORIGINS);
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: COLLAB.MAX_FRAME_BYTES, perMessageDeflate: false });
  private readonly perUser = new Map<string, number>();

  constructor(
    private readonly sessions: SessionService,
    private readonly projects: ProjectsService,
    private readonly collab: CollabService,
    private readonly transport: TransportCrypto,
    private readonly personal: PersonalData,
    private readonly audit: AuditLog,
  ) {}

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => this.onUpgrade(req, socket, head));
  }

  onModuleDestroy(): void {
    for (const ws of this.wss.clients) ws.close(1001, 'server_shutdown');
    this.wss.close();
  }

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const match = PATH.exec(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (!match?.[1]) {
      socket.destroy();
      return;
    }
    // Cross-Site WebSocket Hijacking: el navegador envía la cookie a cualquier
    // origen que abra el socket; solo el Origin distingue nuestra aplicación.
    if (!req.headers.origin || !this.allowedOrigins.has(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const projectId = match[1].toLowerCase();
    this.wss.handleUpgrade(req, socket, head, (ws) => void this.onConnection(ws, req, projectId));
  }

  private async onConnection(ws: WebSocket, req: IncomingMessage, projectId: string): Promise<void> {
    // El cliente envía su saludo nada más abrir; se guarda hasta terminar de autenticar.
    const early: Array<[RawData, boolean]> = [];
    const buffer = (data: RawData, isBinary: boolean) => {
      if (early.length < 4) early.push([data, isBinary]);
      else ws.close(CLOSE.BAD_MESSAGE, 'bad_message');
    };
    ws.on('message', buffer);
    const meta: RequestMeta = { traceId: randomUUID().replace(/-/g, ''), ip: req.socket.remoteAddress, userAgent: req.headers['user-agent'] };
    const actor = await this.sessions.authenticate(parseCookies(req.headers.cookie)[COOKIES.access]).catch(() => null);
    if (!actor) return ws.close(CLOSE.UNAUTHENTICATED, 'unauthenticated');

    const open = this.perUser.get(actor.userId) ?? 0;
    if (open >= COLLAB.MAX_CONNECTIONS_PER_USER) return ws.close(CLOSE.TOO_MANY, 'too_many_connections');

    let readOnly: boolean;
    try {
      const { role } = await this.projects.authorize(actor, projectId, 'view');
      readOnly = !decide(role, 'edit_content').allowed;
    } catch {
      // 404 uniforme: no se distingue «no existe» de «no eres miembro» (T-P07).
      return ws.close(CLOSE.NOT_FOUND, 'not_found');
    }

    this.perUser.set(actor.userId, open + 1);
    ws.once('close', () => {
      const n = (this.perUser.get(actor.userId) ?? 1) - 1;
      if (n <= 0) this.perUser.delete(actor.userId);
      else this.perUser.set(actor.userId, n);
    });
    ws.off('message', buffer);
    const handler = this.handshake(ws, actor, projectId, readOnly, meta);
    for (const [data, isBinary] of early) handler(data, isBinary);
  }

  /**
   * 1 · el cliente envía su clave efímera (texto, solo claves públicas);
   * 2 · el servidor responde con la suya y la primera trama cifrada (su DEK de C1);
   * 3 · el cliente envía su DEK de C1 cifrada. Desde ahí, todo va cifrado.
   */
  private handshake(ws: WebSocket, actor: Actor, projectId: string, readOnly: boolean, meta: RequestMeta): (data: RawData, isBinary: boolean) => void {
    let channel: SecureChannel | null = null;
    let peer: CollabPeer | null = null;
    let queue: Promise<void> = Promise.resolve();
    const timeout = setTimeout(() => ws.close(CLOSE.TIMEOUT, 'handshake_timeout'), COLLAB.HANDSHAKE_TIMEOUT_MS);

    const onMessage = (data: RawData, isBinary: boolean) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
      try {
        if (!channel) {
          if (isBinary) throw new IntegrityError('handshake');
          const hello = JSON.parse(buf.toString('utf8')) as { t?: unknown; v?: unknown; epk?: unknown };
          if (hello.t !== 'hello' || hello.v !== 1) throw new IntegrityError('handshake');
          const opened = this.transport.openChannel(this.transport.parseReplyKey(hello.epk), projectId);
          channel = opened.channel;
          ws.send(JSON.stringify({ t: 'welcome', v: 1, epk: opened.serverEpk.toString('base64url'), readOnly, userId: actor.userId }));
          ws.send(channel.outgoingKeyFrame());
          return;
        }
        if (!channel.ready) {
          if (!isBinary) throw new IntegrityError('handshake');
          channel.acceptKeyFrame(buf);
          clearTimeout(timeout);
          const ch = channel;
          queue = queue.then(async () => {
            peer = await this.createPeer(ws, ch, actor, readOnly);
            await this.collab.join(peer, projectId, meta);
          }).catch((e: unknown) => this.fail(ws, e));
          return;
        }
        if (!isBinary) throw new IntegrityError('frame');
        // Se descifra en orden de llegada (los contadores de C2 lo exigen) y se procesa en cola.
        const message = channel.decrypt(buf);
        queue = queue.then(async () => {
          if (peer) await this.collab.receive(peer, projectId, message);
        }).catch((e: unknown) => this.fail(ws, e));
      } catch (e) {
        clearTimeout(timeout);
        if (e instanceof IntegrityError) {
          void this.audit.record({ type: 'collab.frame_rejected', severity: 'warning', actorUserId: actor.userId, target: { type: 'project', id: projectId }, outcome: 'denied', reason: e.stage }, meta);
        }
        ws.close(CLOSE.BAD_MESSAGE, 'bad_message');
      }
    };
    ws.on('message', onMessage);

    ws.on('close', () => {
      clearTimeout(timeout);
      void queue.then(async () => {
        if (peer) await this.collab.leave(peer, projectId);
        channel?.destroy();
      });
    });
    ws.on('error', () => ws.terminate());
    return onMessage;
  }

  private async createPeer(ws: WebSocket, channel: SecureChannel, actor: Actor, readOnly: boolean): Promise<CollabPeer> {
    const profile = await this.personal.displayName(asUserId(actor.userId));
    return {
      id: randomUUID(),
      actor,
      displayName: profile,
      color: colorFor(actor.userId),
      readOnly,
      applied: 0,
      awarenessIds: new Set(),
      send: (message) => {
        if (ws.readyState === ws.OPEN) ws.send(channel.encrypt(message));
      },
      close: (code, reason) => ws.close(code, reason),
    };
  }

  private fail(ws: WebSocket, e: unknown): void {
    if (e instanceof IntegrityError) {
      // El contenido no supera la verificación C4: no se envía nada al cliente.
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'error', code: 'integrity_violation' }));
      ws.close(CLOSE.INTEGRITY, 'integrity_violation');
      return;
    }
    if (e instanceof NotFoundError) {
      ws.close(CLOSE.NOT_FOUND, 'not_found');
      return;
    }
    this.logger.error(`Fallo en la colaboración: ${e instanceof Error ? e.name : 'desconocido'}`);
    ws.close(1011, 'internal_error');
  }
}
