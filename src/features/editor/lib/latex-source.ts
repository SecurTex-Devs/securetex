/**
 * Utilidades de lectura del fuente LaTeX compartidas por el renderizador de
 * la vista previa y el diagnóstico: resolución de \input, metadatos del
 * preámbulo, etiquetas y bibliografía.
 */

export interface SourceLine {
  readonly text: string;
  readonly file: string;
  readonly line: number;
}

const MAX_INPUT_DEPTH = 5;

export function stripComment(line: string): string {
  const idx = line.search(/(?<!\\)%/);
  return idx === -1 ? line : line.slice(0, idx);
}

function resolvePath(target: string, files: Readonly<Record<string, string>>): string | null {
  const clean = target.trim();
  // Igual que el sandbox (openin_any=p): nada absoluto ni fuera de la raíz.
  if (clean.startsWith('/') || clean.includes('..')) return null;
  if (files[clean] !== undefined) return clean;
  if (files[`${clean}.tex`] !== undefined) return `${clean}.tex`;
  return null;
}

/** Expande \input y \include conservando de qué archivo y línea viene cada línea (para SyncTeX). */
export function flatten(entry: string, files: Readonly<Record<string, string>>, depth = 0): SourceLine[] {
  const content = files[entry];
  if (content === undefined || depth > MAX_INPUT_DEPTH) return [];
  const out: SourceLine[] = [];
  content.split('\n').forEach((raw, i) => {
    const text = stripComment(raw);
    const m = /^\s*\\(?:input|include)\s*\{([^}]+)\}\s*$/.exec(text);
    const resolved = m?.[1] ? resolvePath(m[1], files) : null;
    if (resolved) out.push(...flatten(resolved, files, depth + 1));
    else out.push({ text, file: entry, line: i + 1 });
  });
  return out;
}

export function preambleValue(lines: readonly SourceLine[], command: string): string | null {
  const re = new RegExp(`\\\\${command}\\s*\\{([^}]*)\\}`);
  for (const l of lines) {
    const m = re.exec(l.text);
    if (m?.[1] !== undefined) return m[1];
  }
  return null;
}

export interface BibEntry {
  readonly key: string;
  readonly author: string;
  readonly title: string;
  readonly year: string;
  readonly venue: string;
}

export function parseBib(content: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const re = /@\w+\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const body = m[2] ?? '';
    const field = (name: string) => new RegExp(`${name}\\s*=\\s*[{"]([^}"]*)[}"]`, 'i').exec(body)?.[1]?.trim() ?? '';
    entries.push({ key: m[1] ?? '', author: field('author'), title: field('title'), year: field('year'), venue: field('journal') || field('booktitle') || field('publisher') });
  }
  return entries;
}

export function allBibEntries(files: Readonly<Record<string, string>>): BibEntry[] {
  return Object.entries(files).filter(([f]) => f.endsWith('.bib')).flatMap(([, c]) => parseBib(c));
}

export function collectLabels(lines: readonly SourceLine[]): string[] {
  const labels: string[] = [];
  for (const l of lines) for (const m of l.text.matchAll(/\\label\{([^}]+)\}/g)) if (m[1]) labels.push(m[1]);
  return labels;
}

/**
 * Recuento de palabras del documento (como el de Overleaf): sigue los \input
 * desde el principal, ignora comentarios, preámbulo, comandos, entornos y
 * fórmulas, y cuenta las palabras del texto que se lee.
 */
export function countWords(mainFile: string, files: Readonly<Record<string, string>>): number {
  const lines = flatten(mainFile, files).map((l) => stripComment(l.text));
  const begin = lines.findIndex((l) => l.includes('\\begin{document}'));
  const body = (begin >= 0 ? lines.slice(begin + 1) : lines).join('\n');
  const text = body
    .replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\begin\{(equation|align|figure|table|tabular|lstlisting|verbatim)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
    .replace(/\\(begin|end|label|ref|eqref|cite|input|include|includegraphics|bibliography|bibliographystyle)\*?(\[[^\]]*\])?\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/[{}[\]~\\&]/g, ' ');
  return (text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []).length;
}
