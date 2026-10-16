'use client';

import { FileText, FolderSearch, LayoutGrid, LayoutTemplate, List, MailOpen, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useProjects, useReceivedInvitations, useRespondInvitation, useTags } from '@/shared/api/projects';
import { useMe } from '@/shared/api/session';
import type { ProjectSort } from '@/shared/api/projects';
import type { Tag } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { relativeTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Segmented, Select } from '@/shared/ui/controls';
import { Input } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';
import { useMounted } from '@/shared/hooks/use-mounted';
import { useProjectParams } from '../use-project-params';
import { NewProjectDialog } from './new-project-dialog';
import { ProjectGrid, ProjectTable } from './project-collection';
import { ProjectsSidebar } from './projects-sidebar';
import { TagsDialog } from './tags-dialog';

function greetingKey(): 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening' {
  const h = new Date().getHours();
  return h < 12 ? 'greeting.morning' : h < 19 ? 'greeting.afternoon' : 'greeting.evening';
}

/** P-08 · P-09 · P-13 · panel principal tras iniciar sesión. */
export function ProjectsPage() {
  const t = getT('projects');
  const { list, view, q, tag, update } = useProjectParams();
  // Los datos solo se usan tras hidratar: otro componente (la barra superior)
  // puede haberlos cargado ya y el HTML del servidor no los tenía.
  const mounted = useMounted();
  const meQuery = useMe();
  const projectsQuery = useProjects(list);
  const tagsQuery = useTags();
  const me = { data: mounted ? meQuery.data : undefined };
  const projects = { ...projectsQuery, data: mounted ? projectsQuery.data : undefined, isLoading: !mounted || projectsQuery.isLoading };
  const tags = { data: mounted ? tagsQuery.data : undefined };
  const [dialog, setDialog] = useState<'new' | 'tags' | null>(null);
  const [search, setSearch] = useState(q);
  const tagMap = useMemo(() => new Map<string, Tag>((tags.data ?? []).map((tg) => [tg.id, tg])), [tags.data]);
  const canCreate = me.data?.emailVerified === true;

  // La búsqueda escribe en la URL con un pequeño retardo: compartible y sin una petición por tecla.
  useEffect(() => {
    const id = window.setTimeout(() => { if (search !== q) update({ q: search || null }); }, 250);
    return () => window.clearTimeout(id);
  }, [search, q, update]);

  const firstName = me.data?.firstName || me.data?.primaryEmail.split('@')[0] || '';
  const counts = projects.data?.counts;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] gap-8 px-4 py-8 sm:px-6 lg:py-10">
      <ProjectsSidebar
        filter={list.filter} tag={tag} counts={counts} tags={tags.data} mfaEnabled={me.data?.mfa.totpEnabled === true} canCreate={canCreate}
        onFilter={(f) => update({ filtro: f === 'all' ? null : f, etiqueta: null })}
        onTag={(id) => update({ etiqueta: id })}
        onNew={() => setDialog('new')}
        onManageTags={() => setDialog('tags')}
      />

      <main id="contenido" className="min-w-0 flex-1">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="animate-rise">
            <p className="eyebrow mb-3">{t('title')}</p>
            <h1 className="font-serif text-[40px] font-medium leading-none tracking-[-0.025em] text-fg">
              {firstName ? t(greetingKey(), { name: firstName }) : t('title')}
            </h1>
            {counts && <p className="mt-2.5 text-sm text-fg-2">{t('summary', { n: counts.all, shared: counts.shared })}</p>}
          </div>
          <Button variant="primary" className="lg:hidden" leading={<Plus className="size-4" strokeWidth={2} />} onClick={() => setDialog('new')} disabled={!canCreate}>{t('new')}</Button>
        </header>

        {me.data?.emailVerified && <Invitations />}

        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
            <Input type="search" aria-label={t('toolbar.search')} placeholder={t('toolbar.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="w-[230px]">
            <Select<ProjectSort> label={t('toolbar.sort')} value={list.sort} onValueChange={(v) => update({ orden: v === '-lastActivity' ? null : v })}
              options={(['-lastActivity', 'lastActivity', 'name', '-name'] as const).map((s) => ({ value: s, label: t(`sort.${s}`) }))} />
          </div>
          <Segmented label={t('toolbar.view')} value={view} onValueChange={(v) => update({ vista: v === 'grid' ? 'cuadricula' : null })}
            options={[{ value: 'list', label: '', icon: <List className="size-4" strokeWidth={1.5} />, title: t('view.list') }, { value: 'grid', label: '', icon: <LayoutGrid className="size-4" strokeWidth={1.5} />, title: t('view.grid') }]} />
        </div>

        {list.filter === 'trash' && (
          <Notice tone="warn" icon={<Trash2 strokeWidth={1.75} />} title={t('trash.banner')} className="mb-4">{t('trash.bannerBody')}</Notice>
        )}

        <section aria-busy={projects.isLoading} aria-label={t('title')}>
          {projects.isLoading ? <ProjectsSkeleton /> : projects.error ? <ErrorState error={projects.error} onRetry={() => void projectsQuery.refetch()} /> : projects.data && projects.data.items.length === 0 ? (
            <ProjectsEmpty filter={list.filter} searching={Boolean(q || tag)} canCreate={canCreate} onNew={() => setDialog('new')} />
          ) : projects.data ? (
            <>
              <p className="mb-2.5 text-xs text-fg-3 tabular" aria-live="polite">{t('count', { n: projects.data.items.length })}</p>
              {view === 'grid'
                ? <ProjectGrid items={projects.data.items} tags={tagMap} trash={list.filter === 'trash'} />
                : <ProjectTable items={projects.data.items} tags={tagMap} trash={list.filter === 'trash'} />}
            </>
          ) : null}
        </section>
      </main>

      <NewProjectDialog open={dialog === 'new'} onOpenChange={(o) => setDialog(o ? 'new' : null)} canCreate={canCreate} />
      <TagsDialog open={dialog === 'tags'} onOpenChange={(o) => setDialog(o ? 'tags' : null)} />
    </div>
  );
}

function Invitations() {
  const t = getT('projects');
  const c = getT('common');
  const { data } = useReceivedInvitations();
  const respond = useRespondInvitation();
  if (!data?.length) return null;
  return (
    <section aria-labelledby="inv-title" className="mb-6 animate-rise">
      <h2 id="inv-title" className="mb-2.5 flex items-center gap-2 text-[13px] font-medium text-fg">
        <MailOpen className="size-4 text-brand" strokeWidth={1.5} aria-hidden="true" />{t('invites.title')}
      </h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {data.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 rounded-[12px] bg-surface p-3.5 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--brand-line)]">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg">{t('invites.body', { name: inv.project.name, role: c(`roles.${inv.role}`) })}</p>
              <p className="mt-0.5 text-xs text-fg-3">{t('invites.expires', { when: relativeTime(inv.createdAt) })}</p>
            </div>
            <Button size="sm" onClick={() => respond.mutate({ id: inv.id, accept: false }, { onSuccess: () => toast.info(t('invites.declined')) })}>{t('invites.decline')}</Button>
            <Button size="sm" variant="ink" onClick={() => respond.mutate({ id: inv.id, accept: true }, { onSuccess: () => toast.success(t('invites.accepted')) })}>{t('invites.accept')}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="card overflow-hidden" role="status" aria-label={getT('common')('loading')}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
          <Skeleton className="h-10 w-8" />
          <div className="grid flex-1 gap-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-2.5 w-1/6" /></div>
          <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

function ProjectsEmpty({ filter, searching, canCreate, onNew }: {
  readonly filter: string;
  readonly searching: boolean;
  readonly canCreate: boolean;
  readonly onNew: () => void;
}) {
  const t = getT('projects');
  if (searching) return <EmptyState icon={<FolderSearch strokeWidth={1.5} />} title={t('empty.filtered')} description={t('empty.filteredBody')} />;
  if (filter === 'trash') return <EmptyState icon={<Trash2 strokeWidth={1.5} />} title={t('empty.trash')} description={t('empty.trashBody')} />;
  if (filter === 'archived') return <EmptyState title={t('empty.archived')} description={t('empty.archivedBody')} />;
  if (filter === 'shared') return <EmptyState title={t('empty.shared')} description={t('empty.sharedBody')} />;
  const options = [
    { icon: FileText, title: t('empty.blank'), hint: t('empty.blankHint'), onClick: onNew },
    { icon: LayoutTemplate, title: t('empty.template'), hint: t('empty.templateHint'), href: '/plantillas' },
  ];
  return (
    <div className="bezel">
      <div className="bezel-core px-6 py-14 text-center">
        <h2 className="font-serif text-[30px] font-medium tracking-[-0.02em] text-fg">{t('empty.title')}</h2>
        <p className="mx-auto mt-2 max-w-[46ch] text-sm text-fg-2">{t('empty.body')}</p>
        <ul className="mx-auto mt-9 grid max-w-[520px] gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const inner = (
              <>
                <span className="grid size-10 place-items-center rounded-[11px] bg-brand-soft text-brand"><o.icon className="size-5" strokeWidth={1.5} aria-hidden="true" /></span>
                <span className="mt-4 block text-sm font-medium text-fg">{o.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-3">{o.hint}</span>
              </>
            );
            const cls = 'group block h-full rounded-[14px] bg-surface-2 p-5 text-left shadow-[inset_0_0_0_1px_var(--border)] transition-[transform,box-shadow] duration-[var(--dur-panel)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card),inset_0_0_0_1px_var(--brand-line)] disabled:opacity-50';
            return (
              <li key={o.title}>
                {o.href ? <Link href={o.href} className={cls}>{inner}</Link> : <button type="button" className={cls} onClick={o.onClick} disabled={!canCreate}>{inner}</button>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
