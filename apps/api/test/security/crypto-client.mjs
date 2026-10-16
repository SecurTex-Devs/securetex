// Cliente de referencia de las capas C1 + C2 en Node, para las pruebas.
// Debe coincidir byte a byte con src/infrastructure/security/transport.ts y
// con el cliente del navegador (securtex-frontend · src/shared/crypto).
import { createCipheriv, createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { API, ORIGIN } from './helpers.mjs';

const SPKI = Buffer.from('302a300506032b656e032100', 'hex');
const toKey = (raw) => createPublicKey({ key: Buffer.concat([SPKI, raw]), format: 'der', type: 'spki' });
const rawOf = (pub) => pub.export({ format: 'der', type: 'spki' }).subarray(SPKI.length);
const b64 = (b) => Buffer.from(b).toString('base64url');
const hkdf = (ikm, salt, info, len) => Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf8'), len));

function chacha(key, nonce, plain, aad) {
  const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  c.setAAD(aad, { plaintextLength: plain.length });
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}
function unchacha(key, nonce, sealed, aad) {
  const d = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  d.setAAD(aad, { plaintextLength: sealed.length - 16 });
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
}
function gcm(key, plain, aad) {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(aad);
  return Buffer.concat([nonce, c.update(plain), c.final(), c.getAuthTag()]);
}
function ungcm(key, block, aad) {
  const d = createDecipheriv('aes-256-gcm', key, block.subarray(0, 12));
  d.setAAD(aad);
  d.setAuthTag(block.subarray(block.length - 16));
  return Buffer.concat([d.update(block.subarray(12, block.length - 16)), d.final()]);
}

export const context = (projectId, purpose) => `securtex:c2:v1:${projectId}:${purpose}`;

let serverKey = null;
export async function transportKey() {
  if (!serverKey) serverKey = Buffer.from((await (await fetch(`${API}/api/v1/crypto/transport-key`)).json()).key, 'base64url');
  return serverKey;
}

/** Sella un texto para el servicio (C1 dentro de C2). */
export async function seal(text, ctx) {
  const server = await transportKey();
  const { privateKey, publicKey } = generateKeyPairSync('x25519');
  const epk = rawOf(publicKey);
  const wrap = hkdf(diffieHellman({ privateKey, publicKey: toKey(server) }), Buffer.concat([epk, server]), ctx, 32);
  const dek = randomBytes(32);
  const aad = Buffer.from(ctx, 'utf8');
  const n1 = randomBytes(12);
  const n2 = randomBytes(12);
  return { v: 1, epk: b64(epk), n1: b64(n1), wdek: b64(chacha(wrap, n1, dek, aad)), n2: b64(n2), body: b64(chacha(wrap, n2, gcm(dek, Buffer.from(text, 'utf8'), aad), aad)) };
}

/** Par efímero para recibir una respuesta sellada. */
export function replyKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('x25519');
  return { privateKey, header: b64(rawOf(publicKey)), raw: rawOf(publicKey) };
}

/** Abre un sobre del servicio y devuelve los bytes (p. ej. la trama binaria de una compilación). */
export function openBytes(envelope, keys, ctx) {
  const epk = Buffer.from(envelope.epk, 'base64url');
  const wrap = hkdf(diffieHellman({ privateKey: keys.privateKey, publicKey: toKey(epk) }), Buffer.concat([epk, keys.raw]), ctx, 32);
  const aad = Buffer.from(ctx, 'utf8');
  const dek = unchacha(wrap, Buffer.from(envelope.n1, 'base64url'), Buffer.from(envelope.wdek, 'base64url'), aad);
  const block = unchacha(wrap, Buffer.from(envelope.n2, 'base64url'), Buffer.from(envelope.body, 'base64url'), aad);
  return ungcm(dek, block, aad);
}

export function open(envelope, keys, ctx) {
  return openBytes(envelope, keys, ctx).toString('utf8');
}

/**
 * Conexión de colaboración con el canal C2 por conexión (DH efímero-efímero
 * + efímero-estático) y bloques C1 dentro. Devuelve los mensajes descifrados.
 */
export function connectCollab(client, projectId, { origin = ORIGIN } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/api/v1/collab/${projectId}`, { headers: { Origin: origin, Cookie: client.cookieHeader() } });
    const { privateKey, publicKey } = generateKeyPairSync('x25519');
    const cepk = rawOf(publicKey);
    const state = { ws, messages: [], closed: null, readOnly: null, send: null, waiters: [] };
    let sendKey, recvKey, sendDek, recvDek;
    let sendCtr = 0n;
    let recvCtr = 0n;
    const aadC2 = (dir) => Buffer.from(`securtex:c2:ws:v1:${projectId}:${dir}`, 'utf8');
    const frame = (inner) => {
      const h = Buffer.alloc(8);
      h.writeBigUInt64BE(sendCtr);
      const out = Buffer.concat([h, chacha(sendKey, Buffer.concat([Buffer.alloc(4), h]), inner, aadC2('c2s'))]);
      sendCtr += 1n;
      return out;
    };
    const unframe = (buf) => {
      if (buf.readBigUInt64BE(0) !== recvCtr) throw new Error('replay');
      const plain = unchacha(recvKey, Buffer.concat([Buffer.alloc(4), buf.subarray(0, 8)]), buf.subarray(8), aadC2('s2c'));
      recvCtr += 1n;
      return plain;
    };
    state.send = (type, payload) => {
      const msg = Buffer.concat([Buffer.from([type]), Buffer.from(payload)]);
      const aad = Buffer.from(`securtex:c1:ws:v1:${projectId}:c2s:${sendCtr}`, 'utf8');
      ws.send(frame(gcm(sendDek, msg, aad)));
    };
    state.sendRaw = (buf) => ws.send(buf);
    state.next = (type, timeout = 4000) => new Promise((res, rej) => {
      const idx = state.messages.findIndex((m) => m.type === type);
      if (idx >= 0) return res(state.messages.splice(idx, 1)[0]);
      const t = setTimeout(() => rej(new Error(`sin mensaje ${type}`)), timeout);
      state.waiters.push({ type, res: (m) => { clearTimeout(t); res(m); } });
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, epk: b64(cepk) })));
    ws.on('message', (data, isBinary) => {
      const buf = Buffer.from(data);
      if (!isBinary) {
        const msg = JSON.parse(buf.toString('utf8'));
        if (msg.t === 'welcome') {
          const sepk = Buffer.from(msg.epk, 'base64url');
          const ee = diffieHellman({ privateKey, publicKey: toKey(sepk) });
          state.readOnly = msg.readOnly;
          transportKey().then((server) => {
            const se = diffieHellman({ privateKey, publicKey: toKey(server) });
            const keys = hkdf(Buffer.concat([ee, se]), Buffer.concat([cepk, sepk]), `securtex:c2:ws:v1:${projectId}`, 64);
            sendKey = keys.subarray(0, 32);
            recvKey = keys.subarray(32, 64);
          });
        } else if (msg.t === 'error') {
          state.error = msg.code;
        }
        return;
      }
      const waitKeys = () => (recvKey ? Promise.resolve() : new Promise((r) => setTimeout(r, 20)).then(waitKeys));
      void waitKeys().then(() => {
        if (!recvDek) {
          recvDek = unframe(buf);
          sendDek = randomBytes(32);
          ws.send(frame(sendDek));
          resolve(state);
          return;
        }
        const ctr = recvCtr;
        const inner = unframe(buf);
        const msg = ungcm(recvDek, inner, Buffer.from(`securtex:c1:ws:v1:${projectId}:s2c:${ctr}`, 'utf8'));
        const m = { type: msg[0], payload: msg.subarray(1) };
        const w = state.waiters.findIndex((x) => x.type === m.type);
        if (w >= 0) state.waiters.splice(w, 1)[0].res(m);
        else state.messages.push(m);
      });
    });
    ws.on('close', (code, reason) => {
      state.closed = { code, reason: reason.toString() };
      resolve(state);
    });
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on('error', (e) => reject(e));
  });
}

export const waitClose = (state, timeout = 15000) => new Promise((res, rej) => {
  if (state.closed) return res(state.closed);
  const t = setTimeout(() => rej(new Error('no se cerró')), timeout);
  state.ws.on('close', (code, reason) => { clearTimeout(t); res({ code, reason: reason.toString() }); });
});
