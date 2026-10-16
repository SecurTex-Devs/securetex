'use client';

import { Braces, EyeOff, PencilLine, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useRawPreferences, useSavePreferencesPatch } from '@/shared/api/session';
import { getT } from '@/shared/i18n';
import { Button, IconButton } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, Textarea } from '@/shared/ui/field';
import { toast } from '@/shared/ui/toast';
import {
  BUILTIN_COMMANDS, COMMAND_GROUPS, effectiveCommands, MAX_CUSTOM_COMMANDS, MAX_TEMPLATE_LENGTH, previewTemplate, sanitizeCommands,
  type CommandPrefs, type LatexCommand,
} from '../lib/latex-commands';

const isBuiltin = (id: string) => BUILTIN_COMMANDS.some((b) => b.id === id);
const newId = () => `u-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

/**
 * Personalizar la paleta: editar la plantilla de cualquier comando, crear los
 * propios u ocultar los que no se usan. Se guarda en las preferencias de la
 * cuenta (cifradas en el servidor), así que sigue a la persona en cualquier equipo.
 */
export function CommandsDialog({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (o: boolean) => void }) {
  const t = getT('editor');
  const prefs = (useRawPreferences().data?.prefs ?? {}) as CommandPrefs;
  const save = useSavePreferencesPatch();
  const [editing, setEditing] = useState<LatexCommand | 'new' | null>(null);
  const custom = useMemo(() => sanitizeCommands(prefs.commands), [prefs.commands]);
  const hidden = useMemo(() => new Set(prefs.hiddenCommands ?? []), [prefs.hiddenCommands]);
  const visible = useMemo(() => effectiveCommands(prefs), [prefs]);

  const persist = (commands: readonly LatexCommand[], hiddenCommands: readonly string[], ok: string) =>
    save.mutate({ commands: commands.map(({ custom: _c, ...c }) => c), hiddenCommands }, {
      onSuccess: () => toast.success(ok),
      onError: (e) => toast.error(isApiError(e) ? e.message : t('files.failed')),
    });

  const upsert = (cmd: LatexCommand) => {
    const rest = custom.filter((c) => c.id !== cmd.id);
    if (rest.length >= MAX_CUSTOM_COMMANDS) return toast.error(t('commands.tooMany', { n: MAX_CUSTOM_COMMANDS }));
    persist([...rest, cmd], [...hidden].filter((h) => h !== cmd.id), t('commands.saved'));
    setEditing(null);
  };
  const remove = (cmd: LatexCommand) => {
    // Uno de serie no se borra: se oculta (y se puede restablecer).
    if (isBuiltin(cmd.id)) persist(custom.filter((c) => c.id !== cmd.id), [...hidden, cmd.id], t('commands.hidden'));
    else persist(custom.filter((c) => c.id !== cmd.id), [...hidden], t('commands.deleted'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} width="lg" title={t('commands.customizeTitle')} description={t('commands.customizeBody')} icon={<Braces className="size-[18px]" strokeWidth={1.5} />}
      footer={<>
        <Button variant="ghost" leading={<RotateCcw className="size-3.5" strokeWidth={1.75} />} disabled={custom.length === 0 && hidden.size === 0} onClick={() => persist([], [], t('commands.reset'))}>{t('commands.resetCta')}</Button>
        <Button variant="primary" leading={<Plus className="size-4" strokeWidth={2} />} onClick={() => setEditing('new')}>{t('commands.new')}</Button>
      </>}>
      {editing ? (
        <CommandForm initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSave={upsert} saving={save.isPending} />
      ) : (
        <ul className="grid max-h-[50vh] divide-y divide-line overflow-y-auto rounded-[12px] shadow-[inset_0_0_0_1px_var(--border)]">
          {visible.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-fg">{c.label} <span className="font-normal text-fg-3">· {c.group}{c.custom ? ` · ${t('commands.yours')}` : ''}</span></p>
                <code className="block truncate font-mono text-[11.5px] text-fg-3">{previewTemplate(c.template).replace(/\n/g, ' ⏎ ')}</code>
              </div>
              <IconButton size="sm" label={t('commands.edit', { name: c.label })} icon={<PencilLine className="size-3.5" strokeWidth={1.75} />} onClick={() => setEditing(c)} />
              <IconButton size="sm" className="text-danger" label={isBuiltin(c.id) ? t('commands.hide', { name: c.label }) : t('commands.delete', { name: c.label })}
                icon={isBuiltin(c.id) ? <EyeOff className="size-3.5" strokeWidth={1.75} /> : <Trash2 className="size-3.5" strokeWidth={1.75} />} onClick={() => remove(c)} />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function CommandForm({ initial, onCancel, onSave, saving }: {
  readonly initial: LatexCommand | null;
  readonly onCancel: () => void;
  readonly onSave: (c: LatexCommand) => void;
  readonly saving: boolean;
}) {
  const t = getT('editor');
  const c = getT('common');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [group, setGroup] = useState(initial?.group ?? 'Mis comandos');
  const [template, setTemplate] = useState(initial?.template ?? '\\comando{${texto}}');
  const valid = label.trim().length > 0 && template.trim().length > 0 && template.length <= MAX_TEMPLATE_LENGTH;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onSave({ id: initial?.id ?? newId(), label: label.trim().slice(0, 80), group: group.trim().slice(0, 40) || 'Mis comandos', template, custom: true });
  };
  return (
    <form onSubmit={submit} className="grid gap-4 pb-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('commands.label')}>{(a) => <Input {...a} autoFocus maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
        <Field label={t('commands.group')}>{(a) => <Input {...a} list="securtex-command-groups" maxLength={40} value={group} onChange={(e) => setGroup(e.target.value)} />}</Field>
        <datalist id="securtex-command-groups">{[...COMMAND_GROUPS, 'Mis comandos'].map((g) => <option key={g} value={g} />)}</datalist>
      </div>
      <Field label={t('commands.template')} hint={t('commands.templateHint')}>
        {(a) => <Textarea {...a} spellCheck={false} maxLength={MAX_TEMPLATE_LENGTH} rows={5} className="font-mono text-[12.5px]" value={template} onChange={(e) => setTemplate(e.target.value)} />}
      </Field>
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{t('commands.preview')}</p>
        <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-[8px] bg-sunken px-3 py-2 font-mono text-[12px] text-fg-2 shadow-[inset_0_0_0_1px_var(--border)]">{previewTemplate(template)}</pre>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{c('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={!valid} loading={saving}>{t('commands.save')}</Button>
      </div>
    </form>
  );
}
