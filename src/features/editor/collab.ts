'use client';

import * as Y from 'yjs';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { ClientChannel, IntegrityFailure } from '@/shared/crypto/transport';

/** Mismos valores que el servidor (application/collab/collab.service.ts). */
export const MSG = { SYNC1: 1, SYNC2: 2, UPDATE: 3, AWARENESS: 4, FLUSH: 5, SAVED: 6, TREE: 7, ERROR: 8, ACCESS: 9, ROOM: 10 } as const;

export type CollabStatus = 'connecting' | 'synced' | 'offline' | 'unauthenticated' | 'denied' | 'integrity';

export interface CollabEvents {
  readonly onStatus: (status: CollabStatus) => void;
  /** `pending`: hay cambios locales que el servidor aún no ha confirmado como guardados. */
  readonly onPending: (pending: boolean) => void;
  readonly onTree: () => void;
  readonly onAccess: (readOnly: boolean) => void;
  readonly onError: (code: string, message: string) => void;
  readonly onSynced: () => void;
  /**
   * La sala se reconstruyó en el servidor con otra historia (época distinta):
   * esta copia no debe fusionarse con ella o duplicaría el texto. Quien la
   * usa crea un cliente nuevo y vuelve a aplicar lo que no estaba guardado.
   */
  readonly onReset: () => void;
}

const encode = (type: number, payload: Uint8Array) => {
  const out = new Uint8Array(payload.length + 1);
  out[0] = type;
  out.set(payload, 1);
  return out;
};
const readJson = <T,>(payload: Uint8Array): T => JSON.parse(new TextDecoder().decode(payload)) as T;

/**
 * Proveedor Yjs propio sobre un WebSocket cifrado de extremo a extremo con el
 * servicio (C1 + C2 por trama, C5 al recibir). El documento local sobrevive a
 * las reconexiones: lo escrito sin conexión se sincroniza al volver.
 */
export class CollabClient {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  private ws: WebSocket | null = null;
  private channel: ClientChannel | null = null;
  private queue: Promise<void> = Promise.resolve();
  private sent = 0;
  private retries = 0;
  private retryTimer: number | null = null;
  private destroyed = false;
  private synced = false;
  private epoch: string | null = null;
  /** La época de esta conexión ya se confirmó: hasta entonces no se envía historia local. */
  private confirmed = false;

  constructor(
    private readonly projectId: string,
    private readonly url: string,
    private readonly events: CollabEvents,
  ) {
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      this.events.onPending(true);
      if (this.isOpen()) {
        this.sent += 1;
        this.send(MSG.UPDATE, update);
      }
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'remote' || !this.isOpen()) return;
      this.send(MSG.AWARENESS, encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]));
    });
  }

  text(fileId: string): Y.Text {
    return this.doc.getText(`file:${fileId}`);
  }

  connect(): void {
    if (this.destroyed) return;
    this.events.onStatus('connecting');
    const channel = new ClientChannel(this.projectId);
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.channel = channel;
    this.sent = 0;
    this.confirmed = false;
    ws.onopen = () => ws.send(channel.hello());
    ws.onmessage = (ev: MessageEvent<string | ArrayBuffer>) => {
      const data = ev.data;
      this.queue = this.queue.then(() => this.handle(ws, channel, data)).catch((e: unknown) => {
        if (e instanceof IntegrityFailure) {
          // Una trama que no supera Poly1305/GCM no se aplica nunca: se corta y se reintenta.
          this.events.onError('integrity', 'Se ha rechazado un mensaje que no superó la verificación criptográfica.');
          ws.close(4400, 'integrity');
        }
      });
    };
    ws.onclose = (ev) => this.onClose(ev.code);
  }

  /** Ctrl+S: pide al servidor que guarde ya, sin esperar al temporizador. */
  flush(): void {
    if (this.isOpen()) this.send(MSG.FLUSH, new Uint8Array());
  }

  destroy(): void {
    this.destroyed = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.ws?.close(1000, 'bye');
    this.channel?.destroy();
    this.awareness.destroy();
    this.doc.destroy();
  }

  private isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.channel?.ready === true && this.confirmed;
  }

  private send(type: number, payload: Uint8Array): void {
    if (this.confirmed) this.sendRaw(type, payload);
  }

  /** Pedir el estado (SYNC1) y anunciar presencia no comparten historia: se pueden enviar antes de la época. */
  private sendRaw(type: number, payload: Uint8Array): void {
    if (this.ws && this.channel) this.ws.send(this.channel.encrypt(encode(type, payload)));
  }

  private async handle(ws: WebSocket, channel: ClientChannel, data: string | ArrayBuffer): Promise<void> {
    if (typeof data === 'string') {
      const msg = JSON.parse(data) as { t?: string; epk?: string; readOnly?: boolean; code?: string };
      if (msg.t === 'welcome' && msg.epk) {
        await channel.accept(msg.epk);
        this.events.onAccess(msg.readOnly === true);
      } else if (msg.t === 'error' && msg.code === 'integrity_violation') {
        this.events.onStatus('integrity');
      }
      return;
    }
    const frame = new Uint8Array(data);
    if (!channel.ready) {
      ws.send(channel.acceptKeyFrame(frame));
      this.retries = 0;
      this.sendRaw(MSG.SYNC1, Y.encodeStateVector(this.doc));
      const local = this.awareness.getLocalState();
      if (local) this.sendRaw(MSG.AWARENESS, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
      return;
    }
    const message = channel.decrypt(frame);
    const type = message[0];
    const payload = message.subarray(1);
    if (type === MSG.ROOM) {
      const { epoch } = readJson<{ epoch: string }>(payload);
      if (this.epoch !== null && this.epoch !== epoch) {
        this.destroyed = true;
        ws.close(1000, 'reset');
        this.events.onReset();
        return;
      }
      this.epoch = epoch;
      this.confirmed = true;
      return;
    }
    if (!this.confirmed) return;
    switch (type) {
      case MSG.SYNC1: {
        // Lo que tengamos y el servidor no (ediciones sin conexión) se envía ahora.
        const diff = Y.encodeStateAsUpdate(this.doc, payload);
        if (diff.length > 2) this.sent += 1;
        this.send(MSG.SYNC2, diff);
        return;
      }
      case MSG.SYNC2:
        Y.applyUpdate(this.doc, payload, 'remote');
        if (!this.synced) {
          this.synced = true;
          this.events.onSynced();
        }
        this.events.onStatus('synced');
        if (this.sent === 0) this.events.onPending(false);
        return;
      case MSG.UPDATE:
        Y.applyUpdate(this.doc, payload, 'remote');
        return;
      case MSG.AWARENESS:
        applyAwarenessUpdate(this.awareness, payload, 'remote');
        return;
      case MSG.SAVED: {
        const { ack, pending } = readJson<{ ack: number; pending: number }>(payload);
        if (ack >= this.sent && pending === 0) this.events.onPending(false);
        return;
      }
      case MSG.TREE:
        this.events.onTree();
        return;
      case MSG.ACCESS:
        this.events.onAccess(readJson<{ readOnly: boolean }>(payload).readOnly);
        return;
      case MSG.ERROR: {
        const { code, message: text } = readJson<{ code: string; message: string }>(payload);
        this.events.onError(code, text);
        return;
      }
      default:
    }
  }

  private onClose(code: number): void {
    this.channel?.destroy();
    this.channel = null;
    this.ws = null;
    if (this.destroyed) return;
    // Los demás ven desaparecer nuestro cursor; al reconectar se vuelve a anunciar.
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    removeAwarenessStates(this.awareness, others, 'remote');
    if (code === 4401) return this.events.onStatus('unauthenticated');
    if (code === 4403 || code === 4404) return this.events.onStatus('denied');
    if (code === 4409) return this.events.onStatus('integrity');
    this.events.onStatus('offline');
    const delay = Math.min(10_000, 500 * 2 ** this.retries);
    this.retries += 1;
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }
}

/** El servicio de colaboración escucha en el mismo host que la página, en su propio puerto. */
export function collabUrl(projectId: string, port: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.hostname}:${port}/api/v1/collab/${projectId}`;
}
