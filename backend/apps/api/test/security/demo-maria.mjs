// Demostración manual (no es una prueba): María, editora, se conecta a la tesis
// por el canal cifrado, anuncia su cursor y escribe una línea.
//   SEED_DEMO_PASSWORD=... node test/security/demo-maria.mjs <projectId>
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { connectCollab } from './crypto-client.mjs';
import { Client } from './helpers.mjs';

const MSG = { SYNC1: 1, SYNC2: 2, UPDATE: 3, AWARENESS: 4 };
const projectId = process.argv[2];
const c = new Client();
const login = await c.post('/auth/login', { email: 'maria.rodriguez@securtex.test', password: process.env.SEED_DEMO_PASSWORD });
if (login.status !== 200) throw new Error(`login ${login.status}`);
const main = (await c.get(`/projects/${projectId}/files`)).body.find((f) => f.path === 'main.tex');
const conn = await connectCollab(c, projectId);
const doc = new Y.Doc();
conn.send(MSG.SYNC1, Y.encodeStateVector(doc));
Y.applyUpdate(doc, (await conn.next(MSG.SYNC2)).payload, 'remote');
doc.on('update', (u, origin) => { if (origin !== 'remote') conn.send(MSG.UPDATE, u); });
const awareness = new Awareness(doc);
const text = doc.getText(`file:${main.id}`);
const announce = () => conn.send(MSG.AWARENESS, encodeAwarenessUpdate(awareness, [doc.clientID]));
awareness.setLocalState({ user: { name: 'quien sea', color: '#000' }, file: 'main.tex' });
announce();
const line = '% María escribe aquí en tiempo real\n';
for (const ch of line) {
  text.insert(text.toString().indexOf('\\usepackage[utf8]') >= 0 ? text.toString().indexOf('\\usepackage[utf8]') : 0, ch);
  await new Promise((r) => setTimeout(r, 60));
}
console.log('María escribió; se queda conectada 90 s');
setTimeout(() => { conn.ws.close(); process.exit(0); }, 90_000);
