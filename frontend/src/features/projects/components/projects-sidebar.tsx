'use client';

import { Archive, ChevronRight, FolderOpen, Lock, Plus, Settings2, ShieldAlert, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';
import Link from 'next/link';
import type { ProjectCounts, Tag } from '@/shared/api/types';
import type { ProjectFilter } from '@/shared/api/projects';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { TAG_DOT } from './tag-colors';

const FILTERS: ReadonlyArray<{ id: ProjectFilter; icon: typeof FolderOpen }> = [
  { id: 'all', icon: FolderOpen },
  { id: 'owned', icon: UserRound },
  { id: 'shared', icon: UsersRound },
  { id: 'archived', icon: Archive },
  { id: 'trash', icon: Trash2 },
];

export function ProjectsSidebar({ filter, tag, counts, tags, mfaEnabled, canCreate, onFilter, onTag, onNew, onManageTags }: {
  readonly filter: ProjectFilter;
  readonly tag: string;
  readonly counts: ProjectCounts | undefined;
  readonly tags: readonly Tag[] | undefined;
  readonly mfaEnabled: boolean;
  readonly canCreate: boolean;
  readonly onFilter: (f: ProjectFilter) => void;
  readonly onTag: (id: string | null) => void;
  readonly onNew: () => void;
  readonly onManageTags: () => void;
}) {
  const t = getT('projects');
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col gap-6 lg:flex">
      <Button variant="primary" size="lg" className="w-full" leading={<Plus className="size-4" strokeWidth={2} />} onClick={onNew} disabled={!canCreate}>
        {t('new')}
      </Button>

      <nav aria-label={t('filters.label')}>
        <ul className="grid gap-0.5">
          {FILTERS.map(({ id, icon: Icon }) => {
            const active = filter === id && !tag;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onFilter(id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] transition-colors duration-[var(--dur-micro)]',
                    active ? 'bg-surface font-medium text-fg shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:bg-surface-3/60 hover:text-fg',
                  )}
                >
                  <Icon className={cn('size-4', active ? 'text-brand' : 'text-fg-3')} strokeWidth={1.5} aria-hidden="true" />
                  <span className="flex-1 text-left">{t(`filters.${id}`)}</span>
                  <span className="tabular text-xs text-fg-3">{counts?.[id] ?? '–'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="tags-heading">
        <div className="mb-1.5 flex items-center justify-between px-2.5">
          <h2 id="tags-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{t('tags.title')}</h2>
          <button type="button" onClick={onManageTags} aria-label={t('tags.manage')} className="grid size-6 place-items-center rounded-md text-fg-3 hover:bg-surface-3 hover:text-fg">
            <Settings2 className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>
        <ul className="grid gap-0.5">
          {(tags ?? []).map((tg) => {
            const active = tag === tg.id;
            return (
              <li key={tg.id}>
                <button
                  type="button"
                  onClick={() => onTag(active ? null : tg.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] transition-colors',
                    active ? 'bg-surface font-medium text-fg shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:bg-surface-3/60 hover:text-fg',
                  )}
                >
                  <span aria-hidden="true" className={cn('size-2 rounded-full', TAG_DOT[tg.color] ?? 'bg-fg-3')} />
                  <span className="flex-1 truncate text-left">{tg.name}</span>
                  <span className="tabular text-xs text-fg-3">{tg._count?.projects ?? 0}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={onManageTags} className="flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] text-fg-3 hover:bg-surface-3/60 hover:text-fg">
              <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              {t('tags.new')}
            </button>
          </li>
        </ul>
      </section>

      <div className="mt-auto grid gap-3">
        <div className="rounded-[12px] bg-surface p-3.5 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]">
          <p className="flex items-center gap-1.5 text-xs font-medium text-fg-2"><Lock className="size-3.5 text-sec" strokeWidth={1.75} aria-hidden="true" />{t('storage.label')}</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">{t('storage.value')}</p>
        </div>
        <Link
          href="/ajustes/mfa"
          className={cn(
            'group flex items-start gap-3 rounded-[12px] p-3.5 text-left transition-colors',
            mfaEnabled ? 'bg-sec-soft shadow-[inset_0_0_0_1px_var(--sec-line)]' : 'bg-warn-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warn)_30%,transparent)]',
          )}
        >
          {mfaEnabled
            ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sec" strokeWidth={1.75} aria-hidden="true" />
            : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.75} aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-fg">{mfaEnabled ? t('security.mfaOn') : t('security.mfaOff')}</span>
            {!mfaEnabled && <span className="mt-0.5 block text-xs leading-snug text-fg-2">{t('security.mfaOffHint')}</span>}
          </span>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
