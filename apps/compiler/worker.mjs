// Trabajador del sandbox de compilación (Zona 4). Sin dependencias: solo Node.
//
// El contenedor no tiene red (network_mode: none). La API le entrega los
// trabajos por un volumen tmpfs compartido:
//
//   <id>.req.json   petición escrita por la API (con rename atómico)
//   <id>.claimed    el trabajador la ha reclamado y la está procesando
//   <id>.res        resultado: u32be(longitud de la cabecera) ‖ cabecera JSON ‖ PDF
//
// Cada trabajo se compila en un directorio propio de /work (tmpfs privado de
// este contenedor) que se destruye SIEMPRE, también si TeX falla o se mata.
// TeX se lanza con argv (nunca un shell), -no-shell-escape, openin_any=p,
// openout_any=p, un entorno mínimo sin secretos y límites de prlimit.
import { spawn } from 'node:child_process';
import { constants as fsc } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const JOBS_DIR = process.env.JOBS_DIR ?? '/jobs';
const WORK_DIR = process.env.WORK_DIR ?? '/work';
const TIMEOUT_MS = Number(process.env.COMPILE_TIMEOUT_MS ?? 30_000);
const MAX_PDF_BYTES = Number(process.env.COMPILE_MAX_PDF_BYTES ?? 16 * 1024 * 1024);
const CONCURRENCY = Number(process.env.COMPILE_CONCURRENCY ?? 2);
const POLL_MS = 150;
const MAX_LOG_BYTES = 256 * 1024;
/** Memoria virtual por proceso TeX. LuaTeX y XeTeX reservan bastante espacio de direcciones. */
const MAX_ADDRESS_SPACE = 2 * 1024 * 1024 * 1024;
const MAX_OPEN_FILES = 256;
const MAX_TEX_RUNS = 3;
/** Un trabajo huérfano (la API se reinició o abandonó la espera) se barre pasado este tiempo. */
const STALE_MS = 2 * 60_000;
const HEARTBEAT = '/tmp/compiler-alive';

const ENGINES = { pdflatex: 'pdflatex', xelatex: 'xelatex', lualatex: 'lualatex' };
const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'pdf']);
const ALLOWED_EXT = new Set(['tex', 'bib', 'cls', 'sty', 'txt', 'bst', ...BINARY_EXT]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JOBNAME = 'output';

/**
 * Entorno de TeX: nada heredado del contenedor. kpathsea expande `$VAR` en los
 * nombres de archivo (\input{$HOME}), así que aquí no puede haber nada que no
 * se pueda leer en voz alta.
 */
const texEnv = (cwd) => ({
  PATH: '/usr/bin:/bin',
  HOME: cwd,
  LANG: 'C.UTF-8',
  // luaotfload necesita una caché escribible: la del trabajo (fuera del
  // directorio del proyecto, que con openin_any=p no puede alcanzar con «..»)
  // y, solo para leer, la precalculada de la imagen.
  TEXMFCACHE: `${join(cwd, '..', 'cache')}:/var/lib/texmf`,
  TEXMFOUTPUT: cwd,
  shell_escape: 'f',
  openin_any: 'p',
  openout_any: 'p',
  MKTEXPK: '0',
  MKTEXTFM: '0',
  MKTEXMF: '0',
  MKTEXFMT: '0',
  max_print_line: '10000',
  error_line: '254',
  half_error_line: '238',
});

/** Misma regla que SafeFilePath en la API: el volumen compartido no se trata como confiable. */
function safeRelativePath(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) return null;
  if (raw.startsWith('/') || raw.includes('\\') || /[\u0000-\u001f\u007f<>:"|?*]/.test(raw)) return null;
  const segments = raw.split('/');
  if (segments.length > 4) return null;
  if (segments.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) return null;
  const ext = raw.includes('.') ? raw.split('.').pop().toLowerCase() : '';
  return ALLOWED_EXT.has(ext) ? raw : null;
}

function parseRequest(raw) {
  const req = JSON.parse(raw);
  const engine = ENGINES[req?.engine];
  const mainFile = safeRelativePath(req?.mainFile);
  if (!engine || !mainFile || !mainFile.endsWith('.tex') || !Array.isArray(req.files)) throw new Error('petición inválida');
  const files = req.files.map((f) => {
    const path = safeRelativePath(f?.path);
    if (!path || typeof f.content !== 'string') throw new Error('archivo inválido');
    // Imágenes y PDF llegan en base64 y solo con esas extensiones.
    const binary = f.encoding === 'base64';
    if (binary !== BINARY_EXT.has(path.split('.').pop().toLowerCase())) throw new Error('codificación inválida');
    return { path, content: binary ? Buffer.from(f.content, 'base64') : f.content };
  });
  if (!files.some((f) => f.path === mainFile)) throw new Error('falta el documento principal');
  return { engine, mainFile, files };
}

/** Ejecuta un binario de TeX con límites del kernel y lo mata (con todo su grupo) al vencer el plazo. */
function runLimited(bin, args, cwd, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.resolve({ code: null, signal: 'SIGKILL', timedOut: true });
  const cpuSeconds = Math.ceil(remaining / 1000);
  const argv = [
    `--cpu=${cpuSeconds}`, `--as=${MAX_ADDRESS_SPACE}`, `--fsize=${MAX_PDF_BYTES}`,
    `--nofile=${MAX_OPEN_FILES}`, '--core=0', '--', bin, ...args,
  ];
  return new Promise((resolve) => {
    // argv sin shell: ni comillas, ni metacaracteres, ni interpolación posible.
    const child = spawn('/usr/bin/prlimit', argv, { cwd, env: texEnv(cwd), stdio: 'ignore', detached: true, shell: false });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ya terminó */ }
    }, remaining);
    child.on('error', () => { clearTimeout(timer); resolve({ code: null, signal: null, timedOut: false }); });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      // Por si TeX dejó algún hijo: el grupo entero se mata siempre.
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* no queda nadie */ }
      resolve({ code, signal, timedOut: timedOut || signal === 'SIGXCPU' });
    });
  });
}

/**
 * LuaTeX además en modo --safer (sin os.execute, io.popen ni borrado o
 * renombrado desde Lua) y --nosocket (sin la biblioteca de red de Lua). Lua
 * aún puede LEER archivos del contenedor: por eso el contenedor no guarda
 * ningún secreto y el análisis previo bloquea \directlua.
 */
const texArgs = (engine, mainFile) => [
  ...(engine === 'lualatex' ? ['--safer', '--nosocket'] : []),
  '-no-shell-escape', '-interaction=nonstopmode', '-file-line-error', `-jobname=${JOBNAME}`, mainFile,
];

async function readCapped(path, max) {
  try {
    const fh = await open(path, fsc.O_RDONLY | fsc.O_NOFOLLOW);
    try {
      const { size } = await fh.stat();
      const buf = Buffer.alloc(Math.min(size, max));
      await fh.read(buf, 0, buf.length, 0);
      return { buf, size };
    } finally { await fh.close(); }
  } catch { return null; }
}

async function needsBibtex(dir) {
  const aux = await readCapped(join(dir, `${JOBNAME}.aux`), 1024 * 1024);
  return aux !== null && /\\bibdata\{/.test(aux.buf.toString('latin1'));
}

const wantsRerun = (log) => /Rerun to get|Label\(s\) may have changed|There were undefined references|Rerun LaTeX/.test(log);

async function compileInto(dir, { engine, mainFile }, deadline) {
  let runs = 0;
  let last;
  let bibtexDone = false;
  while (runs < MAX_TEX_RUNS) {
    last = await runLimited(`/usr/bin/${engine}`, texArgs(engine, mainFile), dir, deadline);
    runs += 1;
    if (last.timedOut || last.signal) break;
    if (!bibtexDone && (await needsBibtex(dir))) {
      bibtexDone = true;
      const bib = await runLimited('/usr/bin/bibtex', [JOBNAME], dir, deadline);
      if (bib.timedOut) { last = bib; break; }
      continue;
    }
    const log = await readCapped(join(dir, `${JOBNAME}.log`), MAX_LOG_BYTES);
    if (!log || !wantsRerun(log.buf.toString('utf8'))) break;
  }
  return { ...last, runs };
}

function statusOf(result, pdf) {
  if (result.timedOut) return 'timeout';
  if (result.signal === 'SIGXFSZ' || (pdf && pdf.size > MAX_PDF_BYTES)) return 'too_large';
  if (result.signal) return 'failed';
  if (!pdf) return 'failed';
  return result.code === 0 ? 'success' : 'errors';
}

async function compileJob(id, req) {
  const root = join(WORK_DIR, id);
  const dir = join(root, 'src');
  const started = Date.now();
  await mkdir(root, { mode: 0o700 });
  try {
    await mkdir(dir, { mode: 0o700 });
    await mkdir(join(root, 'cache'), { mode: 0o700 });
    for (const f of req.files) {
      await mkdir(dirname(join(dir, f.path)), { recursive: true, mode: 0o700 });
      // 'wx': nunca se sigue ni se pisa nada que ya exista.
      await writeFile(join(dir, f.path), f.content, { flag: 'wx', mode: 0o600 });
    }
    const result = await compileInto(dir, req, started + TIMEOUT_MS);
    const pdf = await readCapped(join(dir, `${JOBNAME}.pdf`), MAX_PDF_BYTES + 1);
    const log = await readCapped(join(dir, `${JOBNAME}.log`), MAX_LOG_BYTES);
    const status = statusOf(result, pdf);
    const deliver = (status === 'success' || status === 'errors') && pdf;
    return {
      header: {
        status, engine: req.engine, runs: result.runs, exitCode: result.code, signal: result.signal,
        durationMs: Date.now() - started, logTruncated: log ? log.size > MAX_LOG_BYTES : false,
        log: log ? log.buf.toString('utf8') : '',
      },
      pdf: deliver ? pdf.buf : Buffer.alloc(0),
    };
  } finally {
    // El directorio efímero desaparece siempre: éxito, error, plazo vencido o excepción.
    await rm(root, { recursive: true, force: true });
  }
}

async function writeResult(id, { header, pdf }) {
  const head = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length);
  const tmp = join(JOBS_DIR, `${id}.res.tmp`);
  await writeFile(tmp, Buffer.concat([len, head, pdf]), { mode: 0o600 });
  await rename(tmp, join(JOBS_DIR, `${id}.res`));
}

async function handle(id) {
  const claimed = join(JOBS_DIR, `${id}.claimed`);
  try {
    await rename(join(JOBS_DIR, `${id}.req.json`), claimed);
  } catch { return; }
  let outcome;
  try {
    // La petición se lee y se borra enseguida: el texto descifrado no espera en el volumen.
    const raw = await readFile(claimed, 'utf8');
    await unlink(claimed).catch(() => {});
    outcome = await compileJob(id, parseRequest(raw));
  } catch {
    outcome = { header: { status: 'failed', engine: null, runs: 0, exitCode: null, signal: null, durationMs: 0, logTruncated: false, log: '', rejected: true }, pdf: Buffer.alloc(0) };
  } finally {
    await unlink(claimed).catch(() => {});
  }
  await writeResult(id, outcome).catch(() => {});
}

const active = new Set();

async function sweepStale() {
  const now = Date.now();
  for (const name of await readdir(JOBS_DIR).catch(() => [])) {
    const id = name.split('.')[0];
    if (active.has(id)) continue;
    const s = await stat(join(JOBS_DIR, name)).catch(() => null);
    if (s && now - s.mtimeMs > STALE_MS) await rm(join(JOBS_DIR, name), { recursive: true, force: true });
  }
  for (const name of await readdir(WORK_DIR).catch(() => [])) {
    if (!active.has(name)) await rm(join(WORK_DIR, name), { recursive: true, force: true });
  }
}

async function tick() {
  const names = await readdir(JOBS_DIR).catch(() => []);
  for (const name of names) {
    if (active.size >= CONCURRENCY) break;
    const match = /^(.+)\.req\.json$/.exec(name);
    if (!match || !UUID.test(match[1]) || active.has(match[1])) continue;
    const id = match[1];
    active.add(id);
    void handle(id).finally(() => active.delete(id));
  }
}

async function heartbeat() {
  const now = new Date();
  await utimes(HEARTBEAT, now, now).catch(() => writeFile(HEARTBEAT, ''));
}

await sweepStale();
setInterval(() => void tick(), POLL_MS);
setInterval(() => void sweepStale(), 30_000);
setInterval(() => void heartbeat(), 5_000);
await heartbeat();
process.stdout.write(`compilador listo · concurrencia ${CONCURRENCY} · plazo ${TIMEOUT_MS} ms · PDF máx. ${MAX_PDF_BYTES} B\n`);
