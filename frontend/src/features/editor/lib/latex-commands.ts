import { snippet } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

/**
 * Catálogo de comandos LaTeX de la paleta (F-112, ampliado). Las plantillas
 * usan la sintaxis de fragmentos de CodeMirror: `${nombre}` es un campo; al
 * insertar, el cursor queda en el primero con su texto seleccionado y Tab
 * salta al siguiente. Cada persona puede añadir, editar u ocultar comandos:
 * se guardan cifrados en sus preferencias del servidor.
 */
export interface LatexCommand {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly template: string;
  /** true si lo creó o modificó la persona (no es del catálogo de serie). */
  readonly custom?: boolean;
}

export const BUILTIN_COMMANDS: readonly LatexCommand[] = [
  // Documento
  { id: 'doc-class', group: 'Documento', label: 'Clase de documento', template: '\\documentclass[12pt]{${article}}' },
  { id: 'doc-package', group: 'Documento', label: 'Usar un paquete', template: '\\usepackage{${paquete}}' },
  { id: 'doc-title', group: 'Documento', label: 'Título, autoría y fecha', template: '\\title{${Título}}\n\\author{${Autoría}}\n\\date{${\\today}}' },
  { id: 'doc-maketitle', group: 'Documento', label: 'Portada (\\maketitle)', template: '\\maketitle' },
  { id: 'doc-toc', group: 'Documento', label: 'Índice de contenidos', template: '\\tableofcontents' },
  { id: 'doc-input', group: 'Documento', label: 'Incluir otro archivo', template: '\\input{${capitulos/archivo}}' },
  { id: 'doc-abstract', group: 'Documento', label: 'Resumen', template: '\\begin{abstract}\n  ${Escribe aquí el resumen.}\n\\end{abstract}' },
  // Estructura
  { id: 'sec-chapter', group: 'Estructura', label: 'Capítulo', template: '\\chapter{${Título}}' },
  { id: 'sec-section', group: 'Estructura', label: 'Sección', template: '\\section{${Título}}' },
  { id: 'sec-subsection', group: 'Estructura', label: 'Subsección', template: '\\subsection{${Título}}' },
  { id: 'sec-subsubsection', group: 'Estructura', label: 'Subsubsección', template: '\\subsubsection{${Título}}' },
  { id: 'sec-paragraph', group: 'Estructura', label: 'Párrafo con título', template: '\\paragraph{${Título}} ${texto}' },
  { id: 'sec-unnumbered', group: 'Estructura', label: 'Sección sin numerar', template: '\\section*{${Título}}' },
  // Formato
  { id: 'fmt-bold', group: 'Formato', label: 'Negrita', template: '\\textbf{${texto}}' },
  { id: 'fmt-italic', group: 'Formato', label: 'Cursiva (énfasis)', template: '\\emph{${texto}}' },
  { id: 'fmt-underline', group: 'Formato', label: 'Subrayado', template: '\\underline{${texto}}' },
  { id: 'fmt-mono', group: 'Formato', label: 'Monoespaciado', template: '\\texttt{${texto}}' },
  { id: 'fmt-smallcaps', group: 'Formato', label: 'Versalitas', template: '\\textsc{${texto}}' },
  { id: 'fmt-large', group: 'Formato', label: 'Texto grande', template: '{\\large ${texto}}' },
  { id: 'fmt-quote', group: 'Formato', label: 'Cita en bloque', template: '\\begin{quote}\n  ${texto}\n\\end{quote}' },
  { id: 'fmt-center', group: 'Formato', label: 'Centrar', template: '\\begin{center}\n  ${texto}\n\\end{center}' },
  { id: 'fmt-newpage', group: 'Formato', label: 'Salto de página', template: '\\newpage' },
  // Listas
  { id: 'list-itemize', group: 'Listas', label: 'Lista con viñetas', template: '\\begin{itemize}\n  \\item ${Primer elemento}\n  \\item ${Segundo elemento}\n\\end{itemize}' },
  { id: 'list-enumerate', group: 'Listas', label: 'Lista numerada', template: '\\begin{enumerate}\n  \\item ${Primer paso}\n  \\item ${Segundo paso}\n\\end{enumerate}' },
  { id: 'list-description', group: 'Listas', label: 'Lista de definiciones', template: '\\begin{description}\n  \\item[${Término}] ${Definición}\n\\end{description}' },
  { id: 'list-item', group: 'Listas', label: 'Elemento', template: '\\item ${texto}' },
  // Matemáticas
  { id: 'math-inline', group: 'Matemáticas', label: 'Fórmula en línea', template: '$${x^2}$' },
  { id: 'math-display', group: 'Matemáticas', label: 'Fórmula destacada', template: '\\[\n  ${E = mc^2}\n\\]' },
  { id: 'math-equation', group: 'Matemáticas', label: 'Ecuación numerada', template: '\\begin{equation}\n  ${f(x) = x^2}\n  \\label{eq:${nombre}}\n\\end{equation}' },
  { id: 'math-align', group: 'Matemáticas', label: 'Ecuaciones alineadas', template: '\\begin{align}\n  ${a} &= ${b} \\\\\n  ${c} &= ${d}\n\\end{align}' },
  { id: 'math-frac', group: 'Matemáticas', label: 'Fracción', template: '\\frac{${numerador}}{${denominador}}' },
  { id: 'math-sqrt', group: 'Matemáticas', label: 'Raíz cuadrada', template: '\\sqrt{${x}}' },
  { id: 'math-sum', group: 'Matemáticas', label: 'Sumatoria', template: '\\sum_{${i=1}}^{${n}} ${a_i}' },
  { id: 'math-int', group: 'Matemáticas', label: 'Integral', template: '\\int_{${a}}^{${b}} ${f(x)}\\,dx' },
  { id: 'math-lim', group: 'Matemáticas', label: 'Límite', template: '\\lim_{${x \\to \\infty}} ${f(x)}' },
  { id: 'math-matrix', group: 'Matemáticas', label: 'Matriz', template: '\\begin{pmatrix}\n  ${a} & ${b} \\\\\n  ${c} & ${d}\n\\end{pmatrix}' },
  { id: 'math-cases', group: 'Matemáticas', label: 'Función a trozos', template: 'f(x) = \\begin{cases}\n  ${1} & \\text{si } ${x > 0} \\\\\n  ${0} & \\text{en otro caso}\n\\end{cases}' },
  // Figuras y tablas
  { id: 'fig-figure', group: 'Figuras y tablas', label: 'Figura', template: '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${figuras/imagen}}\n  \\caption{${Descripción}}\n  \\label{fig:${nombre}}\n\\end{figure}' },
  { id: 'fig-table', group: 'Figuras y tablas', label: 'Tabla', template: '\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{lll}\n    \\toprule\n    ${A} & ${B} & ${C} \\\\\n    \\midrule\n    ${1} & ${2} & ${3} \\\\\n    \\bottomrule\n  \\end{tabular}\n  \\caption{${Descripción}}\n  \\label{tab:${nombre}}\n\\end{table}' },
  { id: 'fig-tabular', group: 'Figuras y tablas', label: 'Tabla simple', template: '\\begin{tabular}{${l|l}}\n  ${A} & ${B} \\\\\n  \\hline\n  ${1} & ${2}\n\\end{tabular}' },
  // Referencias
  { id: 'ref-label', group: 'Referencias', label: 'Etiqueta', template: '\\label{${sec:nombre}}' },
  { id: 'ref-ref', group: 'Referencias', label: 'Referencia cruzada', template: '\\ref{${sec:nombre}}' },
  { id: 'ref-eqref', group: 'Referencias', label: 'Referencia a ecuación', template: '\\eqref{${eq:nombre}}' },
  { id: 'ref-cite', group: 'Referencias', label: 'Cita bibliográfica', template: '\\cite{${clave}}' },
  { id: 'ref-footnote', group: 'Referencias', label: 'Nota al pie', template: '\\footnote{${texto}}' },
  { id: 'ref-href', group: 'Referencias', label: 'Enlace', template: '\\href{${https://ejemplo.org}}{${texto}}' },
  { id: 'ref-bib', group: 'Referencias', label: 'Bibliografía (BibTeX)', template: '\\bibliographystyle{${plain}}\n\\bibliography{${referencias}}' },
  // Código
  { id: 'code-listing', group: 'Código', label: 'Bloque de código', template: '\\begin{lstlisting}[language=${Python}]\n${print("hola")}\n\\end{lstlisting}' },
  { id: 'code-verbatim', group: 'Código', label: 'Texto literal', template: '\\begin{verbatim}\n${texto}\n\\end{verbatim}' },
];

export const COMMAND_GROUPS = ['Documento', 'Estructura', 'Formato', 'Listas', 'Matemáticas', 'Figuras y tablas', 'Referencias', 'Código'] as const;

export const MAX_CUSTOM_COMMANDS = 80;
export const MAX_TEMPLATE_LENGTH = 800;

export interface CommandPrefs {
  readonly commands?: readonly LatexCommand[];
  readonly hiddenCommands?: readonly string[];
}

/** Catálogo efectivo: los de serie (con las modificaciones de la persona) más los suyos, sin los ocultos. */
export function effectiveCommands(prefs: CommandPrefs): LatexCommand[] {
  const custom = sanitizeCommands(prefs.commands);
  const hidden = new Set(Array.isArray(prefs.hiddenCommands) ? prefs.hiddenCommands.filter((x) => typeof x === 'string') : []);
  const overrides = new Map(custom.map((c) => [c.id, c]));
  const merged = BUILTIN_COMMANDS.map((c) => overrides.get(c.id) ?? c);
  const extra = custom.filter((c) => !BUILTIN_COMMANDS.some((b) => b.id === c.id));
  return [...merged, ...extra].filter((c) => !hidden.has(c.id));
}

/** Lo que viene de las preferencias se trata como dato no confiable: forma y tamaño acotados. */
export function sanitizeCommands(raw: unknown): LatexCommand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is LatexCommand => typeof c === 'object' && c !== null
      && typeof (c as LatexCommand).id === 'string' && typeof (c as LatexCommand).label === 'string'
      && typeof (c as LatexCommand).group === 'string' && typeof (c as LatexCommand).template === 'string')
    .slice(0, MAX_CUSTOM_COMMANDS)
    .map((c) => ({ id: c.id.slice(0, 40), group: c.group.slice(0, 40), label: c.label.slice(0, 80), template: c.template.slice(0, MAX_TEMPLATE_LENGTH), custom: true }));
}

/** Llaves del texto seleccionado escapadas para que no se lean como campos del fragmento. */
const escapeField = (text: string) => text.replace(/[{}]/g, (b) => `\\${b}`);

/**
 * Inserta el comando en la posición del cursor. Si hay texto seleccionado,
 * ocupa el primer campo (p. ej. seleccionar una palabra y pulsar «Negrita»).
 * El cursor queda en el primer campo para seguir escribiendo; Tab, al siguiente.
 */
export function insertCommand(view: EditorView, template: string): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  // Función como reemplazo: un `$&` o `$1` en el texto seleccionado no debe interpretarse.
  const filled = selected ? template.replace(/\$\{[^}]*\}/, () => `\${${escapeField(selected)}}`) : template;
  snippet(filled)(view, null, from, to);
  view.focus();
}

/** Texto de la plantilla sin la sintaxis de campos, para la vista previa. */
export function previewTemplate(template: string): string {
  return template.replace(/\$\{([^}]*)\}/g, '$1');
}
