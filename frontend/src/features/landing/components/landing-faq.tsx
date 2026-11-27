import { getT } from '@/shared/i18n';
import { Reveal } from './reveal';

export function LandingFaq() {
  const t = getT('landing');
  return <section id="preguntas" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 py-16 sm:px-7 lg:py-24">
    <Reveal>
      <p className="text-[13px] font-medium text-brand">{t('faq.eyebrow')}</p>
      <h2 className="mt-4 text-balance font-serif text-[clamp(2.3rem,4.1vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.035em]">{t('faq.title')}</h2>
    </Reveal>
    <dl className="mt-10 grid gap-x-16 gap-y-8 md:grid-cols-2">
      {(['install', 'team', 'demo', 'pdf'] as const).map((key, i) => <Reveal key={key} delay={i % 2 * 40} className="border-t border-line-strong pt-5">
        <dt className="text-[15px] font-semibold">{t(`faq.${key}.q`)}</dt>
        <dd className="mt-3 max-w-[53ch] text-[14px] leading-relaxed text-fg-2">{t(`faq.${key}.a`)}</dd>
      </Reveal>)}
    </dl>
  </section>;
}
