'use client';

import { BookOpen, Check, FileText, FlaskConical, GraduationCap, Presentation } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useCreateProject } from '@/shared/api/projects';
import type { CompilerEngine } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { TEMPLATES, type TemplateId, type TemplateKind } from '@/shared/templates';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { toast } from '@/shared/ui/toast';

const ICONS: Record<TemplateKind, ReactNode> = {
  blank: <FileText />, thesis: <GraduationCap />, article: <BookOpen />, report: <FlaskConical />, slides: <Presentation />,
};

/** P-10 · nuevo proyecto: en blanco o desde una de las plantillas del catálogo. */
export function NewProjectDialog({ open, onOpenChange, canCreate }: {
  readonly open: boolean;
  readonly onOpenChange: (o: boolean) => void;
  readonly canCreate: boolean;
}) {
  const t = getT('projects');
  const c = getT('common');
  const router = useRouter();
  const create = useCreateProject();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<TemplateId>('blank');
  const [compiler, setCompiler] = useState<CompilerEngine>('pdflatex');
  const [error, setError] = useState<string>();

  const pick = (id: TemplateId) => {
    setTemplate(id);
    setCompiler(TEMPLATES.find((x) => x.id === id)?.compiler ?? 'pdflatex');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ name, compiler, template }, {
      onSuccess: (p) => { toast.success(t('toast.created')); onOpenChange(false); router.push(`/proyecto/${p.id}`); },
      onError: (err) => setError(isApiError(err) ? (err.fields['name'] ?? err.message) : undefined),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('newDialog.title')} description={t('newDialog.description')} width="lg">
      <form onSubmit={onSubmit} className="grid gap-5 pb-2">
        {!canCreate && <Notice tone="warn">{t('newDialog.unverified')}</Notice>}
        <Field label={t('newDialog.name')} error={error}>
          {(a) => <Input {...a} autoFocus maxLength={120} placeholder={t('newDialog.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <fieldset>
          <legend className="mb-2 flex w-full items-baseline justify-between text-[13px] font-medium text-fg">
            {t('newDialog.start')}
            <Link href="/plantillas" className="text-xs font-normal text-brand hover:underline">{t('newDialog.gallery')}</Link>
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup">
            {TEMPLATES.map((tpl) => (
              <StartOption key={tpl.id} active={template === tpl.id} onSelect={() => pick(tpl.id)} icon={ICONS[tpl.kind]} title={tpl.name} hint={tpl.files.length === 1 ? tpl.files[0] ?? '' : `${tpl.files.length} archivos · ${tpl.packages.slice(0, 3).join(', ')}`} />
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('newDialog.compiler')}>
            {(a) => <Select {...a} value={compiler} onValueChange={setCompiler} options={[{ value: 'pdflatex', label: 'pdfLaTeX' }, { value: 'xelatex', label: 'XeLaTeX' }, { value: 'lualatex', label: 'LuaLaTeX' }]} />}
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => onOpenChange(false)}>{c('cancel')}</Button>
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!canCreate}>{t('newDialog.submit')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function StartOption({ active, onSelect, icon, title, hint }: {
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly icon: ReactNode;
  readonly title: string;
  readonly hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'relative flex items-start gap-3 rounded-[11px] p-3 text-left transition-[box-shadow,background-color] duration-[var(--dur-micro)]',
        active ? 'bg-brand-soft shadow-[inset_0_0_0_1.5px_var(--brand)]' : 'shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-surface-2',
      )}
    >
      <span className={cn('mt-0.5 [&>svg]:size-[18px] [&>svg]:stroke-[1.5]', active ? 'text-brand' : 'text-fg-3')} aria-hidden="true">{icon}</span>
      <span className="min-w-0 pr-4">
        <span className="block text-[13px] font-medium text-fg">{title}</span>
        <span className="block truncate font-mono text-[11px] text-fg-3">{hint}</span>
      </span>
      {active && <Check className="absolute right-2.5 top-2.5 size-3.5 text-brand" strokeWidth={2.5} aria-hidden="true" />}
    </button>
  );
}
