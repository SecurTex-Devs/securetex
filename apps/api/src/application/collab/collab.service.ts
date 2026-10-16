import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import * as Y from 'yjs';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { COLLAB } from '../../domain/constants';
import { IntegrityError, ValidationError } from '../../domain/errors';
import { decide } from '../../domain/project-policy';
import { SessionService } from '../auth/sessions';
import { FilesService } from '../files/files.service';
import { ProjectsService } from '../projects/projects.service';
import type { Actor, RequestMeta } from '../request-meta';

/**
 * Tipos de mensaje del protocolo de colaboración (primer byte del mensaje
 * descifrado). El frontend usa los mismos valores.
 */
export const MSG = {
  SYNC1: 1, SYNC2: 2, UPDATE: 3, AWARENESS: 4, FLUSH: 5, SAVED: 6, TREE: 7, ERROR: 8, ACCESS: 9,
} as const;

/** Una conexión autenticada y autorizada. El transporte cifrado lo pone la capa de presentación. */
export interface CollabPeer {
  readonly id: string;
  readonly actor: Actor;
  readonly displayName: string;
  readonly color: string;
  readOnly: boolean;
  /** Actualizaciones de este par ya aplicadas al documento: el acuse de guardado se refiere a ellas. */
  applied: number;
  readonly awarenessIds: Set<number>;
  send(message: Uint8Array): void;
  close(code: number, reason: string): void;
}

interface Room {
  readonly projectId: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly peers: Set<CollabPeer>;
  readonly files: Set<string>;
  readonly persisted: Map<string, string>;
  readonly dirty: Set<string>;
  readonly lastEditor: Map<string, string>;
  bytes: number;
  firstDirtyAt: number | null;
  timer: NodeJS.Timeout | null;
  revalidator: NodeJS.Timeout;
  saving: Promise<void> | null;
}

const textName = (fileId: string) => `file:${fileId}`;
const encode = (type: number, payload: Uint8Array) => {
  const out = new Uint8Array(payload.length + 1);
  out[0] = type;
  out.set(payload, 1);
  return out;
};
const json = (type: number, value: unknown) => encode(type, new TextEncoder().encode(JSON.stringify(value)));

/**
 * Colaboración en tiempo real (F-090 … F-095) con Yjs: un documento por
 * proyecto, un `Y.Text` por archivo. El servidor es un par más del CRDT:
 * aplica, reenvía y persiste cifrado (C3 + C4) con el usuario que editó.
 *
 * Seguridad (T-R01 … T-R06):
 *   · El rol se revalida cada pocos segundos y ante cambios de acceso: un
 *     revocado pierde la conexión al instante.
 *   · Un lector o revisor puede ver y mostrar su cursor, pero el servidor
 *     descarta sus actualizaciones de contenido.
 *   · El nombre y el color del cursor los fija el servidor (anti suplantación).
 *   · Solo se persisten los archivos que existen en el proyecto, con cuotas.
 */
@Injectable()
export class CollabService implements OnModuleDestroy {
  private readonly logger = new Logger(CollabService.name);
  private readonly rooms = new Map<string, Promise<Room>>();

  constructor(
    private readonly files: FilesService,
    private readonly projects: ProjectsService,
    private readonly sessions: SessionService,
  ) {}

  async join(peer: CollabPeer, projectId: string, meta: RequestMeta): Promise<void> {
    const room = await this.room(projectId, peer.actor, meta);
    room.peers.add(peer);
    // El cliente pide el estado con SYNC1; el servidor pide además lo que el
    // cliente tenga y él no (ediciones hechas sin conexión).
    peer.send(encode(MSG.SYNC1, Y.encodeStateVector(room.doc)));
    const states = [...room.awareness.getStates().keys()];
    if (states.length) peer.send(encode(MSG.AWARENESS, encodeAwarenessUpdate(room.awareness, states)));
  }

  async receive(peer: CollabPeer, projectId: string, message: Uint8Array): Promise<void> {
    const room = await this.rooms.get(projectId);
    if (!room || !room.peers.has(peer) || message.length === 0) return;
    const type = message[0];
    const payload = message.subarray(1);
    switch (type) {
      case MSG.SYNC1:
        peer.send(encode(MSG.SYNC2, Y.encodeStateAsUpdate(room.doc, payload)));
        return;
      case MSG.SYNC2:
      case MSG.UPDATE:
        this.applyUpdate(room, peer, payload);
        return;
      case MSG.AWARENESS:
        applyAwarenessUpdate(room.awareness, payload, peer);
        return;
      case MSG.FLUSH:
        await this.persist(room);
        return;
      default:
        peer.close(4400, 'unknown_message');
    }
  }

  async leave(peer: CollabPeer, projectId: string): Promise<void> {
    const room = await this.rooms.get(projectId)?.catch(() => null);
    if (!room || !room.peers.delete(peer)) return;
    if (peer.awarenessIds.size) removeAwarenessStates(room.awareness, [...peer.awarenessIds], 'server');
    if (room.peers.size === 0) await this.unload(room);
  }

  /** Antes de analizar o exportar: lo que hay en la sala se escribe ya en la base. */
  async persistNow(projectId: string): Promise<void> {
    const room = await this.rooms.get(projectId)?.catch(() => null);
    if (room) await this.persist(room);
  }

  /** Cambios hechos por REST mientras la sala está abierta. */
  async fileCreated(projectId: string, fileId: string, content: string): Promise<void> {
    const room = await this.rooms.get(projectId)?.catch(() => null);
    if (!room) return;
    room.files.add(fileId);
    room.persisted.set(fileId, content);
    const text = room.doc.getText(textName(fileId));
    room.doc.transact(() => {
      if (text.length) text.delete(0, text.length);
      text.insert(0, content);
    }, 'server');
    this.broadcastTree(room);
  }

  async fileDeleted(projectId: string, fileId: string): Promise<void> {
    const room = await this.rooms.get(projectId)?.catch(() => null);
    if (!room) return;
    room.files.delete(fileId);
    room.dirty.delete(fileId);
    room.persisted.delete(fileId);
    this.broadcastTree(room);
  }

  async treeChanged(projectId: string): Promise<void> {
    const room = await this.rooms.get(projectId)?.catch(() => null);
    if (room) this.broadcastTree(room);
  }

  /** Revalida ya mismo a todos los conectados (tras revocar, cambiar un rol o borrar el proyecto). */
  async revalidate(projectId: string): Promise<void> {
    const room = await this.rooms.get(projectId)?.catch(() => null);
    if (room) await this.revalidateRoom(room);
  }

  async onModuleDestroy(): Promise<void> {
    for (const pending of this.rooms.values()) {
      const room = await pending.catch(() => null);
      if (room) await this.unload(room);
    }
  }

  // ─────────────────────────── interno ───────────────────────────

  private room(projectId: string, actor: Actor, meta: RequestMeta): Promise<Room> {
    let pending = this.rooms.get(projectId);
    if (!pending) {
      pending = this.load(projectId, actor, meta);
      this.rooms.set(projectId, pending);
      // Si la carga falla (integridad, permisos), no se queda una sala rota en memoria.
      pending.catch(() => this.rooms.delete(projectId));
    }
    return pending;
  }

  private async load(projectId: string, actor: Actor, meta: RequestMeta): Promise<Room> {
    // readAll autoriza, verifica el HMAC (C4) y descifra (C3); un fallo de integridad se audita allí.
    const files = await this.files.readAll(actor, projectId, meta);
    const doc = new Y.Doc({ gc: true });
    doc.transact(() => {
      for (const f of files) doc.getText(textName(f.id)).insert(0, f.content);
    }, 'server');
    const awareness = new Awareness(doc);
    awareness.setLocalState(null);
    const room: Room = {
      projectId, doc, awareness, peers: new Set(),
      files: new Set(files.map((f) => f.id)),
      persisted: new Map(files.map((f) => [f.id, f.content])),
      dirty: new Set(), lastEditor: new Map(),
      bytes: 0, firstDirtyAt: null, timer: null, saving: null,
      revalidator: setInterval(() => void this.revalidateRoom(room), COLLAB.REVALIDATE_MS),
    };
    room.revalidator.unref();
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'server') {
        for (const p of room.peers) p.send(encode(MSG.UPDATE, update));
        return;
      }
      for (const p of room.peers) if (p !== origin) p.send(encode(MSG.UPDATE, update));
    });
    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const owner = origin as CollabPeer | 'server' | undefined;
      if (owner && owner !== 'server' && typeof owner === 'object') this.stampIdentity(room, owner, [...added, ...updated]);
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) return;
      const msg = encode(MSG.AWARENESS, encodeAwarenessUpdate(room.awareness, changed));
      for (const p of room.peers) if (p !== owner) p.send(msg);
    });
    return room;
  }

  /**
   * El nombre y el color que ven los demás los pone el servidor a partir de la
   * sesión: un cliente no puede hacerse pasar por otra persona en el cursor.
   * Cada conexión controla como mucho un identificador de presencia.
   */
  private stampIdentity(room: Room, peer: CollabPeer, ids: readonly number[]): void {
    for (const id of ids) {
      const ownedByOther = [...room.peers].some((p) => p !== peer && p.awarenessIds.has(id));
      if (ownedByOther || (peer.awarenessIds.size >= 1 && !peer.awarenessIds.has(id))) {
        room.awareness.states.delete(id);
        continue;
      }
      peer.awarenessIds.add(id);
      const state = room.awareness.states.get(id);
      if (state) room.awareness.states.set(id, { ...state, user: { id: peer.actor.userId, name: peer.displayName, color: peer.color, readOnly: peer.readOnly } });
    }
  }

  private applyUpdate(room: Room, peer: CollabPeer, update: Uint8Array): void {
    // Un lector puede tener cambios locales (p. ej. si su rol bajó): se descartan sin aplicarlos.
    if (peer.readOnly || update.length === 0) return;
    if (update.length > COLLAB.MAX_UPDATE_BYTES || room.bytes + update.length > COLLAB.MAX_ROOM_BYTES) {
      peer.send(json(MSG.ERROR, { code: 'quota', message: 'El documento ha alcanzado el tamaño máximo.' }));
      return;
    }
    room.bytes += update.length;
    const changed: string[] = [];
    const onTransaction = (tr: Y.Transaction) => {
      if (tr.origin !== peer) return;
      for (const id of room.files) if ((tr.changed as Map<unknown, unknown>).has(room.doc.getText(textName(id)))) changed.push(id);
    };
    room.doc.on('afterTransaction', onTransaction);
    try {
      Y.applyUpdate(room.doc, update, peer);
    } catch {
      peer.close(4400, 'invalid_update');
      return;
    } finally {
      room.doc.off('afterTransaction', onTransaction);
    }
    peer.applied += 1;
    for (const id of changed) {
      room.dirty.add(id);
      room.lastEditor.set(id, peer.actor.userId);
    }
    if (room.dirty.size) this.schedulePersist(room);
  }

  private schedulePersist(room: Room): void {
    const now = Date.now();
    room.firstDirtyAt ??= now;
    if (room.timer) clearTimeout(room.timer);
    // Debounce de 1,5 s, pero nunca más de 8 s sin guardar mientras alguien escribe sin parar.
    const wait = now - room.firstDirtyAt >= COLLAB.MAX_PERSIST_DELAY_MS ? 0 : COLLAB.PERSIST_DEBOUNCE_MS;
    room.timer = setTimeout(() => void this.persist(room), wait);
  }

  private persist(room: Room): Promise<void> {
    if (room.saving) return room.saving.then(() => this.persist(room));
    room.saving = this.persistDirty(room).finally(() => { room.saving = null; });
    return room.saving;
  }

  private async persistDirty(room: Room): Promise<void> {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.firstDirtyAt = null;
    const acks = new Map([...room.peers].map((p) => [p, p.applied]));
    const pending = [...room.dirty];
    room.dirty.clear();
    for (const fileId of pending) {
      if (!room.files.has(fileId)) continue;
      const content = room.doc.getText(textName(fileId)).toString();
      if (room.persisted.get(fileId) === content) continue;
      const saved = await this.persistFile(room, fileId, content);
      if (saved) room.persisted.set(fileId, content);
      else room.dirty.add(fileId);
    }
    for (const [peer, applied] of acks) if (room.peers.has(peer)) peer.send(json(MSG.SAVED, { ack: applied, pending: room.dirty.size }));
  }

  /** Se guarda en nombre de quien editó; si ya no puede (rol revocado), de otro editor conectado. */
  private async persistFile(room: Room, fileId: string, content: string): Promise<boolean> {
    const candidates = [room.lastEditor.get(fileId), ...[...room.peers].filter((p) => !p.readOnly).map((p) => p.actor.userId)]
      .filter((id): id is string => typeof id === 'string');
    for (const userId of new Set(candidates)) {
      try {
        if (await this.files.persistFromCollab(userId, room.projectId, fileId, content)) return true;
        room.files.delete(fileId);
        return true;
      } catch (e) {
        if (e instanceof ValidationError) {
          for (const p of room.peers) p.send(json(MSG.ERROR, { code: 'quota', message: e.message }));
          return false;
        }
        this.logger.warn(`No se pudo persistir un archivo de la sala con el usuario actual; se prueba con otro editor.`);
      }
    }
    return false;
  }

  private async revalidateRoom(room: Room): Promise<void> {
    for (const peer of [...room.peers]) {
      try {
        if (!(await this.sessions.isActive(peer.actor.sessionId, peer.actor.userId))) throw new Error('session');
        const { role } = await this.projects.authorize(peer.actor, room.projectId, 'view');
        const readOnly = !decide(role, 'edit_content').allowed;
        if (readOnly !== peer.readOnly) {
          peer.readOnly = readOnly;
          peer.send(json(MSG.ACCESS, { readOnly }));
        }
      } catch (e) {
        if (e instanceof IntegrityError) continue;
        peer.send(json(MSG.ERROR, { code: 'access_revoked', message: 'Ya no tienes acceso a este proyecto.' }));
        peer.close(4403, 'access_revoked');
        await this.leave(peer, room.projectId);
      }
    }
  }

  private broadcastTree(room: Room): void {
    const msg = json(MSG.TREE, { at: Date.now() });
    for (const p of room.peers) p.send(msg);
  }

  private async unload(room: Room): Promise<void> {
    if (this.rooms.get(room.projectId) === undefined) return;
    await this.persist(room).catch(() => undefined);
    // Alguien se unió mientras se guardaba: la sala sigue viva.
    if (room.peers.size > 0) return;
    clearInterval(room.revalidator);
    this.rooms.delete(room.projectId);
    room.awareness.destroy();
    room.doc.destroy();
  }
}
