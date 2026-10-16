'use client';

import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { useEditorPrefs } from '@/shared/api/session';
import { useNonce } from '@/shared/providers';
import { getT } from '@/shared/i18n';
import { allBibEntries, collectLabels, flatten } from '../lib/latex-source';
import { baseExtensions } from '../lib/codemirror-setup';
import { useEditor } from '../store';

const flashEffect = StateEffect.define<number | null>();
const flashField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(flashEffect)) {
        if (e.value === null) return Decoration.none;
        const line = tr.state.doc.line(Math.min(Math.max(1, e.value), tr.state.doc.lines));
        return Decoration.set([Decoration.line({ class: 'cm-flash-line' }).range(line.from)]);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Editor CodeMirror 6. Un EditorState por archivo para conservar el historial
 * de deshacer al cambiar de pestaña. Los estilos se inyectan con el nonce de
 * la CSP (EditorView.cspNonce): nada de 'unsafe-inline'.
 */
export function CodeEditor({ readOnly, onSave, viewRef }: {
  readonly readOnly: boolean;
  readonly onSave: () => void;
  readonly viewRef: React.MutableRefObject<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const states = useRef(new Map<string, EditorState>());
  const nonce = useNonce();
  const activeFile = useEditor((s) => s.activeFile);
  // Sube cuando el contenido se reemplaza desde fuera (p. ej. al resolver un conflicto).
  const revision = useEditor((s) => s.revision);
  const jump = useEditor((s) => s.jump);
  const prefs = useEditorPrefs();
  const prefsKey = `${prefs.wrap}${prefs.lineNumbers}${prefs.autocomplete}${prefs.autoclose}`;

  useEffect(() => {
    if (!host.current) return;
    // El nonce debe estar desde la construcción: el tema base se monta en ese
    // instante y, sin nonce, la CSP bloquea su <style> (correcto: sin 'unsafe-inline').
    const view = new EditorView({ parent: host.current, state: EditorState.create({ extensions: [EditorView.cspNonce.of(nonce)] }) });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, [viewRef, nonce]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const store = useEditor.getState();
    const cacheKey = `${activeFile}|${prefsKey}|${revision}`;
    let state = states.current.get(cacheKey);
    if (!state) {
      state = EditorState.create({
        doc: store.files[activeFile] ?? '',
        extensions: [
          ...baseExtensions({
            nonce,
            readOnly,
            prefs,
            onCompile: () => void useEditor.getState().compile(),
            onSave,
            completion: {
              citeKeys: () => allBibEntries(useEditor.getState().files).map((b) => ({ key: b.key, detail: `${b.author.split(',')[0] ?? ''} ${b.year}` })),
              labels: () => { const s = useEditor.getState(); return collectLabels(flatten(s.mainFile, s.files)); },
            },
          }),
          flashField,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) useEditor.getState().setFile(activeFile, u.state.doc.toString());
            if (u.selectionSet || u.docChanged) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              useEditor.getState().setCursor(line.number, head - line.from + 1);
            }
          }),
          EditorView.contentAttributes.of({ 'aria-label': getT('editor')('editor.label', { file: activeFile }) }),
        ],
      });
    }
    view.setState(state);
    return () => { states.current.set(cacheKey, view.state); };
    // prefsKey: reconfigura el editor si cambian las preferencias, conservando el texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, nonce, readOnly, onSave, viewRef, prefsKey, revision]);

  // SyncTeX inverso: el PDF pide ir a una línea concreta.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !jump || jump.file !== activeFile) return;
    const line = view.state.doc.line(Math.min(Math.max(1, jump.line), view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from },
      effects: [EditorView.scrollIntoView(line.from, { y: 'center' }), flashEffect.of(jump.line)],
    });
    view.focus();
    const id = window.setTimeout(() => view.dispatch({ effects: flashEffect.of(null) }), 1400);
    return () => window.clearTimeout(id);
  }, [jump, activeFile, viewRef]);

  return (
    <div
      ref={host}
      style={{ '--cm-font-size': `${prefs.fontSize}px`, '--cm-line-height': String(prefs.lineHeight) } as React.CSSProperties}
      className="h-full min-h-0 overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor.cm-focused]:outline-none"
    />
  );
}
