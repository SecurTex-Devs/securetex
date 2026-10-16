// Compilación real en el sandbox: casos de abuso (AGENTS.md §3.3, test/security/compile).
// Amenazas: T-C01 (\write18), T-C02 (lectura fuera del proyecto), T-C04 (DoS por
// bucle infinito o salida enorme), T-P07 (acceso cruzado), RS-076 (firma C4b)
// y el mapa SyncTeX (rutas del sandbox, mapa falsificado desde el documento).
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { before, describe, it } from 'node:test';
import { API } from './helpers.mjs';
import { context, openBytes, replyKeys, seal } from './crypto-client.mjs';
import { verifiedUser } from './helpers.mjs';

const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
let artifactKey = null;
async function signingKey() {
  if (!artifactKey) {
    const { key } = await (await fetch(`${API}/api/v1/crypto/artifact-key`)).json();
    artifactKey = createPublicKey({ key: Buffer.concat([ED25519_SPKI, Buffer.from(key, 'base64url')]), format: 'der', type: 'spki' });
  }
  return artifactKey;
}

/** POST /compile, abre el sobre C1 + C2 y separa la cabecera, el PDF y el mapa SyncTeX (trama v2). */
async function compile(client, projectId) {
  const keys = replyKeys();
  const res = await client.post(`/projects/${projectId}/compile`, {}, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
  if (res.status !== 200) return { status: res.status, body: res.body };
  const frame = openBytes(res.body.envelope, keys, context(projectId, 'compile:pdf'));
  const length = frame.readUInt32BE(0);
  const header = JSON.parse(frame.toString('utf8', 4, 4 + length));
  const body = frame.subarray(4 + length);
  // Las longitudes declaradas delimitan cada parte y suman exactamente el resto.
  assert.equal(header.v, 2);
  assert.equal(header.pdfBytes + header.synctexBytes, body.length);
  return { status: 200, header, pdf: body.subarray(0, header.pdfBytes), synctex: body.subarray(header.pdfBytes) };
}

async function signatureValid(header, pdf) {
  if (!header.signature) return false;
  const pdfSha = createHash('sha256').update(pdf).digest();
  if (!pdfSha.equals(Buffer.from(header.signature.pdfSha256, 'base64url'))) return false;
  const message = Buffer.concat([pdfSha, Buffer.from(header.compilationId.replace(/-/g, ''), 'hex'), Buffer.from(header.signature.sourceTreeHash, 'base64url')]);
  return verify(null, message, await signingKey(), Buffer.from(header.signature.value, 'base64url'));
}

/** Ed25519("securtex:c4b:synctex:v1" ‖ SHA-256(mapa) ‖ compilationId ‖ SHA-256(pdf)). */
async function synctexValid(header, map, pdf) {
  if (!header.synctex) return false;
  const digest = createHash('sha256').update(map).digest();
  if (!digest.equals(Buffer.from(header.synctex.sha256, 'base64url'))) return false;
  const message = Buffer.concat([
    Buffer.from('securtex:c4b:synctex:v1'), digest, Buffer.from(header.compilationId.replace(/-/g, ''), 'hex'), createHash('sha256').update(pdf).digest(),
  ]);
  return verify(null, message, await signingKey(), Buffer.from(header.synctex.value, 'base64url'));
}

describe('Compilación real en el sandbox', () => {
  let owner, viewer, stranger, projectId, mainId;

  /** Sustituye el documento principal (concurrencia optimista: con la versión actual). */
  const setMain = async (content) => {
    const files = await owner.client.get(`/projects/${projectId}/files`);
    const main = files.body.find((f) => f.id === mainId);
    const res = await owner.client.put(`/projects/${projectId}/files/${mainId}/content`, { envelope: await seal(content, context(projectId, `file:${mainId}:write`)), baseVersion: main.version });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  };

  before(async () => {
    [owner, viewer, stranger] = await Promise.all([verifiedUser('compiladora'), verifiedUser('lectora-pdf'), verifiedUser('ajeno-pdf')]);
    projectId = (await owner.client.post('/projects', { name: 'Sandbox', template: 'blank' })).body.id;
    mainId = (await owner.client.get(`/projects/${projectId}/files`)).body.find((f) => f.path === 'main.tex').id;
    const inv = await owner.client.post(`/projects/${projectId}/invitations`, { email: viewer.email, role: 'viewer' });
    assert.equal(inv.status, 201);
    const invitation = (await viewer.client.get('/invitations')).body.find((i) => i.project.id === projectId);
    assert.equal((await viewer.client.post(`/invitations/${invitation.id}/accept`)).status, 200);
  });

  it('las cinco plantillas compilan a un PDF real con firma Ed25519 válida', async () => {
    // Otra persona (y otra IP): el límite de 12 compilaciones por minuto es por cliente.
    const author = await verifiedUser('plantillas');
    for (const template of ['blank', 'tesis-uta', 'articulo', 'informe-lab', 'presentacion']) {
      const id = (await author.client.post('/projects', { name: `Plantilla ${template}`, template })).body.id;
      const out = await compile(author.client, id);
      assert.equal(out.status, 200, `${template}: ${JSON.stringify(out.body)}`);
      assert.equal(out.header.status, 'success', `${template}: ${out.header.status}\n${out.header.diagnostics.map((d) => d.message).join('\n')}`);
      assert.equal(out.pdf.subarray(0, 5).toString('latin1'), '%PDF-');
      assert.equal(out.pdf.length, out.header.pdfBytes);
      assert.ok(await signatureValid(out.header, out.pdf), `${template}: firma`);
    }
  });

  it('un PDF manipulado ya no verifica la firma', async () => {
    const out = await compile(owner.client, projectId);
    assert.equal(out.status, 200);
    const tampered = Buffer.from(out.pdf);
    tampered[tampered.length >> 1] ^= 0x01;
    assert.equal(await signatureValid(out.header, tampered), false);
    assert.equal(await signatureValid({ ...out.header, compilationId: '00000000-0000-4000-8000-000000000000' }, out.pdf), false);
  });

  it('el registro llega saneado: sin rutas absolutas del contenedor', async () => {
    const out = await compile(owner.client, projectId);
    assert.ok(out.header.log.includes('Output written on output.pdf'));
    assert.doesNotMatch(out.header.log, /\/usr\/share|\/work\/|\/jobs\/|\/var\/lib/);
  });

  it('un lector puede compilar; un ajeno recibe 404; sin clave efímera, 400', async () => {
    assert.equal((await compile(viewer.client, projectId)).status, 200);
    assert.equal((await compile(stranger.client, projectId)).status, 404);
    assert.equal((await owner.client.post(`/projects/${projectId}/compile`, {})).status, 400);
  });

  it('\\write18 explícito: el análisis lo bloquea (422) y no llega al sandbox', async () => {
    await setMain('\\documentclass{article}\\begin{document}\\immediate\\write18{echo hola}\\end{document}');
    const out = await compile(owner.client, projectId);
    assert.equal(out.status, 422);
    assert.equal(out.body.code, 'compile_blocked');
    assert.ok(out.body.findings.some((f) => f.rule === 'shell-escape'));
  });

  it('\\write18 ofuscado que esquiva el análisis: el sandbox no ejecuta nada (-no-shell-escape)', async () => {
    await setMain([
      '\\documentclass{article}',
      '\\begin{document}',
      '\\csname immediate\\endcsname\\csname write\\endcsname18{echo SECURTEX > hecho.tex}',
      '\\IfFileExists{hecho.tex}{EJECUTADO}{NO EJECUTADO}',
      '\\end{document}',
    ].join('\n'));
    const out = await compile(owner.client, projectId);
    assert.equal(out.status, 200);
    assert.match(out.header.log, /runsystem\(echo SECURTEX > hecho\.tex\)\.\.\.disabled/);
  });

  it('\\input{/etc/passwd}: bloqueado por el análisis y, si se esquiva, por openin_any=p', async () => {
    await setMain('\\documentclass{article}\\begin{document}\\input{/etc/passwd}\\end{document}');
    const direct = await compile(owner.client, projectId);
    assert.equal(direct.status, 422);
    assert.ok(direct.body.findings.some((f) => f.rule === 'read-outside'));

    await setMain('\\documentclass{article}\\def\\p{/etc/passwd}\\def\\q{../../../../etc/passwd}\\begin{document}\\input{\\q}\\input{\\p}\\end{document}');
    const hidden = await compile(owner.client, projectId);
    assert.equal(hidden.status, 200);
    assert.equal(hidden.header.status, 'failed');
    assert.equal(hidden.pdf.length, 0);
    assert.doesNotMatch(hidden.header.log, /root:x:0:0/);
  });

  it('bucle infinito: el sandbox lo mata al vencer el plazo de 30 s', { timeout: 90_000 }, async () => {
    await setMain('\\documentclass{article}\\begin{document}\\def\\x{\\x}\\x\\end{document}');
    const started = Date.now();
    const out = await compile(owner.client, projectId);
    assert.equal(out.status, 200);
    assert.equal(out.header.status, 'timeout');
    assert.equal(out.pdf.length, 0);
    assert.equal(out.header.signature, null);
    assert.ok(Date.now() - started < 50_000);
  });

  it('PDF enorme: el sandbox corta la escritura y no se entrega nada', { timeout: 90_000 }, async () => {
    await setMain([
      '\\documentclass{article}',
      '\\pdfcompresslevel=0 \\pdfobjcompresslevel=0',
      '\\def\\t{Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor. }',
      '\\def\\p{\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t}',
      '\\newcount\\n',
      '\\begin{document}\\tiny',
      '\\loop \\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\p\\par \\advance\\n by 1 \\ifnum\\n<200000 \\repeat',
      '\\end{document}',
    ].join('\n'));
    const out = await compile(owner.client, projectId);
    assert.equal(out.status, 200);
    assert.equal(out.header.status, 'too_large');
    assert.equal(out.pdf.length, 0);
    assert.equal(out.header.signature, null);
  });
});

describe('SyncTeX del PDF real', () => {
  // Persona y proyecto propios: el límite de 12 compilaciones por minuto es por cliente.
  let author, projectId, mainId;

  const setMain = async (content) => {
    const files = await author.client.get(`/projects/${projectId}/files`);
    const main = files.body.find((f) => f.id === mainId);
    const res = await author.client.put(`/projects/${projectId}/files/${mainId}/content`, { envelope: await seal(content, context(projectId, `file:${mainId}:write`)), baseVersion: main.version });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  };

  before(async () => {
    author = await verifiedUser('synctex');
    projectId = (await author.client.post('/projects', { name: 'SyncTeX', template: 'blank' })).body.id;
    mainId = (await author.client.get(`/projects/${projectId}/files`)).body.find((f) => f.path === 'main.tex').id;
    const created = await author.client.post(`/projects/${projectId}/files`, { path: 'cap/intro.tex', envelope: await seal('Texto de la introducción.\n\nOtro párrafo de la introducción.\n', context(projectId, 'file:create')) });
    assert.equal(created.status, 201, JSON.stringify(created.body));
  });

  it('el mapa solo nombra archivos del proyecto, sin rutas del sandbox, y lleva firma Ed25519 propia', async () => {
    await setMain('\\documentclass{article}\n\\begin{document}\nPrimer párrafo del documento.\n\n\\input{cap/intro}\n\\end{document}\n');
    const out = await compile(author.client, projectId);
    assert.equal(out.status, 200);
    assert.equal(out.header.status, 'success');
    assert.ok(out.header.synctexBytes > 0 && out.header.synctexBytes <= 4 * 1024 * 1024);
    const raw = out.synctex.toString('utf8');
    // Ni el directorio del trabajo, ni el árbol de TeX Live, ni el volumen de trabajos.
    assert.doesNotMatch(raw, /\/work|\/usr|\/jobs|\/var|\/etc|\.\.\/|article\.cls|output\.aux/);
    const map = JSON.parse(raw);
    assert.equal(map.v, 1);
    assert.deepEqual([...map.files].sort(), ['cap/intro.tex', 'main.tex']);
    const numbers = map.pages.flatMap((p) => [...p.b, ...p.r]);
    assert.ok(numbers.length > 0 && numbers.every(Number.isSafeInteger));
    // Cada archivo se puede localizar: el principal en su línea 3 y el capítulo en su línea 1.
    const runsOf = (file, line) => map.pages.flatMap((p) => Array.from({ length: p.r.length / 5 }, (_, i) => p.r.slice(i * 5, i * 5 + 5))).filter(([f, l]) => map.files[f] === file && l === line);
    assert.ok(runsOf('main.tex', 3).length > 0);
    assert.ok(runsOf('cap/intro.tex', 1).length > 0);

    assert.ok(await synctexValid(out.header, out.synctex, out.pdf));
    const tampered = Buffer.from(raw.replace('"cap/intro.tex"', '"cap/otro0.tex"'));
    assert.equal(await synctexValid(out.header, tampered, out.pdf), false);
    // La firma del mapa no vale como firma del PDF (separación de dominio).
    assert.equal(await signatureValid({ ...out.header, signature: { ...out.header.signature, value: out.header.synctex.value } }, out.pdf), false);

    // El mapa está atado a su PDF y a su compilación: no se puede pegar a otro.
    await setMain('\\documentclass{article}\n\\begin{document}\nOtro documento distinto.\n\\end{document}\n');
    const other = await compile(author.client, projectId);
    assert.equal(other.status, 200);
    assert.ok(!other.pdf.equals(out.pdf));
    assert.equal(await synctexValid(out.header, out.synctex, other.pdf), false);
    assert.equal(await synctexValid({ ...out.header, compilationId: other.header.compilationId }, out.synctex, out.pdf), false);
  });

  it('SyncTeX falsificado desde el documento (\\synctex=0 y un output.synctex.gz propio): sin mapa, el PDF sí llega', async () => {
    // \openout ofuscado para esquivar el análisis: lo que importa es lo que hace el sandbox.
    // TeX no puede escribir el byte 0x1f de la cabecera gzip (sale como ^^_), así que
    // el archivo nunca descomprime; aunque lo hiciera, la API valida el mapa resultante.
    await setMain([
      '\\documentclass{article}',
      '\\synctex=0',
      '\\csname newwrite\\endcsname\\falso',
      '\\csname immediate\\endcsname\\csname openout\\endcsname\\falso=output.synctex.gz',
      '\\csname immediate\\endcsname\\write\\falso{SyncTeX Version:1^^JInput:1:/etc/passwd^^JContent:^^J{1^^J(1,1:0,0:99999999999,1,1^^J}1}',
      '\\csname immediate\\endcsname\\csname closeout\\endcsname\\falso',
      '\\begin{document}Hola.\\end{document}',
    ].join('\n'));
    const out = await compile(author.client, projectId);
    assert.equal(out.status, 200);
    assert.equal(out.header.status, 'success', out.header.log.slice(-2000));
    assert.ok(await signatureValid(out.header, out.pdf));
    assert.equal(out.header.synctexBytes, 0);
    assert.equal(out.header.synctex, null);
    assert.equal(out.synctex.length, 0);
  });

  it('sin PDF no hay mapa SyncTeX', async () => {
    await setMain('\\documentclass{article}\\begin{document}\\undefinedmacro');
    const out = await compile(author.client, projectId);
    assert.equal(out.status, 200);
    assert.equal(out.pdf.length, 0);
    assert.equal(out.header.synctex, null);
    assert.equal(out.synctex.length, 0);
  });
});
