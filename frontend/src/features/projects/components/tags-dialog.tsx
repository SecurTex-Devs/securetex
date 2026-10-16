'use client';

import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useCreateTag, useDeleteTag, useTags } from '@/shared/api/projects';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button, IconButton } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/field';
import { TAG_COLORS, TAG_DOT, type TagColor } from './tag-colors';

/** P-12 · etiquetas privadas de cada usuario. */
export function TagsDialog({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (o: boolean) => void }) {
  const t = getT('projects');
  const { data: tags } = useTags();
  const create = useCreateTag();
  const remove = useDeleteTag();
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColor>('blue');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    create.mutate({ name, color }, {
      onSuccess: () => setName(''),
      onError: (err) => setError(isApiError(err) ? (err.fields['name'] ?? err.message) : null),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('tags.manage')} description={t('tags.private')} width="sm">
      <ul className="grid gap-1">
        {(tags ?? []).map((tg) => (
          <li key={tg.id} className="flex items-center gap-3 rounded-[8px] px-2 py-1.5 hover:bg-surface-2">
            <span aria-hidden="true" className={cn('size-2.5 rounded-full', TAG_DOT[tg.color])} />
            <span className="flex-1 text-sm text-fg">{tg.name}</span>
            <span className="text-xs text-fg-3 tabular">{tg._count?.projects ?? 0}</span>
            <IconButton size="sm" label={t('tags.delete', { name: tg.name })} icon={<Trash2 className="size-3.5" strokeWidth={1.5} />} onClick={() => remove.mutate(tg.id)} />
          </li>
        ))}
        {tags?.length === 0 && <li className="px-2 py-2 text-sm text-fg-3">{t('tags.empty')}</li>}
      </ul>
      <form onSubmit={onSubmit} className="mt-4 border-t border-line pt-4">
        <div className="flex gap-2">
          <Input aria-label={t('tags.name')} placeholder={t('tags.new')} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" loading={create.isPending}>{t('tags.add')}</Button>
        </div>
        <div className="mt-3 flex items-center gap-2" role="radiogroup" aria-label={t('tags.color')}>
          {TAG_COLORS.map((col) => (
            <button key={col} type="button" role="radio" aria-checked={color === col} aria-label={col} onClick={() => setColor(col)}
              className={cn('grid size-7 place-items-center rounded-full transition-shadow', color === col ? 'shadow-[inset_0_0_0_1.5px_var(--text)]' : 'hover:shadow-[inset_0_0_0_1px_var(--border-strong)]')}>
              <span className={cn('size-3.5 rounded-full', TAG_DOT[col])} />
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
