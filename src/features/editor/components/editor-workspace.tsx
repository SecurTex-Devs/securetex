'use client';

import type { EditorView } from '@codemirror/view';
import { useQuery } from '@tanstack/react-query';
import { DoorClosed, Eye, ShieldAlert, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useProject } from '@/shared/api/projects';
import type { Project } from '@/shared/api/types';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { ErrorState, Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';
import { NotFoundView } from '@/shared/ui/not-found-view';
import { filesApi, type FileMeta } from '../api';
import { collabUrl } from '../collab';
import { isBinaryKind, useEditor } from '../store';
import { BinaryPreview } from './binary-preview';
import { CodeEditor } from './code-editor';
import { HistoryPanel } from './history-panel';
import { CompileLog } from './compile-log';
import { EditorTopBar } from './editor-top-bar';
import { FileTree } from './file-tree';
import { FormatToolbar, TabsBar } from './format-toolbar';
import { PreviewPane } from './preview-pane';
import { ResizeHandle } from './resize-handle';
import { SettingsDialog } from './settings-dialog';
import { ShareDialog } from './share-dialog';
import { StatusBar } from './status-bar';

/** P-14 · editor a tres paneles (Docs/04 §3.1). */
export function EditorWorkspace({ projectId, collabPort }: { readonly projectId: string; readonly collabPort: string }) {
  const project = useProject(projectId);
  // Solo metadatos por REST: el contenido llega por la colaboración en tiempo real.
  const files = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: () => filesApi.list(projectId),
    enabled: project.isSuccess,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (project.isLoading || (project.isSuccess && files.isLoading)) return <EditorSkeleton />;
  const error = project.error ?? files.error;
  if (error) {
    if (isApiError(error) && (error.kind === 'not_found' || error.kind === 'forbidden' || error.kind === 'validation')) {
      // 404 y 403 se muestran igual a propósito (T-P07).
      return <NotFoundView project />;
    }
    return <ErrorState error={error} onRetry={() => void (project.error ? project.refetch() : files.refetch())} />;
  }
  return project.data && files.data ? <Workspace project={project.data} files={files.data} collabPort={collabPort} /> : null;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function Workspace({ project, files: initialFiles, collabPort }: { readonly project: Project; readonly files: readonly FileMeta[]; readonly collabPort: string }) {
  const t = getT('editor');
  const view = useEditor((s) => s.view);
  const logOpen = useEditor((s) => s.logOpen);
  const status = useEditor((s) => s.status);
  const files = useEditor((s) => s.files);
  const autoCompile = useEditor((s) => s.autoCompile);
  const compile = useEditor((s) => s.compile);
  const build = useEditor((s) => s.build);
  const connection = useEditor((s) => s.connection);
  const synced = useEditor((s) => s.synced);
  const pending = useEditor((s) => s.saveState !== 'saved');
  const readOnly = useEditor((s) => s.readOnly);
  const notice = useEditor((s) => s.notice);
  const loadedId = useEditor((s) => s.projectId);
  const panel = useEditor((s) => s.panel);
  const activeBinary = useEditor((s) => { const e = s.entries[s.activeFile]; return e && isBinaryKind(e.kind) ? e : null; });
  const viewRef = useRef<EditorView | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [treeWidth, setTreeWidth] = useState(244);
  const [editorWidth, setEditorWidth] = useState(560);
  const [dialog, setDialog] = useState<'share' | 'settings' | null>(null);
  const online = useOnline() && connection !== 'offline';
  const wide = useMediaQuery('(min-width: 1024px)');
  const xl = useMediaQuery('(min-width: 1280px)');
  const ready = loadedId === project.id && synced;

  useEffect(() => {
    // Cortesía visual inicial: el servidor confirma el rol en el saludo del socket.
    const ro = !project.allowedActions.includes('edit_content');
    useEditor.getState().start(project.id, collabUrl(project.id, collabPort), initialFiles, project.mainFile, ro);
    return () => useEditor.getState().stop();
    // Solo al abrir el proyecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, initialFiles, collabPort]);

  useEffect(() => {
    if (connection === 'unauthenticated') {
      window.location.assign(`/entrar?next=${encodeURIComponent(window.location.pathname)}&motivo=sesion`);
    }
  }, [connection]);

  useEffect(() => {
    if (notice) toast.error(notice.message);
  }, [notice]);

  // Aviso del navegador si se intenta cerrar con cambios que el servidor aún no confirmó.
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  // Primera compilación al sincronizar y tamaño inicial del editor según el ancho disponible.
  useEffect(() => {
    if (!ready) return;
    const w = container.current?.clientWidth ?? 1200;
    setEditorWidth(Math.round((w - (w >= 1024 ? 244 : 0)) / 2));
    // Al abrir: vista rápida y PDF real; después, la autocompilación solo refresca la vista rápida.
    if (useEditor.getState().status === 'idle') void useEditor.getState().build();
  }, [ready]);

  // Autocompilación: 1,5 s después de dejar de escribir (F-121), también ante cambios de los demás.
  // Con el PDF real a la vista, se recompila también en el sandbox (como Overleaf); si no, basta la vista rápida.
  useEffect(() => {
    if (!autoCompile || !ready) return;
    const id = window.setTimeout(() => void (useEditor.getState().previewMode === 'pdf' ? build() : compile()), 1500);
    return () => window.clearTimeout(id);
  }, [files, autoCompile, ready, compile, build]);

  // Estable (sin dependencias): si cambiara en cada render, CodeMirror reconstruiría su estado.
  // Ctrl+S guarda ya y recompila el PDF real, como en Overleaf.
  const onSave = useCallback(() => {
    useEditor.getState().flush();
    const e = getT('editor');
    toast.security(e('crypto.savedToast'), e('crypto.savedHint'));
    void useEditor.getState().build();
  }, []);

  if (connection === 'integrity') return <IntegrityView />;
  if (connection === 'denied') return <RevokedView />;
  if (!ready) return <EditorSkeleton />;
  // Docs/04 §4: por debajo de 1024 px, un panel cada vez.
  const effective = !wide && view === 'split' ? 'code' : view;
  const showCode = effective !== 'pdf';
  const showPdf = effective !== 'code';
  // Con el historial abierto en pantallas anchas, el panel ocupa 340 px más a la derecha.
  const maxEditor = Math.max(360, (container.current?.clientWidth ?? 1200) - treeWidth - 340 - (panel && xl ? 340 : 0));

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <EditorTopBar project={project} online={online} onShare={() => setDialog('share')} onSettings={() => setDialog('settings')} />
      {!online && (
        <div role="status" className="flex items-center gap-2 border-b border-line bg-warn-soft px-4 py-1.5 text-[13px] text-fg">
          <WifiOff className="size-4 text-warn" strokeWidth={1.75} aria-hidden="true" />{t('offlineBanner')}
        </div>
      )}
      {readOnly && (
        <div role="status" className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-1.5 text-[12.5px] text-fg-2">
          <Eye className="size-4 text-fg-3" strokeWidth={1.75} aria-hidden="true" />{t('readonly.banner')}
        </div>
      )}
      <div ref={container} className="relative flex min-h-0 flex-1 overflow-hidden">
        <nav aria-label={t('files.label')} className="hidden shrink-0 border-r border-line bg-surface lg:block" style={{ width: treeWidth }}>
          <FileTree canEdit={!readOnly} />
        </nav>
        <div className="hidden lg:flex"><ResizeHandle label={t('files.label')} value={treeWidth} min={180} max={380} onChange={setTreeWidth} /></div>

        {showCode && (
          <section aria-label={t('editor.label', { file: '' })} className="flex min-w-0 flex-col bg-surface" style={showPdf ? { width: Math.min(editorWidth, maxEditor) } : { flex: 1 }}>
            <TabsBar />
            {!activeBinary && <FormatToolbar viewRef={viewRef} readOnly={readOnly} />}
            {/* El editor sigue montado con una imagen abierta: así conserva su estado al volver al texto. */}
            <div className={activeBinary ? 'hidden' : 'min-h-0 flex-1'}><CodeEditor readOnly={readOnly} onSave={onSave} viewRef={viewRef} /></div>
            {activeBinary && <div className="min-h-0 flex-1"><BinaryPreview projectId={project.id} file={activeBinary} /></div>}
          </section>
        )}
        {showCode && showPdf && <ResizeHandle label={t('views.split')} value={Math.min(editorWidth, maxEditor)} min={320} max={maxEditor} onChange={setEditorWidth} />}
        {showPdf && (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1"><PreviewPane /></div>
            {logOpen && status !== 'blocked' && <div className="h-[38%] min-h-[180px]"><CompileLog engine={project.compiler} /></div>}
          </div>
        )}
        {/* Por debajo de 1280 px no cabe un cuarto panel: el historial se superpone al PDF. */}
        {panel === 'history' && (
          <div className="absolute inset-y-0 right-0 z-20 w-[340px] max-w-full shadow-[var(--shadow-pop)] xl:static xl:z-auto xl:shrink-0 xl:shadow-none">
            <HistoryPanel canEdit={!readOnly} />
          </div>
        )}
      </div>
      <StatusBar engine={project.compiler} online={online} readOnly={readOnly} />
      <ShareDialog project={project} open={dialog === 'share'} onOpenChange={(o) => setDialog(o ? 'share' : null)} />
      <SettingsDialog project={project} open={dialog === 'settings'} onOpenChange={(o) => setDialog(o ? 'settings' : null)} />
    </div>
  );
}

/** El servidor cerró la sala: acceso revocado o proyecto en la papelera (T-P04). */
function RevokedView() {
  const t = getT('editor');
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="max-w-[520px] animate-rise" role="alert">
        <div className="grid size-14 place-items-center rounded-[16px] bg-warn-soft text-warn"><DoorClosed className="size-7" strokeWidth={1.5} aria-hidden="true" /></div>
        <h1 className="mt-5 font-serif text-[30px] font-medium leading-tight tracking-[-0.02em] text-fg">{t('revoked.title')}</h1>
        <p className="mt-2.5 text-[14px] leading-relaxed text-fg-2">{t('revoked.body')}</p>
        <Button asChild variant="primary" className="mt-6"><Link href="/proyectos">{t('back')}</Link></Button>
      </div>
    </div>
  );
}

/** P-50 · el servidor no pudo verificar la integridad (HMAC/GCM): no se muestra nada que no sea auténtico. */
function IntegrityView() {
  const t = getT('editor');
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="max-w-[520px] animate-rise" role="alert">
        <div className="grid size-14 place-items-center rounded-[16px] bg-danger-soft text-danger shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_25%,transparent)]">
          <ShieldAlert className="size-7" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-serif text-[30px] font-medium leading-tight tracking-[-0.02em] text-fg">{t('integrity.title')}</h1>
        <p className="mt-2.5 text-[14px] leading-relaxed text-fg-2">{t('integrity.body')}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-3">{t('integrity.audit')}</p>
        <Button asChild variant="primary" className="mt-6"><Link href="/proyectos">{t('back')}</Link></Button>
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-bg" role="status" aria-label={getT('common')('loading')}>
      <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-3"><Skeleton className="size-7 rounded-[9px]" /><Skeleton className="h-4 w-64" /></div>
      <div className="flex flex-1">
        <div className="w-[244px] border-r border-line bg-surface p-3"><div className="grid gap-2">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-5" />)}</div></div>
        <div className="flex-1 bg-surface p-6"><div className="grid gap-3">{Array.from({ length: 14 }, (_, i) => <Skeleton key={i} className="h-3" />)}</div></div>
        <div className="flex-1 bg-sunken p-8"><Skeleton className="mx-auto aspect-[1/1.41] w-[70%]" /></div>
      </div>
    </div>
  );
}
