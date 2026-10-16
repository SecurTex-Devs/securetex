'use client';

import { CircleAlert, Download, FileCheck2, Zap } from 'lucide-react';
import { getT } from '@/shared/i18n';
import { IconButton } from '@/shared/ui/button';
import { Segmented } from '@/shared/ui/controls';
import { Tooltip } from '@/shared/ui/menu';
import { Spinner } from '@/shared/ui/spinner';
import { downloadPdf } from '../lib/pdfjs';
import { useEditor, type PreviewMode } from '../store';

/**
 * Controles del PDF real en la barra de la vista previa: qué se muestra (PDF
 * firmado o vista rápida del navegador), el estado de la compilación en el
 * sandbox, el sello de la firma verificada y la descarga.
 */
export function PdfControls() {
  const t = getT('editor');
  const mode = useEditor((s) => s.previewMode);
  const setMode = useEditor((s) => s.setPreviewMode);
  const pdf = useEditor((s) => s.pdf);
  const pdfStatus = useEditor((s) => s.pdfStatus);
  const mainFile = useEditor((s) => s.mainFile);
  const name = `${(mainFile.split('/').pop() ?? 'documento').replace(/\.tex$/i, '')}.pdf`;

  return (
    <div className="ml-auto flex items-center gap-1.5">
      {pdfStatus === 'running' && (
        <span role="status" className="hidden items-center gap-1.5 text-[11px] text-fg-2 lg:flex">
          <Spinner className="size-3.5 text-brand" />{t('pdf.compiling')}
        </span>
      )}
      {pdf && mode === 'pdf' && pdfStatus !== 'running' && (
        <Tooltip content={t('pdf.signedHint')}>
          <span className="hidden items-center gap-1 text-[11px] text-ok xl:flex" tabIndex={0}>
            <FileCheck2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />{t('pdf.signed')}
          </span>
        </Tooltip>
      )}
      <Segmented<PreviewMode> size="sm" label={t('pdf.mode')} value={mode} onValueChange={setMode} options={[
        { value: 'pdf', label: t('pdf.modePdf'), title: t('pdf.modePdfHint') },
        { value: 'quick', label: '', icon: <Zap className="size-3.5" strokeWidth={1.75} />, title: t('pdf.modeQuickHint') },
      ]} />
      <IconButton size="sm" label={t('pdf.download')} disabled={!pdf} onClick={() => pdf && downloadPdf(name, pdf)} icon={<Download className="size-3.5" strokeWidth={1.75} />} />
    </div>
  );
}

/** Aviso bajo la barra: compilando, o por qué no hay PDF nuevo (se muestra lo último correcto o la vista rápida). */
export function PdfNotice() {
  const t = getT('editor');
  const pdfStatus = useEditor((s) => s.pdfStatus);
  const pdfError = useEditor((s) => s.pdfError);
  const hasPdf = useEditor((s) => s.pdf !== null);
  const mode = useEditor((s) => s.previewMode);
  if (pdfStatus === 'failed' && pdfError) {
    return (
      <p role="alert" className="flex items-start gap-2 border-b border-line bg-warn-soft px-3 py-1.5 text-[12px] leading-snug text-fg">
        <CircleAlert className="mt-px size-3.5 shrink-0 text-warn" strokeWidth={2} aria-hidden="true" />
        <span>{pdfError}{hasPdf && mode === 'pdf' ? ` · ${t('pdf.stale')}` : ''}</span>
      </p>
    );
  }
  if (mode === 'pdf' && !hasPdf && pdfStatus !== 'running') {
    return <p className="border-b border-line bg-surface-2 px-3 py-1.5 text-[12px] text-fg-2">{t('pdf.notYetHint')}</p>;
  }
  return null;
}
