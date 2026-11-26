'use client';

import { ChevronLeft, ChevronRight, CloudOff, FileSearch, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { IconButton } from '@/shared/ui/button';
import { Kbd } from '@/shared/ui/badge';
import { Spinner } from '@/shared/ui/spinner';
import type { Src } from '../lib/latex-blocks';
import { syncInverse } from '../lib/synctex';
import { isBinaryKind, useEditor } from '../store';
import { BlockedPanel } from './blocked-panel';
import { DocumentPages } from './document-pages';
import { PdfControls, PdfNotice } from './pdf-controls';
import { PdfViewer } from './pdf-viewer';

const ZOOMS = [0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3] as const;
const PAGE_WIDTH = 640;

/**
 * P-19 · el PDF real compilado en el sandbox y verificado con Ed25519 o, como
 * respaldo mientras llega (o si falla), la vista previa rápida compuesta en
 * el navegador. Las dos solo después de que el servidor analice el proyecto y
 * no encuentre nada bloqueante (P-47).
 */
export function PreviewPane() {
  const t = getT('editor');
  const status = useEditor((s) => s.status);
  const result = useEditor((s) => s.result);
  const highlight = useEditor((s) => s.highlight);
  const jumpTo = useEditor((s) => s.jumpTo);
  // null = «Ajustar al ancho»: la página nunca se recorta, sea cual sea el panel.
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const [fitZoom, setFitZoom] = useState(0.9);
  const [page, setPage] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const zoom = zoomIdx === null ? fitZoom : (ZOOMS[zoomIdx] ?? 1);
  const currentIdx = zoomIdx ?? ZOOMS.findIndex((z) => z >= fitZoom - 0.001);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 640;
      setFitZoom(Math.min(1.25, Math.max(0.45, (width - 8) / PAGE_WIDTH)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pdf = useEditor((s) => s.pdf);
  const showPdf = useEditor((s) => s.previewMode === 'pdf') && pdf !== null;
  const [pdfPages, setPdfPages] = useState(0);
  const total = showPdf ? pdfPages : (result?.pages.length ?? 0);
  const busy = status === 'analyzing' || status === 'running';
  const compileError = useEditor((s) => s.compileError);

  const onInverseSync = useCallback((src: Src) => jumpTo(src.file, src.line), [jumpTo]);
  // SyncTeX sobre el PDF real: el mapa firmado de la misma compilación que el PDF.
  const synctex = useEditor((s) => s.synctex);
  const pdfTarget = useEditor((s) => s.pdfTarget);
  const onPdfInverse = useCallback((n: number, x: number, y: number) => {
    if (!synctex) return;
    const src = syncInverse(synctex, n, x, y);
    // Solo se salta a archivos que existen en el proyecto (y no a imágenes).
    const entry = src ? useEditor.getState().entries[src.file] : undefined;
    if (src && entry && !isBinaryKind(entry.kind)) jumpTo(src.file, src.line);
  }, [synctex, jumpTo]);

  // Página visible según el desplazamiento (IntersectionObserver, nunca un listener de scroll).
  useEffect(() => {
    const root = scroller.current;
    if (!root || !total) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const n = Number((visible?.target as HTMLElement | undefined)?.dataset['page']);
      if (n) setPage(n);
    }, { root, threshold: [0.3, 0.6] });
    root.querySelectorAll('[data-page]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [total, zoom, result, showPdf]);

  // SyncTeX directo: llevar a la vista el bloque resaltado.
  useEffect(() => {
    if (!highlight || !scroller.current) return;
    scroller.current.querySelector(`[data-src="${CSS.escape(`${highlight.file}:${highlight.line}`)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight]);

  const goPage = (n: number) => {
    const el = scroller.current?.querySelector(`[data-page="${n}"]`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <section aria-label={t('pdf.label')} className="relative flex h-full min-w-0 flex-col bg-sunken">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1 sm:h-10 sm:flex-nowrap sm:py-0">
        <IconButton size="sm" label={t('pdf.zoomOut')} disabled={currentIdx <= 0} onClick={() => setZoomIdx(Math.max(0, (currentIdx === -1 ? ZOOMS.length : currentIdx) - 1))} icon={<Minus className="size-3.5" strokeWidth={1.75} />} />
        <span className="w-12 text-center text-xs text-fg-2 tabular" aria-live="polite">{Math.round(zoom * 100)} %</span>
        <IconButton size="sm" label={t('pdf.zoomIn')} disabled={currentIdx === ZOOMS.length - 1} onClick={() => setZoomIdx(Math.min(ZOOMS.length - 1, currentIdx + 1))} icon={<Plus className="size-3.5" strokeWidth={1.75} />} />
        <button type="button" aria-pressed={zoomIdx === null} onClick={() => setZoomIdx(null)}
          className={cn('h-7 rounded-[6px] px-2 text-xs transition-colors', zoomIdx === null ? 'bg-brand-soft font-medium text-brand' : 'text-fg-2 hover:bg-surface-3 hover:text-fg')}>
          {t('pdf.fit')}
        </button>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <IconButton size="sm" label={t('pdf.prev')} disabled={page <= 1} onClick={() => goPage(page - 1)} icon={<ChevronLeft className="size-4" strokeWidth={1.5} />} />
        <span className="text-xs text-fg-2 tabular">{total ? t('pdf.page', { n: page, total }) : '—'}</span>
        <IconButton size="sm" label={t('pdf.next')} disabled={page >= total} onClick={() => goPage(page + 1)} icon={<ChevronRight className="size-4" strokeWidth={1.5} />} />
        <PdfControls />
      </div>
      {status !== 'blocked' && <PdfNotice />}

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto px-4 pt-5">
        {status === 'blocked' && result ? <BlockedPanel findings={result.findings} /> : showPdf && pdf ? (
          <PdfViewer data={pdf} zoom={zoom} onPages={setPdfPages} target={pdfTarget} onInverse={synctex ? onPdfInverse : null} />
        ) : result && total > 0 ? (
          <div className={cn('transition-opacity duration-300', busy && 'opacity-60')}>
            <DocumentPages model={result.model} pages={result.pages} zoom={zoom} highlight={highlight} onInverseSync={onInverseSync} />
          </div>
        ) : status === 'failed' && !result ? (
          <div className="grid h-full place-items-center pb-16 text-center">
            <div className="max-w-[320px]" role="alert">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-[14px] bg-warn-soft text-warn"><CloudOff className="size-5" strokeWidth={1.5} aria-hidden="true" /></div>
              <p className="font-serif text-xl text-fg">{t('compile.unreachable')}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{compileError ?? t('compile.unreachableHint')}</p>
            </div>
          </div>
        ) : !busy ? (
          <div className="grid h-full place-items-center pb-16 text-center">
            <div className="max-w-[300px]">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-[14px] bg-surface text-fg-3 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]"><FileSearch className="size-5" strokeWidth={1.5} aria-hidden="true" /></div>
              <p className="font-serif text-xl text-fg">{t('pdf.empty')}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{t('pdf.emptyHint')}</p>
              <p className="mt-3 flex items-center justify-center gap-1 text-xs text-fg-3"><Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd></p>
            </div>
          </div>
        ) : null}
        {busy && <CompileProgress status={status} />}
      </div>
      {(showPdf ? synctex !== null : result !== null && total > 0) && status !== 'blocked' && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full xl:block bg-surface/90 px-3 py-1 text-[11px] text-fg-3 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)] backdrop-blur">{t('pdf.syncHint')}</p>
      )}
    </section>
  );
}

const STAGES = ['analyzing', 'running'] as const;

function CompileProgress({ status }: { readonly status: string }) {
  const t = getT('editor');
  const current = status === 'analyzing' ? 0 : 1;
  const labels = [t('compile.stages.analyze'), t('compile.stages.preview')];
  return (
    <div role="status" aria-live="polite" className="absolute inset-x-0 top-6 z-10 mx-auto w-[300px] animate-pop rounded-[14px] bg-surface p-4 shadow-[var(--shadow-pop),inset_0_0_0_1px_var(--border)]">
      <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <Spinner className="size-4 text-brand" />
        {status === 'analyzing' ? t('compile.analyzing') : t('compile.running')}
      </p>
      <ol className="mt-3 grid gap-1.5">
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-2 text-xs">
            <span className={cn('size-1.5 rounded-full', i < current ? 'bg-ok' : i === current ? 'animate-[pulse-dot_1s_ease-in-out_infinite] bg-brand' : 'bg-line-strong')} aria-hidden="true" />
            <span className={i <= current ? 'text-fg-2' : 'text-fg-3'}>{labels[i]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
