'use client';

import type { EditorView } from '@codemirror/view';
import { useQuery } from '@tanstack/react-query';
import { Eye, GitMerge, ShieldAlert, WifiOff } from 'lucide-react';
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
import { filesApi } from '../api';
import { useEditor } from '../store';
import { CodeEditor } from './code-editor';
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
export function EditorWorkspace({ projectId }: { readonly projectId: string }) {
  const project = useProject(projectId);
  // El contenido se pide una sola vez al abrir: después manda la copia de trabajo.
  const files = useQuery({
    // Fuera de ['projects', …] a propósito: invalidar el proyecto no debe recargar
    // el contenido y pisar la copia de trabajo.
    queryKey: ['project-files', projectId],
    queryFn: () => filesApi.all(projectId),
    enabled: project.isSuccess,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (project.isLoading || (project.isSuccess && files.isLoading)) return <EditorSkeleton />;
  const error = project.error ?? files.error;
  if (error) {
    if (isApiError(error) && error.code === 'integrity_violation') return <IntegrityView />;
    if (isApiError(error) && (error.kind === 'not_found' || error.kind === 'forbidden' || error.kind === 'validation')) {
      // 404 y 403 se muestran igual a propósito (T-P07).
      return <NotFoundView project />;
    }
    return <ErrorState error={error} onRetry={() => void (project.error ? project.refetch() : files.refetch())} />;
  }
  return project.data && files.data ? <Workspace project={project.data} files={files.data} /> : null;
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

function Workspace({ project, files: initialFiles }: { readonly project: Project; readonly files: Parameters<ReturnType<typeof useEditor.getState>['init']>[1] }) {
  const t = getT('editor');
  const view = useEditor((s) => s.view);
  const logOpen = useEditor((s) => s.logOpen);
  const status = useEditor((s) => s.status);
  const files = useEditor((s) => s.files);
  const autoCompile = useEditor((s) => s.autoCompile);
  const compile = useEditor((s) => s.compile);
  const flush = useEditor((s) => s.flush);
  const pending = useEditor((s) => Object.keys(s.unsaved).length > 0);
  const conflictPath = useEditor((s) => s.conflictPath);
  const loadedId = useEditor((s) => s.projectId);
  const viewRef = useRef<EditorView | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [treeWidth, setTreeWidth] = useState(244);
  const [editorWidth, setEditorWidth] = useState(560);
  const [dialog, setDialog] = useState<'share' | 'settings' | null>(null);
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 1024px)');
  // Cortesía visual: el servidor rechaza cualquier escritura de un lector o revisor.
  const readOnly = !project.allowedActions.includes('edit_content');
  const ready = loadedId === project.id;

  useEffect(() => {
    useEditor.getState().init(project.id, initialFiles, project.mainFile, readOnly);
    // Solo al abrir el proyecto: después la copia de trabajo es la referencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, initialFiles]);

  // Autoguardado (F-157): 700 ms después de la última tecla, cifrado en el servidor.
  useEffect(() => {
    if (!ready || !pending || readOnly || conflictPath) return;
    const id = window.setTimeout(() => void flush(), 700);
    return () => window.clearTimeout(id);
  }, [files, pending, ready, readOnly, conflictPath, flush]);

  // Al recuperar la conexión se reintenta lo pendiente.
  useEffect(() => {
    if (online && ready && pending) void flush();
  }, [online, ready, pending, flush]);

  // Aviso del navegador si se intenta cerrar con cambios sin guardar.
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  // Primera compilación al abrir y tamaño inicial del editor según el ancho disponible.
  useEffect(() => {
    if (!ready) return;
    const w = container.current?.clientWidth ?? 1200;
    setEditorWidth(Math.round((w - (w >= 1024 ? 244 : 0)) / 2));
    if (useEditor.getState().status === 'idle') void useEditor.getState().compile();
  }, [ready]);

  // Autocompilación: 1,5 s después de dejar de escribir (F-121).
  useEffect(() => {
    if (!autoCompile || !ready) return;
    const id = window.setTimeout(() => void compile(), 1500);
    return () => window.clearTimeout(id);
  }, [files, autoCompile, ready, compile]);

  // Estable (sin dependencias): si cambiara en cada render, CodeMirror
  // reconstruiría su estado en cada pulsación.
  const onSave = useCallback(() => {
    const started = performance.now();
    void useEditor.getState().flush().then(() => {
      const e = getT('editor');
      if (useEditor.getState().saveState === 'saved') {
        toast.security(e('crypto.savedToast'), e('crypto.savedHint', { ms: Math.max(1, Math.round(performance.now() - started)) }));
      }
    });
  }, []);

  if (!ready) return <EditorSkeleton />;
  // Docs/04 §4: por debajo de 1024 px, un panel cada vez.
  const effective = !wide && view === 'split' ? 'code' : view;
  const showCode = effective !== 'pdf';
  const showPdf = effective !== 'code';
  const maxEditor = Math.max(360, (container.current?.clientWidth ?? 1200) - treeWidth - 340);

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <EditorTopBar project={project} online={online} onShare={() => setDialog('share')} onSettings={() => setDialog('settings')} />
      {!online && (
        <div role="status" className="flex items-center gap-2 border-b border-line bg-warn-soft px-4 py-1.5 text-[13px] text-fg">
          <WifiOff className="size-4 text-warn" strokeWidth={1.75} aria-hidden="true" />{t('offlineBanner')}
        </div>
      )}
      {conflictPath && <ConflictBanner path={conflictPath} />}
      {readOnly && (
        <div role="status" className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-1.5 text-[12.5px] text-fg-2">
          <Eye className="size-4 text-fg-3" strokeWidth={1.75} aria-hidden="true" />{t('readonly.banner')}
        </div>
      )}
      <div ref={container} className="flex min-h-0 flex-1">
        <nav aria-label={t('files.label')} className="hidden shrink-0 border-r border-line bg-surface lg:block" style={{ width: treeWidth }}>
          <FileTree canEdit={!readOnly} />
        </nav>
        <div className="hidden lg:flex"><ResizeHandle label={t('files.label')} value={treeWidth} min={180} max={380} onChange={setTreeWidth} /></div>

        {showCode && (
          <section aria-label={t('editor.label', { file: '' })} className="flex min-w-0 flex-col bg-surface" style={showPdf ? { width: Math.min(editorWidth, maxEditor) } : { flex: 1 }}>
            <TabsBar />
            <FormatToolbar viewRef={viewRef} readOnly={readOnly} />
            <div className="min-h-0 flex-1"><CodeEditor readOnly={readOnly} onSave={onSave} viewRef={viewRef} /></div>
          </section>
        )}
        {showCode && showPdf && <ResizeHandle label={t('views.split')} value={Math.min(editorWidth, maxEditor)} min={320} max={maxEditor} onChange={setEditorWidth} />}
        {showPdf && (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1"><PreviewPane /></div>
            {logOpen && status !== 'blocked' && <div className="h-[38%] min-h-[180px]"><CompileLog engine={project.compiler} /></div>}
          </div>
        )}
      </div>
      <StatusBar engine={project.compiler} online={online} readOnly={readOnly} />
      <ShareDialog project={project} open={dialog === 'share'} onOpenChange={(o) => setDialog(o ? 'share' : null)} />
      <SettingsDialog project={project} open={dialog === 'settings'} onOpenChange={(o) => setDialog(o ? 'settings' : null)} />
    </div>
  );
}

/** 409 al guardar: otra pestaña o persona guardó antes. Nada se pisa sin decidirlo. */
function ConflictBanner({ path }: { readonly path: string }) {
  const t = getT('editor');
  const [busy, setBusy] = useState<'mine' | 'theirs' | null>(null);
  const resolve = (keep: 'mine' | 'theirs') => {
    setBusy(keep);
    useEditor.getState().resolveConflict(keep).then(
      () => toast.success(keep === 'mine' ? t('conflict.keptMine') : t('conflict.keptTheirs')),
      (e: unknown) => toast.error(isApiError(e) ? e.message : t('files.failed')),
    ).finally(() => setBusy(null));
  };
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-warn-soft px-4 py-2 text-[13px] text-fg">
      <GitMerge className="size-4 shrink-0 text-warn" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">{t('conflict.body', { file: path })}</span>
      <Button size="sm" loading={busy === 'theirs'} disabled={busy !== null} onClick={() => resolve('theirs')}>{t('conflict.theirs')}</Button>
      <Button size="sm" variant="primary" loading={busy === 'mine'} disabled={busy !== null} onClick={() => resolve('mine')}>{t('conflict.mine')}</Button>
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
