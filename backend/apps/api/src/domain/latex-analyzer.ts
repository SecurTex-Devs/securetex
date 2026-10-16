/**
 * Análisis estático de seguridad del LaTeX (F-264, RS-041) — la decisión
 * AUTORITATIVA. El cliente muestra una vista previa, pero lo que se puede o no
 * compilar lo decide el servidor antes de entregar nada al sandbox.
 *
 * Es una lista de bloqueo sobre construcciones conocidas, por eso se combina
 * SIEMPRE con el aislamiento (gVisor, sin red, -no-shell-escape,
 * openin_any=p): el análisis reduce el ruido, el sandbox contiene lo que pase.
 */

export type FindingSeverity = 'blocking' | 'warning';

export interface SecurityFinding {
  readonly rule: string;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
  readonly alternative: string;
}

interface Rule {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly pattern: RegExp;
  readonly title: string;
  readonly alternative: string;
}

const RULES: readonly Rule[] = [
  {
    id: 'shell-escape',
    severity: 'blocking',
    // Las palabras de control de TeX terminan en cualquier no-letra, por eso
    // (?![A-Za-z]) y no \b: \openin5 o \directlua0 también son válidas.
    pattern: /\\(?:immediate\s*)?\\?write\s*18(?!\d)|\\ShellEscape(?![A-Za-z])|\\input\s*\{\s*\|/,
    title: 'Ejecución de comandos del sistema',
    alternative: 'Precalcula el resultado en tu equipo y súbelo como archivo del proyecto.',
  },
  {
    id: 'read-outside',
    severity: 'blocking',
    pattern: /\\(?:input|include|InputIfFileExists|lstinputlisting|verbatiminput|includegraphics(?:\[[^\]]*\])?)\s*\{\s*(?:\/|~|[A-Za-z]:\\|\.\.\/)/,
    title: 'Lectura fuera del proyecto',
    alternative: 'Usa rutas relativas dentro de tu proyecto, por ejemplo capitulos/intro.',
  },
  {
    id: 'lua-exec',
    severity: 'blocking',
    pattern: /\\(?:directlua|luaexec|luadirect)(?![A-Za-z])/,
    title: 'Ejecución de código Lua',
    alternative: 'Calcula el valor fuera del documento o usa macros de LaTeX puras.',
  },
  {
    id: 'raw-io',
    severity: 'blocking',
    pattern: /\\(?:openin|openout|newwrite|newread)(?![A-Za-z])|\\read\s*\d+\s*to(?![A-Za-z])/,
    title: 'Acceso directo a archivos',
    alternative: 'Incluye los datos como archivo del proyecto con \\input.',
  },
  {
    id: 'shell-package',
    severity: 'warning',
    pattern: /\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:shellesc|minted|pythontex|bashful|sagetex)\b[^}]*\}/,
    title: 'Paquete con capacidad de shell-escape',
    alternative: 'Para código fuente usa listings, que no necesita ejecutar programas.',
  },
  {
    id: 'catcode',
    severity: 'warning',
    pattern: /\\catcode(?![A-Za-z])/,
    title: 'Redefinición de categorías de caracteres',
    alternative: 'Suele usarse para ofuscar comandos. Si es legítimo, el aviso no impide compilar.',
  },
];

const MAX_SNIPPET = 120;

function stripComment(line: string): string {
  // Un % sin escapar inicia un comentario; \% es un porcentaje literal.
  const idx = line.search(/(?<!\\)%/);
  return idx === -1 ? line : line.slice(0, idx);
}

export function analyzeLatex(files: ReadonlyArray<{ readonly path: string; readonly content: string }>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const { path, content } of files) {
    if (!/\.(tex|sty|cls|bst)$/i.test(path)) continue;
    content.split('\n').forEach((raw, index) => {
      const line = stripComment(raw);
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push({
            rule: rule.id, severity: rule.severity, title: rule.title, file: path, line: index + 1,
            snippet: raw.trim().slice(0, MAX_SNIPPET), alternative: rule.alternative,
          });
        }
      }
    });
  }
  return findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'blocking' ? -1 : 1));
}
