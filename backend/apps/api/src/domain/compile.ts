import { COMPILE } from './constants';

/**
 * Reglas de dominio de la compilación real (AGENTS.md §3.3): qué salida del
 * sandbox se acepta y qué parte del registro puede ver la persona usuaria.
 * Funciones puras: el sandbox es hostil por definición y todo lo que devuelve
 * se trata como entrada del atacante.
 */

export const COMPILE_ENGINES = ['pdflatex', 'xelatex', 'lualatex'] as const;
export type CompileEngine = (typeof COMPILE_ENGINES)[number];

/**
 * success   · PDF sin errores de TeX
 * errors    · TeX terminó con errores, pero produjo un PDF (como Overleaf, se muestra)
 * failed    · no hay PDF
 * timeout   · se agotó el plazo y el sandbox mató el proceso
 * too_large · el PDF (o el registro) superó el límite de tamaño
 * rejected  · la salida no es un PDF válido: no se entrega
 */
export type CompileStatus = 'success' | 'errors' | 'failed' | 'timeout' | 'too_large' | 'rejected';

export interface CompileDiagnostic {
  readonly level: 'error' | 'warning' | 'typesetting';
  readonly file: string | null;
  readonly line: number | null;
  readonly message: string;
}

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const PDF_EOF = Buffer.from('%%EOF', 'latin1');
/** Un PDF puede llevar basura tras %%EOF (actualizaciones incrementales, saltos de línea). */
const EOF_WINDOW = 2048;
const MIN_PDF_BYTES = 64;
const MAX_MESSAGE = 300;

/**
 * Valida el PDF por su contenido real, no por la extensión: firma `%PDF-1.x`
 * o `%PDF-2.x`, marca de fin y tamaño. Devuelve el motivo del rechazo o null.
 */
export function pdfRejection(pdf: Buffer): 'empty' | 'too_large' | 'not_pdf' | 'truncated' | null {
  if (pdf.length < MIN_PDF_BYTES) return 'empty';
  if (pdf.length > COMPILE.MAX_PDF_BYTES) return 'too_large';
  if (!pdf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC) || !/^[12]\.\d/.test(pdf.toString('latin1', 5, 8))) return 'not_pdf';
  if (pdf.subarray(Math.max(0, pdf.length - EOF_WINDOW)).indexOf(PDF_EOF) === -1) return 'truncated';
  return null;
}

/**
 * Ruta absoluta con al menos un directorio. No se toca lo que va detrás de un
 * carácter de palabra, punto, «:» o «/»: así sobreviven las rutas relativas
 * del proyecto (./capitulos/intro.tex) y las URL (https://…/…).
 */
const ABSOLUTE_PATH = /(?<![\w.~:/-])\/(?:[\w.+@-]+\/)+([\w.+@-]*)/g;
/** Todo carácter de control salvo el tabulador y el salto de línea. */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/**
 * Sanea el registro antes de mostrarlo (RS-036): sin rutas absolutas del
 * contenedor (el árbol de TeX Live o el directorio del trabajo quedan en su
 * nombre de archivo), sin caracteres de control y con un tamaño acotado. El
 * texto sigue siendo del usuario: la interfaz lo muestra siempre como texto.
 */
export function sanitizeCompileLog(raw: string): string {
  const clean = raw.replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(ABSOLUTE_PATH, '$1');
  if (clean.length <= COMPILE.MAX_LOG_CHARS) return clean;
  const half = Math.floor(COMPILE.MAX_LOG_CHARS / 2);
  return `${clean.slice(0, half)}\n[… registro recortado …]\n${clean.slice(-half)}`;
}

const FILE_LINE_ERROR = /^(?:\.\/)?([^\s:()]+\.(?:tex|sty|cls|bbl|bib)):(\d+): (.+)$/;
const BARE_ERROR = /^! (.+)$/;
const LATEX_WARNING = /^(?:LaTeX|Package \S+|Class \S+) Warning: (.+?)(?: on input line (\d+))?\.?$/;
const BADBOX = /^((?:Over|Under)full \\[hv]box .+?)(?: (?:in paragraph|in alignment|detected) at lines? (\d+)(?:--\d+)?)?$/;

const truncate = (s: string) => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE)}…` : s);

function diagnosticOf(line: string): CompileDiagnostic | null {
  let m = FILE_LINE_ERROR.exec(line);
  if (m?.[1] && m[2] && m[3]) return { level: 'error', file: m[1], line: Number(m[2]), message: truncate(m[3]) };
  m = BARE_ERROR.exec(line);
  if (m?.[1]) return { level: 'error', file: null, line: null, message: truncate(m[1]) };
  m = LATEX_WARNING.exec(line);
  if (m?.[1]) return { level: 'warning', file: null, line: m[2] ? Number(m[2]) : null, message: truncate(m[1]) };
  m = BADBOX.exec(line);
  if (m?.[1]) return { level: 'typesetting', file: null, line: m[2] ? Number(m[2]) : null, message: truncate(m[1]) };
  return null;
}

/**
 * Errores y avisos del registro real, en el formato -file-line-error. Con
 * -file-line-error TeX no repite el error con «!», así que no se duplica.
 */
export function parseCompileLog(log: string): CompileDiagnostic[] {
  const out: CompileDiagnostic[] = [];
  const seen = new Set<string>();
  for (const line of log.split('\n')) {
    const d = diagnosticOf(line.trimEnd());
    if (!d) continue;
    const key = `${d.level}|${d.file ?? ''}|${d.line ?? ''}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
    if (out.length >= COMPILE.MAX_DIAGNOSTICS) break;
  }
  return out;
}
