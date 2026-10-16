'use client';

import { BookMarked, ChevronRight, Copy, Download, FileCode2, FilePlus2, FileText, Folder, FolderOpen, Lock, MoreHorizontal, PencilLine, Star, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { fileSize } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button, IconButton } from '@/shared/ui/button';
import { ConfirmDialog, Dialog } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/field';
import { Menu, MenuItem, MenuSeparator } from '@/shared/ui/menu';
import { toast } from '@/shared/ui/toast';
import { useEditor, type FileEntry, type FileKind } from '../store';

const ICON: Record<FileKind, typeof FileText> = { tex: FileText, bib: BookMarked, cls: FileCode2, sty: FileCode2, bst: FileCode2, txt: FileText };
const ICON_COLOR: Record<FileKind, string> = { tex: 'text-brand', bib: 'text-u2', cls: 'text-sec', sty: 'text-sec', bst: 'text-sec', txt: 'text-fg-3' };

interface Dir { readonly name: string; readonly path: string; readonly dirs: Map<string, Dir>; readonly files: FileEntry[] }

function buildTree(entries: readonly FileEntry[]): Dir {
  const root: Dir = { name: '', path: '', dirs: new Map(), files: [] };
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      const path = dir.path ? `${dir.path}/${part}` : part;
      let next = dir.dirs.get(part);
      if (!next) { next = { name: part, path, dirs: new Map(), files: [] }; dir.dirs.set(part, next); }
      dir = next;
    }
    dir.files.push(entry);
  }
  return root;
}

const byName = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path, 'es');
const baseName = (path: string) => path.split('/').pop() ?? path;

type DialogState =
  | { readonly kind: 'create'; readonly folder: string }
  | { readonly kind: 'rename'; readonly path: string }
  | { readonly kind: 'delete'; readonly path: string }
  | null;

/**
 * P-15 · árbol de archivos del servidor. Las acciones que el rol no permite
 * se ocultan (cortesía visual): el servidor y RLS deciden de verdad.
 */
export function FileTree({ canEdit }: { readonly canEdit: boolean }) {
  const t = getT('editor');
  const entries = useEditor((s) => s.entries);
  const list = useMemo(() => Object.values(entries), [entries]);
  const tree = useMemo(() => buildTree(list), [list]);
  const total = list.reduce((sum, f) => sum + f.size, 0);
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{t('files.title')}</h2>
        {canEdit && (
          <IconButton size="sm" label={t('files.newFile')} icon={<FilePlus2 className="size-[15px]" strokeWidth={1.5} />} onClick={() => setDialog({ kind: 'create', folder: '' })} />
        )}
      </div>
      <ul role="tree" aria-label={t('files.label')} className="min-h-0 flex-1 overflow-y-auto px-2 py-2 text-[13px]">
        <DirChildren dir={tree} depth={0} canEdit={canEdit} onDialog={setDialog} />
      </ul>
      <p className="flex shrink-0 items-center gap-1.5 border-t border-line px-4 py-2.5 text-[11.5px] text-fg-3">
        <Lock className="size-3 text-sec" strokeWidth={2} aria-hidden="true" />
        {t('files.footer', { n: list.length, size: fileSize(total) })}
      </p>
      <FileDialogs state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function DirChildren({ dir, depth, canEdit, onDialog }: {
  readonly dir: Dir; readonly depth: number; readonly canEdit: boolean; readonly onDialog: (d: DialogState) => void;
}) {
  return (
    <>
      {[...dir.dirs.values()].sort(byName).map((d) => <FolderNode key={d.path} dir={d} depth={depth} canEdit={canEdit} onDialog={onDialog} />)}
      {[...dir.files].sort(byName).map((f) => <FileNode key={f.id} file={f} depth={depth} canEdit={canEdit} onDialog={onDialog} />)}
    </>
  );
}

function FolderNode({ dir, depth, canEdit, onDialog }: {
  readonly dir: Dir; readonly depth: number; readonly canEdit: boolean; readonly onDialog: (d: DialogState) => void;
}) {
  const t = getT('editor');
  const [open, setOpen] = useState(true);
  return (
    <li role="treeitem" aria-expanded={open} aria-selected={false}>
      <div className="group flex items-center">
        <button type="button" onClick={() => setOpen(!open)} className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] pr-1 text-fg-2 hover:bg-surface-3/70 hover:text-fg" style={{ paddingLeft: `${6 + depth * 16}px` }}>
          <ChevronRight className={cn('size-3.5 shrink-0 text-fg-3 transition-transform duration-[var(--dur-micro)]', open && 'rotate-90')} strokeWidth={1.75} aria-hidden="true" />
          {open ? <FolderOpen className="size-4 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" /> : <Folder className="size-4 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />}
          <span className="truncate">{dir.name}</span>
        </button>
        {canEdit && (
          <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconButton size="sm" className="size-6" label={t('files.newInFolder', { folder: dir.name })} icon={<FilePlus2 className="size-3.5" strokeWidth={1.5} />} onClick={() => onDialog({ kind: 'create', folder: dir.path })} />
          </span>
        )}
      </div>
      {open && <ul role="group"><DirChildren dir={dir} depth={depth + 1} canEdit={canEdit} onDialog={onDialog} /></ul>}
    </li>
  );
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** «capitulos/intro.tex» → «capitulos/intro-copia.tex» (o -copia-2…) sin chocar con lo existente. */
function copyPath(path: string, taken: Readonly<Record<string, unknown>>): string {
  const dot = path.lastIndexOf('.');
  const stem = path.slice(0, dot);
  const ext = path.slice(dot);
  for (let i = 1; ; i += 1) {
    const candidate = `${stem}-copia${i > 1 ? `-${i}` : ''}${ext}`;
    if (!(candidate in taken)) return candidate;
  }
}

function FileNode({ file, depth, canEdit, onDialog }: {
  readonly file: FileEntry; readonly depth: number; readonly canEdit: boolean; readonly onDialog: (d: DialogState) => void;
}) {
  const t = getT('editor');
  const active = useEditor((s) => s.activeFile === file.path);
  const isMain = useEditor((s) => s.mainFile === file.path);
  const unsaved = useEditor((s) => file.path in s.unsaved);
  const open = useEditor((s) => s.open);
  const name = baseName(file.path);
  const Icon = ICON[file.kind];

  const run = (action: () => Promise<void>, success: string) => {
    action().then(() => toast.success(success), (e: unknown) => toast.error(isApiError(e) ? e.message : t('files.failed')));
  };
  const duplicate = () => {
    const s = useEditor.getState();
    const target = copyPath(file.path, s.entries);
    run(() => s.createFile(target, s.files[file.path] ?? ''), t('files.created', { name: baseName(target) }));
  };

  return (
    <li role="treeitem" aria-selected={active} className="group flex items-center">
      <button
        type="button"
        onClick={() => open(file.path)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[6px] pr-1 text-left transition-colors duration-[var(--dur-micro)]',
          active ? 'bg-brand-soft font-medium text-fg' : 'text-fg-2 hover:bg-surface-3/70 hover:text-fg',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <Icon className={cn('size-4 shrink-0', ICON_COLOR[file.kind])} strokeWidth={1.5} aria-hidden="true" />
        <span className="truncate">{name}</span>
        {unsaved && <span className="size-1.5 shrink-0 rounded-full bg-warn" title={t('files.unsaved')} aria-label={t('files.unsaved')} />}
        {isMain && <Badge size="sm" tone="brand" className="ml-auto">{t('files.main')}</Badge>}
      </button>
      <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Menu label={t('files.menu', { name })} trigger={<IconButton size="sm" className="size-6" label={t('files.menu', { name })} icon={<MoreHorizontal className="size-3.5" strokeWidth={1.75} />} />}>
          <MenuItem icon={<FileText strokeWidth={1.5} />} onSelect={() => open(file.path)}>{t('files.open')}</MenuItem>
          {canEdit && file.kind === 'tex' && !isMain && (
            <MenuItem icon={<Star strokeWidth={1.5} />} onSelect={() => run(() => useEditor.getState().setMain(file.path), t('files.mainSet', { name }))}>{t('files.setMain')}</MenuItem>
          )}
          {canEdit && !isMain && <MenuItem icon={<PencilLine strokeWidth={1.5} />} onSelect={() => onDialog({ kind: 'rename', path: file.path })}>{t('files.rename')}</MenuItem>}
          {canEdit && <MenuItem icon={<Copy strokeWidth={1.5} />} onSelect={duplicate}>{t('files.duplicate')}</MenuItem>}
          <MenuItem icon={<Download strokeWidth={1.5} />} onSelect={() => download(name, useEditor.getState().files[file.path] ?? '')}>{t('files.download')}</MenuItem>
          {canEdit && !isMain && (
            <>
              <MenuSeparator />
              <MenuItem icon={<Trash2 strokeWidth={1.5} />} tone="danger" onSelect={() => onDialog({ kind: 'delete', path: file.path })}>{t('files.delete')}</MenuItem>
            </>
          )}
        </Menu>
      </span>
    </li>
  );
}

function FileDialogs({ state, onClose }: { readonly state: DialogState; readonly onClose: () => void }) {
  const t = getT('editor');
  const [busy, setBusy] = useState(false);
  if (state?.kind === 'delete') {
    const name = baseName(state.path);
    const confirm = () => {
      setBusy(true);
      useEditor.getState().deleteFile(state.path).then(
        () => { toast.success(t('files.deleted', { name })); onClose(); },
        (e: unknown) => toast.error(isApiError(e) ? e.message : t('files.failed')),
      ).finally(() => setBusy(false));
    };
    return (
      <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={t('files.deleteTitle', { name })} description={t('files.deleteBody')} confirmLabel={t('files.delete')} destructive loading={busy} onConfirm={confirm} />
    );
  }
  return <PathDialog key={state ? `${state.kind}:${'path' in state ? state.path : state.folder}` : 'closed'} state={state} onClose={onClose} />;
}

function PathDialog({ state, onClose }: { readonly state: Exclude<DialogState, { kind: 'delete' }>; readonly onClose: () => void }) {
  const t = getT('editor');
  const c = getT('common');
  const initial = state?.kind === 'rename' ? state.path : state?.kind === 'create' ? (state.folder ? `${state.folder}/` : '') : '';
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const rename = state?.kind === 'rename';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!state) return;
    const path = value.trim();
    const s = useEditor.getState();
    setBusy(true);
    setError(undefined);
    const action = rename ? s.renameFile(state.path, path) : s.createFile(path, path.endsWith('.tex') ? `% ${baseName(path)}\n` : '');
    action.then(
      () => { toast.success(rename ? t('files.renamed', { name: baseName(path) }) : t('files.created', { name: baseName(path) })); onClose(); },
      (err: unknown) => setError(isApiError(err) ? (err.fields['path'] ?? err.message) : t('files.failed')),
    ).finally(() => setBusy(false));
  };

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(o) => !o && onClose()}
      width="sm"
      icon={rename ? <PencilLine className="size-4" strokeWidth={1.5} /> : <FilePlus2 className="size-4" strokeWidth={1.5} />}
      title={rename ? t('files.renameTitle', { name: baseName(initial) }) : t('files.newFile')}
    >
      <form onSubmit={onSubmit} className="grid gap-4 pb-2">
        <Field label={t('files.path')} hint={t('files.pathHint')} error={error}>
          {(a) => (
            <Input
              {...a}
              autoFocus
              maxLength={200}
              spellCheck={false}
              className="font-mono text-[13px]"
              placeholder="capitulos/conclusiones.tex"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{c('cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!value.trim() || value.trim() === initial}>{rename ? t('files.renameSubmit') : t('files.create')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
