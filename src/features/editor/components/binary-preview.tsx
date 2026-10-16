'use client';

import { useQuery } from '@tanstack/react-query';
import { Copy, Download, FileType2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { getT } from '@/shared/i18n';
import { fileSize } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ErrorState, Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';
import { filesApi } from '../api';
import { base64ToBytes, downloadBlob, mimeFor } from '../lib/upload';
import type { FileEntry } from '../store';

/**
 * Vista de una imagen o un PDF del proyecto. Llega sellada y verificada (C5);
 * se muestra desde un blob con el tipo que fija la extensión validada por el
 * servidor, nunca como HTML: un archivo subido no puede ejecutar nada aquí.
 */
export function BinaryPreview({ projectId, file }: { readonly projectId: string; readonly file: FileEntry }) {
  const t = getT('editor');
  const query = useQuery({
    queryKey: ['project-binary', projectId, file.id, file.version],
    queryFn: async () => base64ToBytes((await filesApi.read(projectId, file.id)).content),
    staleTime: Infinity,
    gcTime: 60_000,
  });
  const isImage = file.kind !== 'pdf';
  const url = useMemo(() => (query.data && isImage ? URL.createObjectURL(new Blob([query.data], { type: mimeFor(file.path) })) : null), [query.data, isImage, file.path]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const ref = `\\includegraphics[width=0.8\\linewidth]{${file.path.replace(/\.[^.]+$/, '')}}`;

  return (
    <div className="flex h-full flex-col bg-sunken">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <p className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg-2">{file.path} · {fileSize(file.size)}</p>
        <Button size="sm" variant="ghost" leading={<Copy className="size-3.5" strokeWidth={1.75} />}
          onClick={() => { void navigator.clipboard.writeText(ref).then(() => toast.success(t('binary.copied'))); }}>{t('binary.copyRef')}</Button>
        <Button size="sm" leading={<Download className="size-3.5" strokeWidth={1.75} />} disabled={!query.data}
          onClick={() => query.data && downloadBlob(file.path.split('/').pop() ?? file.path, query.data, mimeFor(file.path))}>{t('files.download')}</Button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-6">
        {query.isLoading ? <Skeleton className="h-64 w-80" /> : query.error ? <ErrorState compact error={query.error} onRetry={() => void query.refetch()} /> : url ? (
          <img src={url} alt={file.path} className="max-h-full max-w-full rounded-[6px] bg-[repeating-conic-gradient(#0000000d_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] shadow-[var(--shadow-card)]" />
        ) : (
          <div className="text-center">
            <FileType2 className="mx-auto size-10 text-fg-3" strokeWidth={1.25} aria-hidden="true" />
            <p className="mt-3 text-[13px] text-fg-2">{t('binary.pdf')}</p>
          </div>
        )}
      </div>
      <p className="shrink-0 border-t border-line bg-surface px-3 py-2 font-mono text-[11.5px] text-fg-3">{ref}</p>
    </div>
  );
}
