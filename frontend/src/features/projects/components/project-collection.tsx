'use client';

import Link from 'next/link';
import type { Project, Tag } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { daysUntil, relativeTime } from '@/shared/lib/format';
import { AvatarStack } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { MiniPaper, PaperThumb } from './paper-thumb';
import { ProjectActions } from './project-actions';
import { TAG_CHIP } from './tag-colors';

const ROLE_TONE = { owner: 'brand', editor: 'ok', reviewer: 'sec', viewer: 'neutral' } as const;

function RoleBadge({ role }: { readonly role: Project['role'] }) {
  const c = getT('common');
  return <Badge tone={ROLE_TONE[role]} size="sm">{c(`roles.${role}`)}</Badge>;
}

function TagChips({ project, tags }: { readonly project: Project; readonly tags: ReadonlyMap<string, Tag> }) {
  return (
    <>
      {project.tagIds.map((id) => {
        const tg = tags.get(id);
        return tg ? <span key={id} className={cn('rounded-full px-1.5 py-px text-[11px] font-medium', TAG_CHIP[tg.color])}>{tg.name}</span> : null;
      })}
    </>
  );
}

function people(p: Project) {
  return p.collaborators.map((c) => ({ id: c.userId, name: c.name }));
}

/** P-08 · vista de lista: densa, ordenable, con el rol visible sin abrir el proyecto. */
export function ProjectTable({ items, tags, trash }: { readonly items: readonly Project[]; readonly tags: ReadonlyMap<string, Tag>; readonly trash: boolean }) {
  const t = getT('projects');
  const c = getT('common');
  return (
    <div className="card relative overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3">
            <th scope="col" className="py-2.5 pl-5 pr-3 font-semibold">{t('col.title')}</th>
            <th scope="col" className="hidden px-3 font-semibold md:table-cell">{t('col.owner')}</th>
            <th scope="col" className="hidden px-3 font-semibold lg:table-cell">{t('col.collaborators')}</th>
            <th scope="col" className="hidden px-3 font-semibold sm:table-cell">{t('col.role')}</th>
            <th scope="col" className="px-3 font-semibold">{trash ? t('filters.trash') : t('col.modified')}</th>
            <th scope="col" className="w-12 pr-3"><span className="sr-only">{t('col.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={p.id} className="group border-b border-line last:border-0 transition-colors hover:bg-surface-2/70 animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              <td className="py-3 pl-5 pr-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="hidden w-[34px] shrink-0 justify-center sm:flex"><MiniPaper name={p.name} /></div>
                  <div className="min-w-0">
                    {trash ? (
                      <span className="block truncate text-sm font-medium text-fg-2">{p.name}</span>
                    ) : (
                      <Link href={`/proyecto/${p.id}`} className="block truncate rounded-sm text-sm font-medium text-fg underline-offset-4 hover:underline">{p.name}</Link>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <TagChips project={p} tags={tags} />
                      {p.archived && <Badge size="sm">{t('archived')}</Badge>}
                    </div>
                  </div>
                </div>
              </td>
              <td className="hidden px-3 text-[13px] text-fg-2 md:table-cell">{p.role === 'owner' ? c('you') : p.owner.name}</td>
              <td className="hidden px-3 lg:table-cell"><AvatarStack people={people(p)} size="xs" /></td>
              <td className="hidden px-3 sm:table-cell"><RoleBadge role={p.role} /></td>
              <td className="whitespace-nowrap px-3 text-[13px] text-fg-2 tabular">
                {trash && p.trashedAt ? <span className="text-warn">{t('trash.purgeIn', { n: daysUntil(p.trashedAt, 30) })}</span> : relativeTime(p.lastActivityAt)}
              </td>
              <td className="pr-3 text-right"><ProjectActions project={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vista de cuadrícula: cada proyecto como una hoja con su propia composición. */
export function ProjectGrid({ items, tags, trash }: { readonly items: readonly Project[]; readonly tags: ReadonlyMap<string, Tag>; readonly trash: boolean }) {
  const c = getT('common');
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((p, i) => (
        <li key={p.id} className="group animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
          <div className="bezel transition-transform duration-[var(--dur-panel)] ease-[var(--ease-out)] hover:-translate-y-0.5">
            <div className="bezel-core overflow-hidden">
              <Link href={trash ? '#' : `/proyecto/${p.id}`} aria-disabled={trash} tabIndex={trash ? -1 : 0} className="relative block bg-sunken/60 px-8 pt-6">
                <PaperThumb name={p.name} className="mx-auto max-w-[180px] translate-y-1 transition-transform duration-[var(--dur-panel)] ease-[var(--ease-out)] group-hover:translate-y-0 group-hover:rotate-[-0.6deg]" />
                <span className="absolute left-3 top-3"><RoleBadge role={p.role} /></span>
                <span className="sr-only">{p.name}</span>
              </Link>
              <div className="flex items-start gap-2 border-t border-line p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{p.name}</p>
                  <p className="mt-0.5 text-xs text-fg-3">{p.role === 'owner' ? c('you') : p.owner.name} · {relativeTime(p.lastActivityAt)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <AvatarStack people={people(p)} size="xs" />
                    <TagChips project={p} tags={tags} />
                  </div>
                </div>
                <ProjectActions project={p} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
