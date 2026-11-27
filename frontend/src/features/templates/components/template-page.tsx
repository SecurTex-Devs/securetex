'use client';

import { ArrowLeft, FileText, FolderTree, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useCreateProject } from '@/shared/api/projects';
import { useMe } from '@/shared/api/session';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { TEMPLATE_CATEGORIES, TEMPLATES, templateById, type Template, type TemplateKind } from '@/shared/templates';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/field';
import { EmptyState } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';

const ENGINE = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX' } as const;

function Sheet({ t, large = false }: { readonly t: Template; readonly large?: boolean }) {
  const ratio: Record<TemplateKind, string> = { slides: 'aspect-[16/10]', thesis: 'aspect-[3/4]', article: 'aspect-[3/4]', report: 'aspect-[3/4]', blank: 'aspect-[3/4]' };
  return (
    <div className={cn('paper relative mx-auto flex flex-col overflow-hidden rounded-[3px] font-serif', ratio[t.kind], large ? 'w-full max-w-[420px] p-10' : 'w-[72%] p-5')}>
      <span className={cn('absolute inset-x-0 top-0 h-1.5', t.accent)} aria-hidden="true" />
      {t.kind === 'thesis' && <span className={cn('text-center uppercase tracking-[0.2em] text-[#8a8270]', large ? 'text-[10px]' : 'text-[6px]')}>Universidad Técnica de Ambato</span>}
      <p className={cn('font-medium leading-tight text-[#1d1b17]', t.kind === 'article' || t.kind === 'report' || t.kind === 'blank' ? 'text-center' : '', t.kind === 'thesis' ? 'mt-auto text-center' : 'mt-2', large ? 'text-[22px]' : 'text-[11px]')}>{t.name}</p>
      <div className={cn('mt-3 grid gap-[3px]', t.kind === 'article' ? 'grid-cols-2 gap-x-2' : '', t.kind === 'thesis' ? 'mb-auto mt-auto' : '')} aria-hidden="true">
        {Array.from({ length: t.kind === 'slides' ? 3 : t.kind === 'blank' ? 4 : 10 }, (_, i) => <span key={i} className="h-[2px] rounded-full bg-[#2a261e]/12" style={{ width: `${70 + ((i * 13) % 30)}%` }} />)}
      </div>
    </div>
  );
}

/** P-35 · galería de plantillas (F-205, F-209). Pública; el catálogo lo mantiene el equipo. */
export function TemplateGallery() {
  const t = getT('templates');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const items = useMemo(() => TEMPLATES.filter((x) => (!cat || x.category === cat) && x.name.toLowerCase().includes(q.trim().toLowerCase())), [q, cat]);
  return (
    <main id="contenido" className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
      <header className="mb-8 animate-rise">
        <p className="eyebrow mb-3">{t('title')}</p>
        <h1 className="font-serif text-[40px] font-medium leading-none tracking-[-0.025em] text-fg">{t('title')}</h1>
        <p className="mt-3 max-w-[62ch] text-sm text-fg-2">{t('subtitle')}</p>
      </header>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[320px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
          <Input type="search" aria-label={t('search')} placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('title')}>
          {[null, ...TEMPLATE_CATEGORIES].map((c) => (
            <button key={c ?? 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
              className={cn('h-8 rounded-full px-3.5 text-[13px] transition-colors', cat === c ? 'bg-fg text-bg' : 'bg-surface text-fg-2 shadow-[inset_0_0_0_1px_var(--border)] hover:text-fg')}>
              {c ?? t('all')}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? <EmptyState title={t('empty')} /> : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((tpl, i) => (
            <li key={tpl.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Link href={`/plantillas/${tpl.id}`} className="group block">
                <div className="bezel transition-transform duration-[var(--dur-panel)] ease-[var(--ease-out)] group-hover:-translate-y-0.5">
                  <div className="bezel-core overflow-hidden">
                    <div className="bg-sunken/60 px-6 pb-0 pt-6"><div className="translate-y-1 transition-transform duration-[var(--dur-panel)] group-hover:translate-y-0"><Sheet t={tpl} /></div></div>
                    <div className="border-t border-line p-4">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-fg">{tpl.name}</p>
                        <ShieldCheck className="size-3.5 shrink-0 text-ok" strokeWidth={2} aria-label={t('verified')} />
                      </div>
                      <p className="mt-0.5 text-xs text-fg-3">{tpl.category} · {ENGINE[tpl.compiler]} · {t('nFiles', { n: tpl.files.length })}</p>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** P-36 · ficha de plantilla. «Usar plantilla» crea en la API un proyecto con sus archivos cifrados. */
export function TemplateDetail({ id }: { readonly id: string }) {
  const t = getT('templates');
  const router = useRouter();
  const me = useMe({ silent401: true });
  const create = useCreateProject();
  const tpl = templateById(id);
  if (!tpl) return <EmptyState title={getT('states')('notFound.title')} action={<Button asChild><Link href="/plantillas">{t('back')}</Link></Button>} />;
  const use = () => {
    if (!me.data) { router.push(`/entrar?next=${encodeURIComponent(`/plantillas/${id}`)}`); return; }
    if (me.data.isDemo) { router.push('/registro'); return; }
    create.mutate({ name: tpl.name, template: tpl.id, compiler: tpl.compiler }, {
      onSuccess: (p) => { toast.success(t('created')); router.push(`/proyecto/${p.id}`); },
      onError: (e) => toast.error(isApiError(e) ? e.message : getT('states')('error.title')),
    });
  };
  return (
    <main id="contenido" className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Link href="/plantillas" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-fg-2 hover:text-fg"><ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />{t('back')}</Link>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="bezel animate-rise"><div className="bezel-core bg-sunken/60 p-10"><Sheet t={tpl} large /></div></div>
        <div className="animate-rise [animation-delay:80ms]">
          <Badge tone="brand">{tpl.category}</Badge>
          <h1 className="mt-4 font-serif text-[40px] font-medium leading-[1.05] tracking-[-0.025em] text-fg">{tpl.name}</h1>
          <p className="mt-2 text-sm text-fg-3">{t('by')}</p>
          <p className="mt-6 text-[15px] leading-relaxed text-fg-2">{tpl.description}</p>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-[13px]">
            <div><dt className="text-fg-3">{t('engine')}</dt><dd className="mt-0.5 font-medium text-fg">{ENGINE[tpl.compiler]}</dd></div>
            <div><dt className="text-fg-3">{t('packages')}</dt><dd className="mt-1.5 flex flex-wrap gap-1.5">{tpl.packages.map((p) => <code key={p} className="rounded-[6px] bg-surface-2 px-2 py-0.5 font-mono text-xs text-fg shadow-[inset_0_0_0_1px_var(--border)]">{p}</code>)}</dd></div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1.5 text-fg-3"><FolderTree className="size-3.5" strokeWidth={1.75} aria-hidden="true" />{t('files')}</dt>
              <dd className="mt-2 grid gap-1 rounded-[10px] bg-surface-2 p-3 shadow-[inset_0_0_0_1px_var(--border)]">
                {tpl.files.map((f) => (
                  <span key={f} className="flex items-center gap-2 font-mono text-xs text-fg"><FileText className="size-3.5 text-fg-3" strokeWidth={1.5} aria-hidden="true" />{f}</span>
                ))}
              </dd>
              <p className="mt-1.5 text-xs text-fg-3">{t('filesHint')}</p>
            </div>
          </dl>
          <div className="mt-6 flex items-start gap-3 rounded-[12px] bg-ok-soft p-4 text-[13px] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ok)_25%,transparent)]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={1.75} aria-hidden="true" />
            <span><span className="font-medium text-fg">{t('verified')}.</span> <span className="text-fg-2">{t('verifiedHint')}</span></span>
          </div>
          <Button variant="primary" size="lg" className="mt-8 w-full sm:w-auto" loading={create.isPending} onClick={use}>{t('use')}</Button>
        </div>
      </div>
    </main>
  );
}
