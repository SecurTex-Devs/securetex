'use client';

import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { memo, useEffect, useRef, useState } from 'react';
import { getT } from '@/shared/i18n';
import { Spinner } from '@/shared/ui/spinner';
import { annotationModeDisabled, openPdf } from '../lib/pdfjs';

const PAGE_WIDTH = 640;

/**
 * P-19 · el PDF real, ya verificado con Ed25519, pintado en <canvas> por
 * PDF.js. Cada página lleva `data-page` para que la paginación y el
 * IntersectionObserver de la vista previa funcionen igual que con la vista rápida.
 */
export const PdfViewer = memo(function PdfViewer({ data, zoom, onPages }: { readonly data: Uint8Array; readonly zoom: number; readonly onPages: (n: number) => void }) {
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
      {Array.from({ length: doc.numPages }, (_, i) => <PdfPage key={`${i}`} doc={doc} n={i + 1} label={t('pdf.page', { n: i + 1, total: doc.numPages })} width={Math.round(PAGE_WIDTH * zoom)} />)}
    </div>
  );
});

function PdfPage({ doc, n, label, width }: { readonly doc: PDFDocumentProxy; readonly n: number; readonly label: string; readonly width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    let task: RenderTask | null = null;
    let cancelled = false;
    void (async () => {
      const page: PDFPageProxy = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      if (cancelled || !canvas.current) return;
      setRatio(base.height / base.width);
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

  return (
    <div data-page={n} aria-label={label} role="img" className="paper overflow-hidden rounded-[2px]" style={{ width, height: Math.round(width * ratio) }}>
      <canvas ref={canvas} className="block size-full" />
    </div>
  );
}
