'use client';

import { Settings2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useProjectLifecycle, useUpdateProject } from '@/shared/api/projects';
import type { CompilerEngine, Project } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { fileSize } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Select, Switch } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/dialog';
import { Field } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { toast } from '@/shared/ui/toast';
import { useEditor } from '../store';

/** Cuota por proyecto que aplica el servidor (FILES.MAX_PROJECT_BYTES). */
const PROJECT_QUOTA = 20_000_000;

/** P-25 · ajustes. Compilador y documento principal se guardan en la API. */
export function SettingsDialog({ project, open, onOpenChange }: { readonly project: Project; readonly open: boolean; readonly onOpenChange: (o: boolean) => void }) {
  const t = getT('settings');
  const p = getT('projects');
  const router = useRouter();
  const update = useUpdateProject(project.id);
  const lifecycle = useProjectLifecycle();
  const entries = useEditor((s) => s.entries);
  const mainFile = useEditor((s) => s.mainFile);
  const autoCompile = useEditor((s) => s.autoCompile);
  const setAutoCompile = useEditor((s) => s.setAutoCompile);
  const canEdit = project.allowedActions.includes('change_settings');
  const texFiles = useMemo(() => Object.keys(entries).filter((f) => f.endsWith('.tex')).sort(), [entries]);
  const used = useMemo(() => Object.values(entries).reduce((sum, f) => sum + f.size, 0), [entries]);
  const fail = (e: unknown) => toast.error(isApiError(e) ? e.message : getT('states')('error.title'));

  const setCompiler = (compiler: CompilerEngine) => update.mutate({ compiler }, { onSuccess: () => toast.success(t('saved')), onError: fail });
  const setMain = (path: string) => useEditor.getState().setMain(path).then(() => toast.success(t('saved')), fail);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} width="lg" title={t('title')} icon={<Settings2 className="size-[18px]" strokeWidth={1.5} />}>
      {!canEdit && <Notice tone="info" className="mb-4">{t('onlyEditors')}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('compiler')} hint={t('compilerHint')}>
          {(a) => <Select {...a} disabled={!canEdit} value={project.compiler} onValueChange={setCompiler} options={[{ value: 'pdflatex', label: 'pdfLaTeX' }, { value: 'xelatex', label: 'XeLaTeX' }, { value: 'lualatex', label: 'LuaLaTeX' }]} />}
        </Field>
        <Field label={t('main')} hint={t('mainHint')}>
          {(a) => <Select {...a} disabled={!canEdit} value={mainFile} onValueChange={(v) => void setMain(v)} options={texFiles.map((f) => ({ value: f, label: f }))} />}
        </Field>
      </div>

      <ul className="mt-5 grid divide-y divide-line rounded-[12px] shadow-[inset_0_0_0_1px_var(--border)]">
        <li className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-fg">{t('auto')}</p>
            <p className="mt-0.5 text-xs leading-snug text-fg-3">{t('autoHint')}</p>
          </div>
          <Switch label={t('auto')} checked={autoCompile} onCheckedChange={setAutoCompile} />
        </li>
      </ul>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs text-fg-3">
          <span>{t('storage', { used: fileSize(used), total: fileSize(PROJECT_QUOTA) })}</span>
          <span className="tabular">{Math.max(used > 0 ? 1 : 0, Math.round((used / PROJECT_QUOTA) * 100))} %</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          <div className="h-full rounded-full bg-sec" style={{ width: `${Math.max(1, Math.min(100, (used / PROJECT_QUOTA) * 100))}%` }} />
        </div>
      </div>

      {project.allowedActions.includes('trash') && (
        <div className="mt-5 flex items-center justify-between rounded-[12px] bg-danger-soft/60 p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_20%,transparent)]">
          <span className="text-[13px] font-medium text-fg">{t('danger')}</span>
          <Button size="sm" variant="danger" leading={<Trash2 className="size-3.5" strokeWidth={1.75} />}
            onClick={() => lifecycle.mutate({ id: project.id, action: 'trash' }, { onSuccess: () => { toast.success(p('toast.trashed'), p('toast.trashedHint')); router.push('/proyectos'); } })}>
            {t('trash')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
