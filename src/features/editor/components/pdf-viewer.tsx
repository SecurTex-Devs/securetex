'use client';

import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { memo, useEffect, useRef, useState } from 'react';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Spinner } from '@/shared/ui/spinner';
import { annotationModeDisabled, openPdf } from '../lib/pdfjs';
import type { SyncTarget } from '../lib/synctex';

const PAGE_WIDTH = 640;
/** Lo que dura el resaltado de SyncTeX directo (la animación dura un poco más y nunca llega a repetirse). */
const MARK_MS = 1900;

type Target = SyncTarget & { readonly at: number };
/** SyncTeX inverso: página (desde 1) y punto en bp desde la esquina superior izquierda. */
type InverseHandler = (page: number, xBp: number, yBp: number) => void;

/**
 * P-19 · el PDF real, ya verificado con Ed25519, pintado en <canvas> por
 * PDF.js. Cada página lleva `data-page` para que la paginación y el
 * IntersectionObserver de la vista previa funcionen igual que con la vista rápida.
 *
 * SyncTeX: doble clic en una página → `onInverse` con el punto en bp; y
 * `target` (SyncTeX directo) desplaza hasta la página y resalta sus rectángulos.
 */
export const PdfViewer = memo(function PdfViewer({ data, zoom, onPages, target, onInverse }: {
  readonly data: Uint8Array;
  readonly zoom: number;
  readonly onPages: (n: number) => void;
  readonly target: Target | null;
  readonly onInverse: InverseHandler | null;
}) {
  const t = getT('editor');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    setFailed(false);
    void (async () => {
      const task = await openPdf(data);
      opened = await task.promise;
      if (cancelled) { void opened.destroy(); return; }
      setDoc(opened);
      onPages(opened.numPages);
    })().catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      void opened?.destroy();
    };
  }, [data, onPages]);

  if (failed) return <p role="alert" className="mx-auto max-w-[360px] pt-16 text-center text-[13px] text-fg-2">{t('pdf.renderFailed')}</p>;
  if (!doc) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 pt-16 text-[13px] text-fg-2">
        <Spinner className="size-4 text-brand" />{t('pdf.loadingPages')}
      </p>
    );
  }
  return (
    <div className="mx-auto flex w-fit flex-col gap-6 pb-10">
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PdfPage key={`${i}`} doc={doc} n={i + 1} label={t('pdf.page', { n: i + 1, total: doc.numPages })} width={Math.round(PAGE_WIDTH * zoom)}
          target={target?.page === i + 1 ? target : null} onInverse={onInverse} />
      ))}
    </div>
  );
});

function PdfPage({ doc, n, label, width, target, onInverse }: {
  readonly doc: PDFDocumentProxy;
  readonly n: number;
  readonly label: string;
  readonly width: number;
  readonly target: Target | null;
  readonly onInverse: InverseHandler | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const firstMark = useRef<HTMLSpanElement>(null);
  // Tamaño de la página en bp (A4 por defecto hasta que PDF.js lo diga): SyncTeX trabaja en bp.
  const [size, setSize] = useState({ w: 595.28, h: 841.89 });
  const [mark, setMark] = useState<Target | null>(null);
  const ratio = size.h / size.w;

  useEffect(() => {
    let task: RenderTask | null = null;
    let cancelled = false;
    void (async () => {
      const page: PDFPageProxy = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      if (cancelled || !canvas.current) return;
      setSize({ w: base.width, h: base.height });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const el = canvas.current;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      const ctx = el.getContext('2d');
      if (!ctx) return;
      // Solo el contenido de la página: ni formularios ni enlaces ni acciones del PDF.
      task = page.render({ canvasContext: ctx, viewport, annotationMode: await annotationModeDisabled() });
      await task.promise;
    })().catch(() => { /* render cancelado al cambiar el zoom o desmontar */ });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, n, width]);

  // SyncTeX directo: se resalta y se lleva al centro de la vista; el resaltado se apaga solo.
  useEffect(() => {
    if (!target) return;
    setMark(target);
    const id = window.setTimeout(() => setMark(null), MARK_MS);
    return () => window.clearTimeout(id);
  }, [target]);
  useEffect(() => {
    firstMark.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [mark]);

  const onDoubleClick = onInverse ? (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    onInverse(n, ((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h);
  } : undefined;

  return (
    <div data-page={n} aria-label={label} role="img" onDoubleClick={onDoubleClick}
      className={cn('paper relative overflow-hidden rounded-[2px]', onInverse && 'cursor-text select-none')} style={{ width, height: Math.round(width * ratio) }}>
      <canvas ref={canvas} className="block size-full" />
      {mark?.rects.map((rect, i) => (
        <span key={`${mark.at}-${i}`} ref={i === 0 ? firstMark : undefined} aria-hidden="true" className="synctex-mark"
          style={{ left: `${(rect.x / size.w) * 100}%`, top: `${(rect.y / size.h) * 100}%`, width: `${(rect.w / size.w) * 100}%`, height: `${(rect.h / size.h) * 100}%` }} />
      ))}
    </div>
  );
}
