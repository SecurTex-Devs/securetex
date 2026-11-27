import { ArrowRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { getT } from '@/shared/i18n';
import { TEMPLATES } from '@/shared/templates';
import { Reveal } from './reveal';

export function TemplateSection() {
  const t = getT('landing');
  const examples = TEMPLATES.filter(template => ['tesis-uta', 'articulo', 'presentacion'].includes(template.id));
  return <section id="plantillas" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 py-16 sm:px-7 lg:py-24">
    <Reveal className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="text-[13px] font-medium text-brand">{t('templates.eyebrow')}</p>
        <h2 className="mt-4 text-balance font-serif text-[clamp(2.3rem,4.1vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.035em]">{t('templates.title')}</h2>
        <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">{t('templates.body')}</p>
      </div>
      <Link href="/plantillas" className="landing-text-action group inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium">
        {t('templates.all')}<ArrowRight className="landing-action-arrow size-4" aria-hidden="true" />
      </Link>
    </Reveal>
    <ul className="mt-10 grid gap-5 md:grid-cols-[1.1fr_1fr_1fr]">
      {examples.map((template, i) => <Reveal as="li" key={template.id} delay={i * 40}>
        <Link href={`/plantillas/${template.id}`} className="landing-template group block h-full overflow-hidden rounded-[14px] border border-line-strong bg-surface">
          <div className="flex h-[210px] items-end justify-center overflow-hidden border-b border-line bg-sunken px-8 pt-8 sm:h-[260px]" aria-hidden="true">
            <div className="landing-template-paper relative w-full max-w-[230px] shrink-0 rounded-t-[3px] border border-line bg-surface p-6 shadow-[var(--shadow-pop)]">
              <span className="mb-4 block h-1 w-7 rounded-full bg-brand" />
              <p className="font-serif text-lg font-medium leading-tight">{template.name}</p>
              <div className="mt-5 space-y-2">
                <span className="block h-1 w-full rounded bg-fg/10" /><span className="block h-1 w-4/5 rounded bg-fg/10" />
                <span className="block h-1 w-full rounded bg-fg/10" /><span className="block h-1 w-3/5 rounded bg-fg/10" />
              </div>
              <FileText className="mt-8 size-5 text-brand" strokeWidth={1.25} />
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-xs text-fg-2">{template.category}</p>
            <h3 className="mt-2 font-serif text-2xl font-medium tracking-tight">{template.name}</h3>
            <p className="mt-2 min-h-[4.5em] text-[13px] leading-relaxed text-fg-2">{template.description}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-[13px] font-medium text-brand">{t('templates.open')}<ArrowRight className="landing-action-arrow size-4" aria-hidden="true" /></span>
          </div>
        </Link>
      </Reveal>)}
    </ul>
  </section>;
}
