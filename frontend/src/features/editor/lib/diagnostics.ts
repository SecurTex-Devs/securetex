import { allBibEntries, collectLabels, flatten, type SourceLine } from './latex-source';

export type DiagnosticLevel = 'error' | 'warning' | 'typesetting';

export interface Diagnostic {
  readonly level: DiagnosticLevel;
  readonly message: string;
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
  readonly suggestion?: string;
}

/** Índice de comandos conocidos (F-254: empezar por una lista fija de los más usados). */
export const KNOWN_COMMANDS = [
  'documentclass', 'usepackage', 'title', 'author', 'date', 'begin', 'end', 'maketitle', 'tableofcontents', 'listoffigures',
  'listoftables', 'section', 'subsection', 'subsubsection', 'paragraph', 'chapter', 'part', 'label', 'ref', 'eqref', 'pageref',
  'cite', 'citep', 'citet', 'nocite', 'textbf', 'textit', 'emph', 'texttt', 'textsc', 'underline', 'footnote', 'url', 'href',
  'item', 'includegraphics', 'caption', 'centering', 'hline', 'toprule', 'midrule', 'bottomrule', 'newcommand', 'renewcommand',
  'input', 'include', 'bibliography', 'bibliographystyle', 'printbibliography', 'addbibresource', 'frac', 'sqrt', 'sum', 'prod',
  'int', 'mid', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'sigma', 'phi', 'omega', 'Sigma',
  'Delta', 'Omega', 'leq', 'geq', 'neq', 'approx', 'infty', 'cdot', 'times', 'left', 'right', 'quad', 'qquad', 'text', 'mathbf',
  'mathrm', 'mathcal', 'mathbb', 'hat', 'bar', 'vec', 'LaTeX', 'TeX', 'today', 'newpage', 'clearpage', 'vspace', 'hspace',
  'noindent', 'par', 'small', 'large', 'Large', 'footnotesize', 'normalsize', 'appendix', 'abstract', 'keywords', 'thanks',
  'and', 'linewidth', 'textwidth', 'ldots', 'dots', 'cdots', 'rightarrow', 'leftarrow', 'Rightarrow', 'to', 'in', 'forall',
  'exists', 'partial', 'nabla', 'log', 'exp', 'min', 'max', 'arg', 'lim', 'sin', 'cos', 'tag', 'nonumber', 'multicolumn',
  'textsuperscript', 'textsubscript', 'makeatletter', 'makeatother', 'setlength', 'geometry', 'hypersetup', 'graphicspath',
  'DeclareMathOperator', 'boldsymbol', 'operatorname', 'displaystyle', 'phantom', 'label', 'si', 'SI', 'num', 'ensuremath',
  'renewenvironment', 'newenvironment', 'NeedsTeXFormat', 'ProvidesClass', 'LoadClass', 'RequirePackage', 'PassOptionsToClass',
  'DeclareOption', 'ProcessOptions', 'def', 'let', 'relax', 'fi', 'else', 'ifx', 'z', 'pagestyle', 'thispagestyle', 'baselineskip',
  'fontsize', 'selectfont', 'bfseries', 'itshape', 'rmfamily', 'sffamily', 'ttfamily', 'normalfont', 'raggedright', 'raggedleft',
] as const;

const KNOWN = new Set<string>(KNOWN_COMMANDS);
const ENV_EXEMPT = new Set(['document']);

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j] ?? 0;
      dp[j] = Math.min((dp[j] ?? 0) + 1, (dp[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length] ?? 0;
}

function suggest(name: string): string | undefined {
  let best: { cmd: string; d: number } | undefined;
  for (const cmd of KNOWN) {
    const d = levenshtein(name, cmd);
    if (d <= 2 && (!best || d < best.d)) best = { cmd, d };
  }
  return best?.cmd;
}

function userDefined(lines: readonly SourceLine[]): Set<string> {
  const set = new Set<string>();
  for (const l of lines) for (const m of l.text.matchAll(/\\(?:re)?newcommand\*?\s*\{?\\(\w+)\}?|\\def\\(\w+)|\\DeclareMathOperator\{\\(\w+)\}/g)) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name) set.add(name);
  }
  return set;
}

function checkCommands(lines: readonly SourceLine[], out: Diagnostic[]): void {
  const defined = userDefined(lines);
  for (const l of lines) {
    for (const m of l.text.matchAll(/\\([A-Za-z]+)/g)) {
      const name = m[1] ?? '';
      if (KNOWN.has(name as (typeof KNOWN_COMMANDS)[number]) || defined.has(name) || name.length < 2) continue;
      const s = suggest(name);
      if (s) out.push({ level: 'error', message: 'Undefined control sequence', file: l.file, line: l.line, snippet: `\\${name}`, suggestion: `¿Querías escribir \\${s}?` });
    }
  }
}

function checkEnvironments(lines: readonly SourceLine[], out: Diagnostic[]): void {
  const stack: Array<{ env: string; at: SourceLine }> = [];
  for (const l of lines) {
    for (const m of l.text.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
      const [, kind, env = ''] = m;
      if (ENV_EXEMPT.has(env)) continue;
      if (kind === 'begin') stack.push({ env, at: l });
      else {
        const top = stack.pop();
        if (!top || top.env !== env) {
          out.push({ level: 'error', message: `\\begin{${top?.env ?? '?'}} terminado por \\end{${env}}`, file: l.file, line: l.line, snippet: `\\end{${env}}`, suggestion: top ? `Cierra primero el entorno ${top.env} (abierto en la línea ${top.at.line}).` : 'Sobra este \\end o falta su \\begin.' });
        }
      }
    }
  }
  for (const open of stack) {
    out.push({ level: 'error', message: `\\begin{${open.env}} sin cerrar`, file: open.at.file, line: open.at.line, snippet: `\\begin{${open.env}}`, suggestion: `Añade \\end{${open.env}} al final del entorno.` });
  }
}

function checkReferences(lines: readonly SourceLine[], files: Readonly<Record<string, string>>, out: Diagnostic[]): void {
  const labels = new Set(collectLabels(lines));
  const keys = new Set(allBibEntries(files).map((b) => b.key));
  for (const l of lines) {
    for (const m of l.text.matchAll(/\\(?:eq)?ref\{([^}]+)\}/g)) {
      if (m[1] && !labels.has(m[1])) out.push({ level: 'warning', message: `Reference \`${m[1]}' undefined`, file: l.file, line: l.line, snippet: m[0], suggestion: 'Comprueba que exista un \\label con ese nombre.' });
    }
    for (const m of l.text.matchAll(/\\cite[pt]?\{([^}]+)\}/g)) {
      for (const key of (m[1] ?? '').split(',').map((k) => k.trim())) {
        if (key && !keys.has(key)) out.push({ level: 'warning', message: `Citation \`${key}' undefined`, file: l.file, line: l.line, snippet: m[0], suggestion: 'Añade la entrada a tu archivo .bib.' });
      }
    }
  }
}

function checkLongLines(lines: readonly SourceLine[], out: Diagnostic[]): void {
  for (const l of lines) {
    const url = /\\url\{([^}]{60,})\}/.exec(l.text);
    if (url) out.push({ level: 'typesetting', message: 'Overfull \\hbox (18.4pt too wide)', file: l.file, line: l.line, snippet: url[0].slice(0, 60), suggestion: 'Una URL larga no se puede partir: usa el paquete xurl.' });
  }
}

export function diagnose(mainFile: string, files: Readonly<Record<string, string>>): Diagnostic[] {
  const lines = flatten(mainFile, files);
  const out: Diagnostic[] = [];
  checkCommands(lines, out);
  checkEnvironments(lines, out);
  checkReferences(lines, files, out);
  checkLongLines(lines, out);
  return out;
}
