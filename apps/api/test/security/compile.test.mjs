// Compilación real en el sandbox: casos de abuso (AGENTS.md §3.3, test/security/compile).
// Amenazas: T-C01 (\write18), T-C02 (lectura fuera del proyecto), T-C04 (DoS por
// bucle infinito o salida enorme), T-P07 (acceso cruzado) y RS-076 (firma C4b).
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

/** POST /compile, abre el sobre C1 + C2 y separa la cabecera del PDF. */
async function compile(client, projectId) {
  const keys = replyKeys();
  const res = await client.post(`/projects/${projectId}/compile`, {}, { headers: { 'X-SecurTex-Reply-Key': keys.header } });
  if (res.status !== 200) return { status: res.status, body: res.body };
  const frame = openBytes(res.body.envelope, keys, context(projectId, 'compile:pdf'));
  const length = frame.readUInt32BE(0);
  const header = JSON.parse(frame.toString('utf8', 4, 4 + length));
  return { status: 200, header, pdf: frame.subarray(4 + length) };
}

async function signatureValid(header, pdf) {
  if (!header.signature) return false;
  const pdfSha = createHash('sha256').update(pdf).digest();
  if (!pdfSha.equals(Buffer.from(header.signature.pdfSha256, 'base64url'))) return false;
  const message = Buffer.concat([pdfSha, Buffer.from(header.compilationId.replace(/-/g, ''), 'hex'), Buffer.from(header.signature.sourceTreeHash, 'base64url')]);
  return verify(null, message, await signingKey(), Buffer.from(header.signature.value, 'base64url'));
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
