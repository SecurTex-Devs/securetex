import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { IntegrityError, ValidationError } from '../../src/domain/errors';
import { analyzeLatex } from '../../src/domain/latex-analyzer';
import { TEMPLATE_IDS, templateFiles } from '../../src/domain/templates';
import { SafeFilePath } from '../../src/domain/values';

describe('Cifrado de archivos en reposo (C3) con verificación previa (C4)', () => {
  let crypto: import('../../src/infrastructure/security/envelope').FileCrypto;
  const aad = { projectId: '01a14123-9707-7fbe-8b34-94eead66ab5d', fileId: '01a14123-9707-7fbe-8b34-94eead66ab5e', version: 3 };

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
    const { FileCrypto } = await import('../../src/infrastructure/security/envelope');
    crypto = new FileCrypto();
  });

  it('ida y vuelta con la misma AAD', () => {
    const kek = crypto.newProjectKey();
    const text = '\\section{Introducción} ñandú — 100 % 🙂';
    expect(crypto.open(kek, aad, crypto.seal(kek, aad, text))).toBe(text);
  });

  it('nunca guarda el texto plano y cada escritura usa DEK y nonce nuevos', () => {
    const kek = crypto.newProjectKey();
    const a = crypto.seal(kek, aad, 'secreto de la tesis');
    const b = crypto.seal(kek, aad, 'secreto de la tesis');
    expect(Buffer.from(a.ciphertext).includes(Buffer.from('secreto'))).toBe(false);
    expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))).toBe(false);
    expect(Buffer.from(a.wrappedDek).equals(Buffer.from(b.wrappedDek))).toBe(false);
  });

  it.each(['nonce', 'ciphertext', 'mac', 'wrappedDek'] as const)('rechaza un bit alterado en %s', (field) => {
    const kek = crypto.newProjectKey();
    const sealed = crypto.seal(kek, aad, 'contenido íntegro');
    const tampered = Buffer.from(sealed[field]);
    tampered[0] = (tampered[0] ?? 0) ^ 0x01;
    expect(() => crypto.open(kek, aad, { ...sealed, [field]: tampered })).toThrow(IntegrityError);
  });

  it('un archivo copiado a otro proyecto, otro id o una versión anterior no se abre (AAD)', () => {
    const kek = crypto.newProjectKey();
    const sealed = crypto.seal(kek, aad, 'x');
    for (const other of [{ ...aad, version: 2 }, { ...aad, fileId: aad.projectId }, { ...aad, projectId: aad.fileId }]) {
      expect(() => crypto.open(kek, other, sealed)).toThrow(IntegrityError);
    }
  });

  it('la KEK de otro proyecto no abre el archivo (aislamiento entre proyectos)', () => {
    const sealed = crypto.seal(crypto.newProjectKey(), aad, 'x');
    expect(() => crypto.open(crypto.newProjectKey(), aad, sealed)).toThrow(IntegrityError);
  });
});

describe('Rutas de archivo seguras', () => {
  it.each(['main.tex', 'capitulos/intro.tex', 'refs/biblio.bib', 'estilo/uta-tesis.cls', 'a/b/c/d.tex', 'figuras/diagrama.png', 'fotos/portada.jpg'])('acepta %s', (p) => {
    expect(SafeFilePath.of(p).toString()).toBe(p);
  });

  it.each([
    '../secreto.tex', 'capitulos/../../x.tex', '/etc/passwd.tex', 'C:/Windows/x.tex', 'a\\b.tex', '.oculto.tex',
    'capitulos/./x.tex', 'imagen.svg', 'pagina.html', 'script.sh', 'sin-extension', 'a/b/c/d/e.tex', 'con<raro>.tex', 'nul\u0000.tex', '',
  ])('rechaza %j', (p) => {
    expect(() => SafeFilePath.of(p)).toThrow(ValidationError);
  });
});

describe('Análisis de seguridad de LaTeX', () => {
  const run = (content: string) => analyzeLatex([{ path: 'main.tex', content }]);

  it.each([
    ['\\immediate\\write18{rm -rf ~}', 'shell-escape'],
    ['\\input{|"cat /etc/passwd"}', 'shell-escape'],
    ['\\input{/etc/passwd}', 'read-outside'],
    ['\\include{../../otro-proyecto/main}', 'read-outside'],
    ['\\directlua{os.execute("id")}', 'lua-exec'],
    ['\\openin5=secreto', 'raw-io'],
    ['\\read5 to\\linea', 'raw-io'],
    ['\\directlua0{x}', 'lua-exec'],
  ])('bloquea %s', (src, rule) => {
    const [finding] = run(src);
    expect(finding?.rule).toBe(rule);
    expect(finding?.severity).toBe('blocking');
    expect(finding?.line).toBe(1);
  });

  it('avisa sin bloquear en paquetes con shell-escape y \\catcode', () => {
    const findings = run('\\usepackage{minted}\n\\catcode`\\@=11');
    expect(findings.map((f) => f.severity)).toEqual(['warning', 'warning']);
  });

  it('ignora los comentarios y el \\% literal', () => {
    expect(run('% \\write18{ls}\nTexto con 50\\% de avance')).toEqual([]);
  });

  it('no analiza la bibliografía', () => {
    expect(analyzeLatex([{ path: 'refs.bib', content: '@misc{x, note={\\write18{ls}}}' }])).toEqual([]);
  });

  it.each(TEMPLATE_IDS)('la plantilla %s es limpia y tiene rutas válidas', (id) => {
    const files = templateFiles(id, 'Título', 'Ana Torres');
    expect(files.some((f) => f.path === 'main.tex')).toBe(true);
    for (const f of files) expect(() => SafeFilePath.of(f.path)).not.toThrow();
    expect(analyzeLatex(files).filter((f) => f.severity === 'blocking')).toEqual([]);
  });
});
