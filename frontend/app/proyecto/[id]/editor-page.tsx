'use client';

import dynamic from 'next/dynamic';

// El editor (CodeMirror, KaTeX) se carga en diferido y solo en el cliente:
// no entra en el bundle inicial (Docs/01 §7) ni se renderiza en el servidor.
const EditorWorkspace = dynamic(() => import('@/features/editor/components/editor-workspace').then((m) => m.EditorWorkspace), { ssr: false });

export function EditorPage({ projectId, collabPort }: { readonly projectId: string; readonly collabPort: string }) {
  return <EditorWorkspace projectId={projectId} collabPort={collabPort} />;
}
