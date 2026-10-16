'use client';

import { Archive, ArchiveRestore, ExternalLink, LogOut, MoreHorizontal, PencilLine, RotateCcw, Tags, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useDeleteProject, useLeaveProject, useProjectLifecycle, useSetProjectTags, useTags, useUpdateProject } from '@/shared/api/projects';
import type { Project } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button, IconButton } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/controls';
import { ConfirmDialog, Dialog } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/field';
import { Menu, MenuItem, MenuSeparator } from '@/shared/ui/menu';
import { toast } from '@/shared/ui/toast';
import { TAG_DOT } from './tag-colors';

type Open = 'rename' | 'tags' | 'delete' | 'leave' | null;

/**
 * Menú de acciones de un proyecto. Las opciones se ocultan según
 * `allowedActions`, que es CORTESÍA VISUAL: el servidor vuelve a decidir en
 * cada petición y RLS lo repite en la base de datos (AGENTS.md §0).
 */
export function ProjectActions({ project }: { readonly project: Project }) {
  const t = getT('projects');
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const lifecycle = useProjectLifecycle();
  const can = (a: string) => project.allowedActions.includes(a);
  const trashed = project.trashedAt !== null;

  const run = (action: 'archive' | 'unarchive' | 'trash' | 'restore', ok: string, hint?: string) =>
    lifecycle.mutate({ id: project.id, action }, {
      onSuccess: () => toast.success(ok, hint),
      onError: (e) => toast.error(isApiError(e) ? e.message : getT('states')('error.title')),
    });

  return (
    <>
      <Menu
        label={t('actions.menu', { name: project.name })}
        trigger={<IconButton size="sm" label={t('actions.menu', { name: project.name })} icon={<MoreHorizontal className="size-4" strokeWidth={1.75} />} />}
      >
        {trashed ? (
          <>
            <MenuItem icon={<RotateCcw strokeWidth={1.5} />} onSelect={() => run('restore', t('toast.restored'))}>{t('actions.restore')}</MenuItem>
            <MenuItem icon={<Trash2 strokeWidth={1.5} />} tone="danger" onSelect={() => setOpen('delete')}>{t('actions.deleteForever')}</MenuItem>
          </>
        ) : (
          <>
            <MenuItem icon={<ExternalLink strokeWidth={1.5} />} onSelect={() => router.push(`/proyecto/${project.id}`)}>{t('actions.open')}</MenuItem>
            {can('rename') && <MenuItem icon={<PencilLine strokeWidth={1.5} />} onSelect={() => setOpen('rename')}>{t('actions.rename')}</MenuItem>}
            <MenuItem icon={<Tags strokeWidth={1.5} />} onSelect={() => setOpen('tags')}>{t('actions.tags')}</MenuItem>
            {can('archive') && (
              project.archived
                ? <MenuItem icon={<ArchiveRestore strokeWidth={1.5} />} onSelect={() => run('unarchive', t('toast.unarchived'))}>{t('actions.unarchive')}</MenuItem>
                : <MenuItem icon={<Archive strokeWidth={1.5} />} onSelect={() => run('archive', t('toast.archived'))}>{t('actions.archive')}</MenuItem>
            )}
            {(can('trash') || can('leave')) && <MenuSeparator />}
            {can('trash') && <MenuItem icon={<Trash2 strokeWidth={1.5} />} tone="danger" onSelect={() => run('trash', t('toast.trashed'), t('toast.trashedHint'))}>{t('actions.trash')}</MenuItem>}
            {can('leave') && <MenuItem icon={<LogOut strokeWidth={1.5} />} tone="danger" onSelect={() => setOpen('leave')}>{t('actions.leave')}</MenuItem>}
          </>
        )}
      </Menu>
      {open === 'rename' && <RenameDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'tags' && <TagsAssignDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'delete' && <DeleteForeverDialog project={project} onClose={() => setOpen(null)} />}
      {open === 'leave' && <LeaveDialog project={project} onClose={() => setOpen(null)} />}
    </>
  );
}

function RenameDialog({ project, onClose }: { readonly project: Project; readonly onClose: () => void }) {
  const t = getT('projects');
  const c = getT('common');
  const update = useUpdateProject(project.id);
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string>();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ name }, {
      onSuccess: () => { toast.success(t('toast.renamed')); onClose(); },
      onError: (err) => setError(isApiError(err) ? (err.fields['name'] ?? err.message) : undefined),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('rename.title')} width="sm">
      <form id="rename-form" onSubmit={onSubmit}>
        <Field label={t('rename.label')} error={error}>
          {(a) => <Input {...a} autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>{c('cancel')}</Button>
          <Button type="submit" variant="primary" loading={update.isPending}>{t('rename.submit')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function TagsAssignDialog({ project, onClose }: { readonly project: Project; readonly onClose: () => void }) {
  const t = getT('projects');
  const c = getT('common');
  const { data: tags } = useTags();
  const setTags = useSetProjectTags();
  const [selected, setSelected] = useState<Set<string>>(new Set(project.tagIds));
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('tags.assign')} description={t('tags.private')} width="sm"
      footer={<><Button onClick={onClose}>{c('cancel')}</Button><Button variant="primary" loading={setTags.isPending} onClick={() => setTags.mutate({ id: project.id, tagIds: [...selected] }, { onSuccess: onClose })}>{c('save')}</Button></>}>
      {tags?.length ? (
        <ul className="grid gap-1">
          {tags.map((tg) => (
            <li key={tg.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2 py-2 hover:bg-surface-2">
                <Checkbox checked={selected.has(tg.id)} onCheckedChange={(v) => toggle(tg.id, v)} />
                <span aria-hidden="true" className={cn('size-2 rounded-full', TAG_DOT[tg.color])} />
                <span className="text-sm text-fg">{tg.name}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : <p className="py-2 text-sm text-fg-2">{t('tags.empty')}</p>}
    </Dialog>
  );
}

function DeleteForeverDialog({ project, onClose }: { readonly project: Project; readonly onClose: () => void }) {
  const t = getT('projects');
  const del = useDeleteProject();
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} destructive loading={del.isPending}
      title={t('delete.title', { name: project.name })} description={t('delete.body')} confirmLabel={t('delete.confirm')}
      onConfirm={() => del.mutate(project.id, { onSuccess: () => { toast.security(t('toast.deleted'), t('toast.deletedHint')); onClose(); } })} />
  );
}

function LeaveDialog({ project, onClose }: { readonly project: Project; readonly onClose: () => void }) {
  const t = getT('projects');
  const leave = useLeaveProject();
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} destructive loading={leave.isPending}
      title={t('leave.title', { name: project.name })} description={t('leave.body')} confirmLabel={t('leave.confirm')}
      onConfirm={() => leave.mutate(project.id, { onSuccess: () => { toast.success(t('toast.left')); onClose(); } })} />
  );
}
