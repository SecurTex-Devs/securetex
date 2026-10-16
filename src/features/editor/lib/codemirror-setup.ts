import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, HighlightStyle, indentOnInput, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars,
  keymap, lineNumbers, rectangularSelection,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { yUndoManagerKeymap } from 'y-codemirror.next';
import { KNOWN_COMMANDS } from './diagnostics';

export const latexHighlight = HighlightStyle.define([
  { tag: t.tagName, color: 'var(--brand)' },
  { tag: t.atom, color: 'var(--sec)' },
  { tag: t.keyword, color: 'var(--u2)', fontWeight: '600' },
  { tag: t.special(t.variableName), color: 'var(--u4)' },
  { tag: t.bracket, color: 'var(--text-3)' },
  { tag: t.number, color: 'var(--u3)' },
  { tag: t.comment, color: 'var(--text-3)', fontStyle: 'italic' },
  { tag: t.invalid, color: 'var(--danger)', textDecoration: 'underline wavy' },
]);

export const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--cm-font-size, 14px)', backgroundColor: 'var(--surface)', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--font-jetbrains), ui-monospace, monospace', lineHeight: 'var(--cm-line-height, 1.75)' },
  '.cm-content': { padding: '14px 0 40vh', caretColor: 'var(--brand)' },
  '.cm-line': { padding: '0 18px 0 6px' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--text-3)', border: 'none', paddingLeft: '8px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '30px', fontSize: '12px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--brand) 5%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in oklab, var(--brand) 18%, transparent) !important' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--brand)', borderLeftWidth: '2px' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--u2) 18%, transparent)', outline: 'none' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in oklab, var(--u4) 16%, transparent)' },
  '.cm-foldGutter .cm-gutterElement': { color: 'var(--text-3)', cursor: 'pointer' },
  '.cm-tooltip': { border: 'none', borderRadius: '10px', backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow-pop), inset 0 0 0 1px var(--border)', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-jetbrains), monospace', fontSize: '12.5px', maxHeight: '260px', padding: '4px' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '4px 8px !important', borderRadius: '6px', color: 'var(--text)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--brand-soft)', color: 'var(--text)' },
  '.cm-completionDetail': { color: 'var(--text-3)', fontStyle: 'normal', marginLeft: '12px', fontFamily: 'var(--font-geist), sans-serif' },
  '.cm-completionIcon': { opacity: '0.6' },
  '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-search': { fontFamily: 'var(--font-geist), sans-serif', fontSize: '13px', padding: '8px 12px' },
  '.cm-search input, .cm-search button': { borderRadius: '6px', border: 'none', boxShadow: 'inset 0 0 0 1px var(--border-strong)', backgroundColor: 'var(--surface)', color: 'var(--text)', padding: '3px 8px', backgroundImage: 'none' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in oklab, var(--u4) 30%, transparent)' },
  '.cm-flash-line': { backgroundColor: 'color-mix(in oklab, var(--u4) 28%, transparent)', transition: 'background-color 1.2s ease' },
});

// ─────────────────────────── Autocompletado (F-085 … F-089) ───────────────────────────

const ENVIRONMENTS = ['equation', 'equation*', 'align', 'align*', 'itemize', 'enumerate', 'figure', 'table', 'tabular', 'abstract', 'center', 'quote', 'verbatim', 'description', 'minipage', 'theorem', 'proof'];
const SNIPPETS: Readonly<Record<string, string>> = {
  section: 'Título de sección', subsection: 'Subsección', textbf: 'Negrita', emph: 'Énfasis', cite: 'Cita bibliográfica',
  ref: 'Referencia cruzada', label: 'Etiqueta', includegraphics: 'Imagen', frac: 'Fracción', footnote: 'Nota al pie',
};

export interface CompletionData {
  readonly citeKeys: () => ReadonlyArray<{ key: string; detail: string }>;
  readonly labels: () => readonly string[];
}

function latexCompletions(data: CompletionData) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const arg = ctx.matchBefore(/\\(begin|end|cite[pt]?|ref|eqref|label)\{[^}]*/);
    if (arg) {
      const brace = arg.text.indexOf('{');
      const cmd = arg.text.slice(1, brace);
      const from = arg.from + brace + 1;
      let options: Completion[] = [];
      if (cmd === 'begin' || cmd === 'end') options = ENVIRONMENTS.map((e) => ({ label: e, type: 'type' }));
      else if (cmd.startsWith('cite')) options = data.citeKeys().map((c) => ({ label: c.key, detail: c.detail, type: 'variable' }));
      else options = data.labels().map((l) => ({ label: l, type: 'constant' }));
      return { from, options, validFor: /^[^}]*$/ };
    }
    const word = ctx.matchBefore(/\\[A-Za-z]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    return {
      from: word.from,
      options: [...new Set(KNOWN_COMMANDS)].map((c) => ({
        label: `\\${c}`,
        type: 'keyword',
        ...(SNIPPETS[c] ? { detail: SNIPPETS[c] } : {}),
        ...(c === 'begin' ? { apply: '\\begin{' } : {}),
      })),
      validFor: /^\\[A-Za-z]*$/,
    };
  };
}

// ─────────────────────────── Comandos de formato ───────────────────────────

export function wrapSelection(view: EditorView, before: string, after: string, placeholder = ''): boolean {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to) || placeholder;
    const insert = `${before}${text}${after}`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: range.empty
        ? EditorSelection.range(range.from + before.length, range.from + before.length + text.length)
        : EditorSelection.cursor(range.from + insert.length),
    };
  });
  view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  view.focus();
  return true;
}

export function insertText(view: EditorView, text: string): void {
  const pos = view.state.selection.main.head;
  view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, scrollIntoView: true, userEvent: 'input' });
  view.focus();
}

export interface SetupOptions {
  readonly nonce: string;
  readonly readOnly: boolean;
  readonly completion: CompletionData;
  readonly onCompile: () => void;
  readonly onSave: () => void;
  readonly extra?: readonly Extension[];
  /** Enlace con Yjs (yCollab). Con colaboración, deshacer lo gestiona Y.UndoManager y no el historial local. */
  readonly collab?: Extension;
  readonly prefs: { readonly wrap: boolean; readonly lineNumbers: boolean; readonly autocomplete: boolean; readonly autoclose: boolean };
}

export function baseExtensions(o: SetupOptions): Extension[] {
  return [
    EditorView.cspNonce.of(o.nonce),
    o.prefs.lineNumbers ? lineNumbers() : [],
    highlightActiveLineGutter(),
    foldGutter({ markerDOM: (open) => { const s = document.createElement('span'); s.textContent = open ? '▾' : '▸'; return s; } }),
    highlightSpecialChars(),
    o.collab ? [] : history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    StreamLanguage.define(stex),
    syntaxHighlighting(latexHighlight),
    bracketMatching(),
    o.prefs.autoclose ? closeBrackets() : [],
    o.prefs.autocomplete ? autocompletion({ override: [latexCompletions(o.completion)], icons: false }) : [],
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    o.prefs.wrap ? EditorView.lineWrapping : [],
    editorTheme,
    EditorState.readOnly.of(o.readOnly),
    EditorView.editable.of(!o.readOnly),
    keymap.of([
      { key: 'Mod-Enter', run: () => { o.onCompile(); return true; }, preventDefault: true },
      { key: 'Mod-s', run: () => { o.onSave(); return true; }, preventDefault: true },
      { key: 'Mod-b', run: (v) => wrapSelection(v, '\\textbf{', '}', 'texto') },
      { key: 'Mod-i', run: (v) => wrapSelection(v, '\\emph{', '}', 'texto') },
      ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...(o.collab ? yUndoManagerKeymap : historyKeymap), ...completionKeymap, indentWithTab,
    ]),
    ...(o.extra ?? []),
    o.collab ?? [],
  ];
}
