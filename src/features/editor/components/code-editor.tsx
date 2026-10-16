'use client';

import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import { useEditorPrefs } from '@/shared/api/session';
import { useNonce } from '@/shared/providers';
import { getT } from '@/shared/i18n';
import { allBibEntries, collectLabels, flatten } from '../lib/latex-source';
import { baseExtensions } from '../lib/codemirror-setup';
import { isBinaryKind, useEditor } from '../store';

/** «Monoespaciada del sistema»: la del sistema operativo, sin descargar nada. */
const SYSTEM_MONO = 'ui-monospace, "Cascadia Mono", Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace';

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
 * Editor CodeMirror 6 enlazado al `Y.Text` del archivo activo (yCollab):
 * edición simultánea con cursores y selecciones de los demás. Deshacer es por
 * archivo y solo deshace lo propio (Y.UndoManager). Los estilos se inyectan
 * con el nonce de la CSP (EditorView.cspNonce): nada de 'unsafe-inline'.
 */
export function CodeEditor({ readOnly, onSave, viewRef }: {
  readonly readOnly: boolean;
  readonly onSave: () => void;
  readonly viewRef: React.MutableRefObject<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const undo = useRef(new Map<string, Y.UndoManager>());
  const nonce = useNonce();
  const activeFile = useEditor((s) => s.activeFile);
  // Las imágenes y los PDF no se enlazan al CRDT: se ven en BinaryPreview.
  const fileId = useEditor((s) => { const e = s.entries[s.activeFile]; return e && !isBinaryKind(e.kind) ? e.id : null; });
  const collab = useEditor((s) => s.collab);
  const synced = useEditor((s) => s.synced);
  const jump = useEditor((s) => s.jump);
  const prefs = useEditorPrefs();
  const prefsKey = `${prefs.wrap}${prefs.lineNumbers}${prefs.autocomplete}${prefs.autoclose}${prefs.spell}`;

  useEffect(() => {
    if (!host.current) return;
    // El nonce debe estar desde la construcción: el tema base se monta en ese
    // instante y, sin nonce, la CSP bloquea su <style> (correcto: sin 'unsafe-inline').
    const view = new EditorView({ parent: host.current, state: EditorState.create({ extensions: [EditorView.cspNonce.of(nonce)] }) });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, [viewRef, nonce]);

  // Un gestor de deshacer por archivo y por sesión de colaboración.
  useEffect(() => {
    const managers = undo.current;
    return () => { for (const m of managers.values()) m.destroy(); managers.clear(); };
  }, [collab]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !collab || !fileId || !synced) return;
    const ytext = collab.text(fileId);
    let manager = undo.current.get(fileId);
    if (!manager) {
      manager = new Y.UndoManager(ytext);
      undo.current.set(fileId, manager);
    }
    view.setState(EditorState.create({
      doc: ytext.toString(),
      extensions: [
        ...baseExtensions({
          nonce,
          readOnly,
          prefs,
          collab: yCollab(ytext, collab.awareness, { undoManager: manager }),
          onCompile: () => void useEditor.getState().build(),
          onSave,
          completion: {
            citeKeys: () => allBibEntries(useEditor.getState().files).map((b) => ({ key: b.key, detail: `${b.author.split(',')[0] ?? ''} ${b.year}` })),
            labels: () => { const s = useEditor.getState(); return collectLabels(flatten(s.mainFile, s.files)); },
          },
        }),
        flashField,
        EditorView.updateListener.of((u) => {
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            useEditor.getState().setCursor(line.number, head - line.from + 1);
          }
        }),
        // Corrector ortográfico del navegador en el idioma elegido en Ajustes (o ninguno), como en Overleaf.
        EditorView.contentAttributes.of({
          'aria-label': getT('editor')('editor.label', { file: activeFile }),
          spellcheck: prefs.spell === 'off' ? 'false' : 'true',
          lang: prefs.spell === 'en' ? 'en-US' : 'es-EC',
          autocorrect: 'off',
          autocapitalize: 'off',
        }),
      ],
    }));
    // Los demás ven en qué archivo estamos (el nombre y el color los fija el servidor).
    collab.awareness.setLocalStateField('file', activeFile);
    // prefsKey: reconfigura el editor si cambian las preferencias, conservando el texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, fileId, collab, synced, nonce, readOnly, onSave, viewRef, prefsKey]);

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
      style={{ '--cm-font-size': `${prefs.fontSize}px`, '--cm-line-height': String(prefs.lineHeight), ...(prefs.font === 'system' ? { '--cm-font-family': SYSTEM_MONO } : {}) } as React.CSSProperties}
      className="h-full min-h-0 overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor.cm-focused]:outline-none"
    />
  );
}
