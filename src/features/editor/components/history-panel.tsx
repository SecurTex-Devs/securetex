'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isApiError } from '@/shared/api/errors';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { dateTime, fileSize, relativeTime } from '@/shared/lib/format';
import { Button, IconButton } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';
import { filesApi, type FileVersion } from '../api';
import { diffLines } from '../lib/diff';
import { isBinaryKind, useEditor } from '../store';

/**
 * Historial del archivo abierto (F-150). Cada instantánea está cifrada en el
 * servidor; el contenido llega sellado y verificado (C5). Restaurar crea un
 * cambio nuevo que ven al instante quienes estén editando; no borra nada.
 */
export function HistoryPanel({ canEdit }: { readonly canEdit: boolean }) {
  const t = getT('editor');
  const qc = useQueryClient();
  const projectId = useEditor((s) => s.projectId);
  const path = useEditor((s) => s.activeFile);
  const entry = useEditor((s) => s.entries[s.activeFile]);
  const current = useEditor((s) => s.files[s.activeFile] ?? '');
  const [selected, setSelected] = useState<FileVersion | null>(null);
  const [confirm, setConfirm] = useState(false);
  const fileId = entry?.id ?? '';
  const binary = entry ? isBinaryKind(entry.kind) : false;

  const versions = useQuery({
    queryKey: ['file-versions', projectId, fileId],
    queryFn: () => filesApi.versions(projectId ?? '', fileId),
    enabled: Boolean(projectId && fileId && !binary),
    refetchInterval: 20_000,
  });
  const content = useQuery({
    queryKey: ['file-version', projectId, fileId, selected?.id],
    queryFn: () => filesApi.version(projectId ?? '', fileId, selected?.id ?? ''),
    enabled: Boolean(projectId && selected),
    staleTime: Infinity,
  });
  const restore = useMutation({
    mutationFn: () => filesApi.restore(projectId ?? '', fileId, selected?.id ?? ''),
    onSuccess: async () => {
      toast.success(t('history.restored'), t('history.restoredHint'));
      setConfirm(false);
      setSelected(null);
      await qc.invalidateQueries({ queryKey: ['file-versions', projectId, fileId] });
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : t('files.failed')),
  });
  const diff = useMemo(() => (content.data === undefined ? null : diffLines(content.data, current)), [content.data, current]);
  const changes = diff ? diff.filter((d) => d.kind !== 'same').length : 0;

  return (
    <aside aria-label={t('history.title')} className="flex h-full flex-col border-l border-line bg-surface">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line pl-4 pr-1.5">
        <History className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{t('history.title')} · <span className="font-mono text-[12px] text-fg-2">{path.split('/').pop()}</span></h2>
        <IconButton size="sm" label={getT('common')('close')} icon={<X className="size-4" strokeWidth={1.5} />} onClick={() => useEditor.getState().togglePanel('history')} />
      </header>
      {binary ? <EmptyState title={t('history.binary')} /> : versions.isLoading ? (
        <div className="grid gap-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : versions.error ? <div className="p-3"><ErrorState compact error={versions.error} onRetry={() => void versions.refetch()} /></div> : (versions.data ?? []).length === 0 ? (
        <EmptyState title={t('history.empty')} description={t('history.emptyHint')} />
      ) : (
        <>
          <ul className="max-h-[40%] shrink-0 overflow-y-auto border-b border-line p-1.5">
            {versions.data?.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setSelected(v)} aria-pressed={selected?.id === v.id}
                  className={cn('w-full rounded-[8px] px-2.5 py-2 text-left transition-colors', selected?.id === v.id ? 'bg-brand-soft' : 'hover:bg-surface-3/60')}>
                  <span className="block text-[13px] font-medium text-fg" title={dateTime(v.createdAt)}>{relativeTime(v.createdAt)}</span>
                  <span className="block truncate text-[11.5px] text-fg-3">{v.author ?? t('history.unknownAuthor')} · {fileSize(v.size)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-h-0 flex-1 overflow-auto">
            {!selected ? <p className="px-4 py-6 text-center text-[13px] text-fg-3">{t('history.pick')}</p> : content.isLoading ? <Skeleton className="m-3 h-40" /> : diff && (
              <>
                <p className="sticky top-0 border-b border-line bg-surface px-3 py-2 text-[11.5px] text-fg-3">{changes === 0 ? t('history.same') : changes === 1 ? t('history.changesOne') : t('history.changes', { n: changes })}</p>
                <pre className="px-0 py-1 font-mono text-[11.5px] leading-[1.6]">
                  {diff.map((d, i) => (
                    <div key={i} className={cn('whitespace-pre-wrap break-all px-3', d.kind === 'added' && 'bg-ok-soft text-fg', d.kind === 'removed' && 'bg-danger-soft text-fg-2 line-through decoration-danger/50', d.kind === 'same' && 'text-fg-3')}>
                      <span aria-hidden="true" className="mr-2 select-none">{d.kind === 'added' ? '+' : d.kind === 'removed' ? '−' : ' '}</span>{d.text || ' '}
                    </div>
                  ))}
                </pre>
              </>
            )}
          </div>
          {selected && canEdit && (
            <div className="shrink-0 border-t border-line p-3">
              <Button variant="primary" className="w-full" leading={<RotateCcw className="size-4" strokeWidth={1.75} />} disabled={changes === 0} onClick={() => setConfirm(true)}>{t('history.restore')}</Button>
              <p className="mt-2 text-[11.5px] leading-snug text-fg-3">{t('history.restoreHint')}</p>
            </div>
          )}
        </>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t('history.confirmTitle')} description={t('history.confirmBody', { when: selected ? relativeTime(selected.createdAt) : '' })}
        confirmLabel={t('history.restore')} loading={restore.isPending} onConfirm={() => restore.mutate()} />
    </aside>
  );
}
