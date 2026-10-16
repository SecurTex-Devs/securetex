'use client';

import { Fragment, type ReactNode } from 'react';
import { MathTex } from './math';

export interface InlineContext {
  readonly labels: ReadonlyMap<string, string>;
  readonly citations: ReadonlyMap<string, number>;
}

const SIMPLE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\\\/g, ' '],
  [/\\%/g, '%'], [/\\&/g, '&'], [/\\_/g, '_'], [/\\#/g, '#'], [/\\\$/g, '$'],
  [/---/g, '—'], [/--/g, '–'], [/``/g, '“'], [/''/g, '”'], [/~/g, ' '], [/\\,/g, ' '],
  [/\\ldots|\\dots/g, '…'], [/\\LaTeX\b/g, 'LaTeX'], [/\\TeX\b/g, 'TeX'], [/\\today\b/g, new Date().toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })],
  [/\\(?:noindent|centering|par|small|large|Large|footnotesize|normalsize)\b\s*/g, ''],
];

function plain(text: string): string {
  return SIMPLE.reduce((acc, [re, rep]) => acc.replace(re, rep), text);
}

/** Lee un grupo {…} equilibrado a partir de `start` (que apunta a la llave). */
function readGroup(text: string, start: number): { content: string; end: number } | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{' && text[i - 1] !== '\\') depth += 1;
    else if (text[i] === '}' && text[i - 1] !== '\\') {
      depth -= 1;
      if (depth === 0) return { content: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

const STYLED: Readonly<Record<string, (c: ReactNode, k: number) => ReactNode>> = {
  textbf: (c, k) => <strong key={k} className="font-semibold">{c}</strong>,
  textit: (c, k) => <em key={k}>{c}</em>,
  emph: (c, k) => <em key={k}>{c}</em>,
  texttt: (c, k) => <code key={k} className="font-mono text-[0.9em]">{c}</code>,
  underline: (c, k) => <span key={k} className="underline underline-offset-2">{c}</span>,
  textsc: (c, k) => <span key={k} className="[font-variant:small-caps]">{c}</span>,
  url: (c, k) => <span key={k} className="font-mono text-[0.88em] text-[#2742c4]">{c}</span>,
};

/**
 * Renderiza texto LaTeX en línea como nodos de React. Todo el texto del
 * usuario acaba como nodo de texto escapado por React; la única excepción es
 * la salida de KaTeX, saneada con DOMPurify (ver MathTex).
 */
export function renderInline(text: string, ctx: InlineContext): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let key = 0;
  const push = (n: ReactNode) => {
    if (buf) { out.push(<Fragment key={key++}>{plain(buf)}</Fragment>); buf = ''; }
    out.push(n);
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '$' && text[i - 1] !== '\\') {
      const close = text.indexOf('$', i + 1);
      if (close > i) { push(<MathTex key={key++} tex={text.slice(i + 1, close)} />); i = close + 1; continue; }
    }
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+)\*?/.exec(text.slice(i));
      const name = m?.[1];
      if (m && name) {
        const after = i + m[0].length;
        const opt = /^\[[^\]]*\]/.exec(text.slice(after));
        const groupStart = after + (opt ? opt[0].length : 0);
        const group = readGroup(text, groupStart);
        if (group && STYLED[name]) { push(STYLED[name](renderInline(group.content, ctx), key++)); i = group.end; continue; }
        if (group && /^cite[pt]?$/.test(name)) {
          const nums = group.content.split(',').map((k) => ctx.citations.get(k.trim()) ?? '?');
          push(<span key={key++} className="text-[#2742c4]">[{nums.join(', ')}]</span>);
          i = group.end; continue;
        }
        if (group && (name === 'ref' || name === 'eqref' || name === 'pageref')) {
          const v = ctx.labels.get(group.content.trim());
          push(<span key={key++} className={v ? 'text-[#2742c4]' : 'font-semibold'}>{name === 'eqref' ? `(${v ?? '??'})` : v ?? '??'}</span>);
          i = group.end; continue;
        }
        if (group && name === 'footnote') { push(<sup key={key++} className="text-[#2742c4]">*</sup>); i = group.end; continue; }
        if (group && name === 'label') { i = group.end; continue; }
        if (group && /^(href)$/.test(name)) {
          const second = readGroup(text, group.end);
          push(<span key={key++} className="text-[#2742c4] underline underline-offset-2">{renderInline(second?.content ?? group.content, ctx)}</span>);
          i = second?.end ?? group.end; continue;
        }
        if (/^(LaTeX|TeX|today|ldots|dots|noindent|centering|par|small|large|Large|footnotesize|normalsize)$/.test(name)) {
          buf += m[0]; i = after; continue;
        }
        // Comando desconocido: se conserva su contenido, no el nombre.
        if (group) { buf += group.content; i = group.end; continue; }
        i = after; continue;
      }
    }
    buf += ch ?? '';
    i += 1;
  }
  if (buf) out.push(<Fragment key={key++}>{plain(buf)}</Fragment>);
  return out;
}
