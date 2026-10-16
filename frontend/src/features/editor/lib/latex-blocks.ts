import { allBibEntries, flatten, preambleValue, type BibEntry, type SourceLine } from './latex-source';

/**
 * Convierte el fuente en bloques tipográficos para la VISTA PREVIA del
 * prototipo. No es TeX: es una aproximación fiel para un subconjunto
 * (secciones, párrafos, ecuaciones, listas, figuras, tablas y bibliografía)
 * mientras el compilador real en sandbox (Sprint 3) no existe. Cada bloque
 * recuerda su archivo y línea de origen: así funciona el salto PDF ⇄ código.
 */

export interface Src {
  readonly file: string;
  readonly line: number;
}

export type Block =
  | { readonly kind: 'title'; readonly title: string; readonly author: string; readonly date: string; readonly src: Src }
  | { readonly kind: 'abstract'; readonly text: string; readonly src: Src }
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly number: string; readonly text: string; readonly src: Src }
  | { readonly kind: 'paragraph'; readonly text: string; readonly src: Src; readonly lastLine: number }
  | { readonly kind: 'equation'; readonly tex: string; readonly number: number | null; readonly src: Src }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly string[]; readonly src: Src }
  | { readonly kind: 'figure'; readonly caption: string; readonly number: number; readonly graphic: string; readonly src: Src }
  | { readonly kind: 'table'; readonly caption: string; readonly number: number; readonly rows: readonly (readonly string[])[]; readonly src: Src }
  | { readonly kind: 'references'; readonly entries: readonly BibEntry[]; readonly src: Src };

export interface DocumentModel {
  readonly blocks: readonly Block[];
  /** label → número visible («3», «2.1», «Figura 1»…) */
  readonly labels: ReadonlyMap<string, string>;
  /** clave bib → número de cita en orden de aparición */
  readonly citations: ReadonlyMap<string, number>;
}

interface Cursor {
  i: number;
  readonly lines: readonly SourceLine[];
}

const BLOCK_START = /^\s*\\(section|subsection|subsubsection|maketitle|begin\{(abstract|equation\*?|align\*?|itemize|enumerate|figure|table)\}|\[|printbibliography|bibliography\{)/;

function argOf(text: string, command: string): string {
  const m = new RegExp(`\\\\${command}\\*?\\s*\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`).exec(text);
  return m?.[1]?.trim() ?? '';
}

function collectUntil(cur: Cursor, end: RegExp): SourceLine[] {
  const out: SourceLine[] = [];
  while (cur.i < cur.lines.length) {
    const l = cur.lines[cur.i];
    cur.i += 1;
    if (!l) break;
    if (end.test(l.text)) {
      const before = l.text.split(end)[0] ?? '';
      if (before.trim()) out.push({ ...l, text: before });
      break;
    }
    out.push(l);
  }
  return out;
}

class Counters {
  section = 0;
  subsection = 0;
  subsubsection = 0;
  equation = 0;
  figure = 0;
  table = 0;
  readonly labels = new Map<string, string>();

  heading(level: 1 | 2 | 3): string {
    if (level === 1) { this.section += 1; this.subsection = 0; this.subsubsection = 0; return `${this.section}`; }
    if (level === 2) { this.subsection += 1; this.subsubsection = 0; return `${this.section}.${this.subsection}`; }
    this.subsubsection += 1;
    return `${this.section}.${this.subsection}.${this.subsubsection}`;
  }

  label(lines: readonly SourceLine[] | string, value: string): void {
    const text = typeof lines === 'string' ? lines : lines.map((l) => l.text).join(' ');
    for (const m of text.matchAll(/\\label\{([^}]+)\}/g)) if (m[1]) this.labels.set(m[1], value);
  }
}

function parseEnvironment(env: string, cur: Cursor, start: SourceLine, counters: Counters): Block | null {
  const base = env.replace('*', '');
  const body = collectUntil(cur, new RegExp(`\\\\end\\{${env.replace('*', '\\*')}\\}`));
  const joined = body.map((l) => l.text).join('\n');
  const src = { file: start.file, line: start.line };
  if (base === 'abstract') return { kind: 'abstract', text: joined.replace(/\s+/g, ' ').trim(), src };
  if (base === 'equation' || base === 'align') {
    const numbered = !env.endsWith('*');
    const number = numbered ? (counters.equation += 1) : null;
    if (number !== null) counters.label(joined, String(number));
    const tex = joined.replace(/\\label\{[^}]*\}/g, '').replace(/\\nonumber/g, '').trim();
    return { kind: 'equation', tex: base === 'align' ? `\\begin{aligned}${tex}\\end{aligned}` : tex, number, src };
  }
  if (base === 'itemize' || base === 'enumerate') {
    const items = joined.split(/\\item\b/).slice(1).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { kind: 'list', ordered: base === 'enumerate', items, src };
  }
  if (base === 'figure') {
    counters.figure += 1;
    counters.label(joined, String(counters.figure));
    return { kind: 'figure', caption: argOf(joined, 'caption'), number: counters.figure, graphic: argOf(joined, 'includegraphics(?:\\[[^\\]]*\\])?'), src };
  }
  counters.table += 1;
  counters.label(joined, String(counters.table));
  const tabular = /\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/.exec(joined)?.[1] ?? '';
  const rows = tabular.replace(/\\(?:hline|toprule|midrule|bottomrule)/g, '').split('\\\\').map((r) => r.split('&').map((c) => c.trim())).filter((r) => r.some(Boolean));
  return { kind: 'table', caption: argOf(joined, 'caption'), number: counters.table, rows, src };
}

function parseLine(l: SourceLine, cur: Cursor, counters: Counters, meta: { title: string; author: string; date: string }): Block | null {
  const t = l.text.trim();
  const src = { file: l.file, line: l.line };
  const head = /^\\(section|subsection|subsubsection)(\*?)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(t);
  if (head) {
    const level = head[1] === 'section' ? 1 : head[1] === 'subsection' ? 2 : 3;
    const number = head[2] ? '' : counters.heading(level);
    counters.label(t, number);
    return { kind: 'heading', level, number, text: head[3] ?? '', src };
  }
  if (t.startsWith('\\maketitle')) return { kind: 'title', ...meta, src };
  if (t.startsWith('\\[')) {
    const tex = [t.slice(2).replace(/\\\]$/, ''), ...(t.includes('\\]') ? [] : collectUntil(cur, /\\\]/).map((x) => x.text))].join(' ');
    return { kind: 'equation', tex: tex.trim(), number: null, src };
  }
  if (/^\\(printbibliography|bibliography\{)/.test(t)) return { kind: 'references', entries: [], src };
  const env = /^\\begin\{([^}]+)\}/.exec(t)?.[1];
  return env ? parseEnvironment(env, cur, l, counters) : null;
}

export function buildDocument(mainFile: string, files: Readonly<Record<string, string>>): DocumentModel {
  const all = flatten(mainFile, files);
  const beginIdx = all.findIndex((l) => /\\begin\{document\}/.test(l.text));
  const endIdx = all.findIndex((l) => /\\end\{document\}/.test(l.text));
  const preamble = beginIdx === -1 ? all : all.slice(0, beginIdx);
  const body = all.slice(beginIdx + 1, endIdx === -1 ? undefined : endIdx);
  const meta = { title: preambleValue(preamble, 'title') ?? '', author: preambleValue(preamble, 'author') ?? '', date: preambleValue(preamble, 'date') ?? '' };

  const counters = new Counters();
  const blocks: Block[] = [];
  const cur: Cursor = { i: 0, lines: body };
  let para: SourceLine[] = [];
  const flush = () => {
    const text = para.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim();
    const first = para[0];
    const last = para[para.length - 1];
    if (text && first && last) blocks.push({ kind: 'paragraph', text, src: { file: first.file, line: first.line }, lastLine: last.line });
    para = [];
  };

  while (cur.i < body.length) {
    const l = body[cur.i];
    cur.i += 1;
    if (!l) continue;
    if (!l.text.trim()) { flush(); continue; }
    if (BLOCK_START.test(l.text)) {
      flush();
      const block = parseLine(l, cur, counters, meta);
      if (block) blocks.push(block);
      continue;
    }
    para.push(l);
  }
  flush();

  const citations = new Map<string, number>();
  const cited = blocks.flatMap((b) => ('text' in b ? [b.text] : 'items' in b ? b.items : []));
  for (const text of cited) for (const m of text.matchAll(/\\cite[pt]?\{([^}]+)\}/g)) for (const k of (m[1] ?? '').split(',')) {
    const key = k.trim();
    if (key && !citations.has(key)) citations.set(key, citations.size + 1);
  }
  const bib = allBibEntries(files);
  const ordered = [...citations.keys()].map((k) => bib.find((b) => b.key === k)).filter((b): b is BibEntry => Boolean(b));
  const finalBlocks = blocks.map((b) => (b.kind === 'references' ? { ...b, entries: ordered } : b));
  return { blocks: finalBlocks, labels: counters.labels, citations };
}

/** Peso aproximado en líneas de 12 pt para paginar en A4. */
export function blockWeight(b: Block): number {
  switch (b.kind) {
    case 'title': return 9;
    case 'abstract': return 3 + Math.ceil(b.text.length / 95);
    case 'heading': return b.level === 1 ? 3.2 : 2.4;
    case 'paragraph': return 0.8 + Math.ceil(b.text.length / 92);
    case 'equation': return 3.4;
    case 'list': return b.items.reduce((s, it) => s + Math.ceil(it.length / 82), 0.8);
    case 'figure': return 12;
    case 'table': return 3 + b.rows.length * 1.6;
    case 'references': return 2.5 + b.entries.length * 2.2;
  }
}

export const PAGE_CAPACITY = 40;

export function paginate(blocks: readonly Block[]): Block[][] {
  const pages: Block[][] = [[]];
  let used = 0;
  for (const b of blocks) {
    const w = blockWeight(b);
    const current = pages[pages.length - 1];
    if (current && used + w > PAGE_CAPACITY && current.length > 0) {
      pages.push([b]);
      used = w;
    } else {
      current?.push(b);
      used += w;
    }
  }
  return pages;
}
