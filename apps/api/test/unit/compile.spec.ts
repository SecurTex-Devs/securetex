import { createHash, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, verify } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCompileLog, pdfRejection, sanitizeCompileLog } from '../../src/domain/compile';
import { COMPILE } from '../../src/domain/constants';

const pdfOf = (body: string) => Buffer.from(`%PDF-1.5\n${body.padEnd(80, ' ')}\n%%EOF\n`, 'latin1');

describe('Validación del PDF del sandbox', () => {
  it('acepta un PDF con firma y marca de fin', () => {
    expect(pdfRejection(pdfOf('1 0 obj << >> endobj'))).toBeNull();
  });

  it.each([
    ['vacío', Buffer.alloc(0), 'empty'],
    ['HTML disfrazado', Buffer.from(`<html><script>alert(1)</script>${' '.repeat(80)}%%EOF`), 'not_pdf'],
    ['versión inexistente', Buffer.from(`%PDF-9.9${' '.repeat(80)}%%EOF`), 'not_pdf'],
    ['truncado (sin %%EOF)', Buffer.from(`%PDF-1.7\n${'x'.repeat(4000)}`), 'truncated'],
  ])('rechaza un PDF %s', (_caso, buf, motivo) => {
    expect(pdfRejection(buf)).toBe(motivo);
  });

  it('rechaza lo que supera el tamaño máximo aunque sea un PDF válido', () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.5\n'), Buffer.alloc(COMPILE.MAX_PDF_BYTES), Buffer.from('\n%%EOF\n')]);
    expect(pdfRejection(big)).toBe('too_large');
  });
});

describe('Saneado del registro de compilación', () => {
  it('quita las rutas absolutas del contenedor y deja el nombre del archivo', () => {
    const raw = '(/usr/share/texlive/texmf-dist/tex/latex/base/article.cls\n</usr/share/texmf/fonts/type1/public/lm/lmr10.pfb>\n/work/0b1c/src/main.tex:3: Undefined control sequence.';
    const clean = sanitizeCompileLog(raw);
    expect(clean).not.toMatch(/\/usr\/|\/work\//);
    expect(clean).toContain('(article.cls');
    expect(clean).toContain('<lmr10.pfb>');
    expect(clean).toContain('main.tex:3: Undefined control sequence.');
  });

  it('respeta las rutas relativas del proyecto y las URL', () => {
    const raw = '(./capitulos/introduccion.tex) https://securtex.app/ayuda/latex';
    expect(sanitizeCompileLog(raw)).toBe(raw);
  });

  it('elimina caracteres de control y normaliza los saltos de línea', () => {
    expect(sanitizeCompileLog('a\r\nb\u0007\u001b[31mc\td')).toBe('a\nb[31mc\td');
  });

  it('acota el tamaño conservando el principio y el final', () => {
    const clean = sanitizeCompileLog(`INICIO${'x'.repeat(COMPILE.MAX_LOG_CHARS * 2)}FIN`);
    expect(clean.length).toBeLessThan(COMPILE.MAX_LOG_CHARS + 100);
    expect(clean.startsWith('INICIO')).toBe(true);
    expect(clean.endsWith('FIN')).toBe(true);
  });
});

describe('Diagnósticos del registro real', () => {
  it('extrae errores con archivo y línea, avisos y cajas desbordadas', () => {
    const log = [
      './capitulos/metodologia.tex:12: Undefined control sequence.',
      '! Emergency stop.',
      "LaTeX Warning: Reference `fig:x' on page 1 undefined on input line 7.",
      'Overfull \\hbox (3.2pt too wide) in paragraph at lines 20--21',
      './capitulos/metodologia.tex:12: Undefined control sequence.',
    ].join('\n');
    expect(parseCompileLog(log)).toEqual([
      { level: 'error', file: 'capitulos/metodologia.tex', line: 12, message: 'Undefined control sequence.' },
      { level: 'error', file: null, line: null, message: 'Emergency stop.' },
      { level: 'warning', file: null, line: 7, message: "Reference `fig:x' on page 1 undefined" },
      { level: 'typesetting', file: null, line: 20, message: 'Overfull \\hbox (3.2pt too wide)' },
    ]);
  });

  it('no devuelve más diagnósticos que el máximo', () => {
    const log = Array.from({ length: COMPILE.MAX_DIAGNOSTICS + 50 }, (_, i) => `./main.tex:${i + 1}: Error ${i}.`).join('\n');
    expect(parseCompileLog(log)).toHaveLength(COMPILE.MAX_DIAGNOSTICS);
  });
});

describe('Firma Ed25519 de los artefactos (C4b)', () => {
  let signer: import('../../src/infrastructure/security/artifact-signer').ArtifactSigner;
  const tree = { engine: 'pdflatex', mainFile: 'main.tex', files: [{ path: 'main.tex', content: '\\documentclass{article}' }, { path: 'a.bib', content: '' }] };

  beforeAll(async () => {
    Object.assign(process.env, {
      APP_ORIGIN: 'http://localhost:3000',
      DATABASE_URL_IDENTITY: 'postgresql://u:p@localhost/db',
      DATABASE_URL_APP: 'postgresql://u:p@localhost/db',
      DATABASE_URL_AUDIT: 'postgresql://u:p@localhost/db',
      JWT_PRIVATE_KEY: 'x'.repeat(48),
      MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      TRANSPORT_PRIVATE_KEY: generateKeyPairSync('x25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      DATA_MASTER_KEY: randomBytes(32).toString('base64'),
      FILES_MASTER_KEY: randomBytes(32).toString('base64'),
      COMPILER_SIGNING_KEY: generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    });
    const { ArtifactSigner } = await import('../../src/infrastructure/security/artifact-signer');
    signer = new ArtifactSigner();
  });

  const publicKey = () => createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), signer.publicKeyRaw]), format: 'der', type: 'spki' });
  const message = (pdf: Buffer, id: string, treeHash: Buffer) => Buffer.concat([createHash('sha256').update(pdf).digest(), Buffer.from(id.replace(/-/g, ''), 'hex'), treeHash]);

  it('firma SHA-256(pdf) ‖ compilationId ‖ sourceTreeHash y verifica con la clave pública', () => {
    const pdf = pdfOf('contenido');
    const id = randomUUID();
    const treeHash = signer.sourceTreeHash(tree);
    const { signature, pdfSha256 } = signer.sign(pdf, id, treeHash);
    expect(pdfSha256.equals(createHash('sha256').update(pdf).digest())).toBe(true);
    expect(verify(null, message(pdf, id, treeHash), publicKey(), signature)).toBe(true);
  });

  it.each([
    ['un bit del PDF', (pdf: Buffer, id: string, h: Buffer) => { const p = Buffer.from(pdf); p[20] = (p[20] ?? 0) ^ 1; return message(p, id, h); }],
    ['el compilationId', (pdf: Buffer, _id: string, h: Buffer) => message(pdf, randomUUID(), h)],
    ['el árbol de fuentes', (pdf: Buffer, id: string) => message(pdf, id, Buffer.alloc(32))],
  ])('la firma deja de verificar si cambia %s', (_parte, tamper) => {
    const pdf = pdfOf('contenido');
    const id = randomUUID();
    const treeHash = signer.sourceTreeHash(tree);
    const { signature } = signer.sign(pdf, id, treeHash);
    expect(verify(null, tamper(pdf, id, treeHash), publicKey(), signature)).toBe(false);
  });

  it('la huella del árbol no depende del orden y sí del contenido, la ruta, el motor y el principal', () => {
    const base = signer.sourceTreeHash(tree);
    expect(signer.sourceTreeHash({ ...tree, files: [...tree.files].reverse() }).equals(base)).toBe(true);
    for (const variant of [
      { ...tree, engine: 'xelatex' },
      { ...tree, mainFile: 'a.bib' },
      { ...tree, files: [{ path: 'main.tex', content: '\\documentclass{book}' }, { path: 'a.bib', content: '' }] },
      { ...tree, files: [{ path: 'main.tex', content: '\\documentclass{article}' }, { path: 'b.bib', content: '' }] },
    ]) expect(signer.sourceTreeHash(variant).equals(base)).toBe(false);
  });

  it('rechaza un compilationId que no es un UUID', () => {
    expect(() => signer.sign(pdfOf('x'), 'no-es-un-uuid', Buffer.alloc(32))).toThrow();
  });
});
