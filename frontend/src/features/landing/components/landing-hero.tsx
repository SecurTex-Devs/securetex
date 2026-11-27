import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { getT } from '@/shared/i18n';
import { DemoButton } from './demo-button';
import { EditorFilm } from './editor-film';

export function LandingHero() {
  const t = getT('landing');
  return <section className="mx-auto max-w-[1280px] px-4 pb-16 pt-14 sm:px-7 lg:pb-24 lg:pt-20">
    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
      <div className="landing-enter">
        <p className="mb-6 text-[13px] font-medium text-brand">{t('hero.eyebrow')}</p>
        <h1 className="max-w-[13ch] text-balance font-serif text-[clamp(3.15rem,5.2vw,4.9rem)] font-medium leading-[0.99] tracking-[-0.045em] text-fg">
          {t('hero.title1')} <em className="font-normal text-brand">{t('hero.title2')}</em>
        </h1>
        <p className="mt-6 max-w-[34ch] text-pretty text-[17px] leading-relaxed text-fg-2">{t('hero.body')}</p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <DemoButton />
          <Link href="/registro" className="landing-text-action group inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-fg">
            {t('hero.account')}<ArrowRight className="landing-action-arrow size-4" aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-fg-2">{t('hero.note')}</p>
      </div>
      <div className="landing-enter landing-enter-later min-w-0"><EditorFilm /></div>
    </div>
    <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-6 text-[13px] text-fg-2 lg:mt-14">
      {(['hero.benefit1', 'hero.benefit2', 'hero.benefit3'] as const).map(key => <li key={key} className="flex items-center gap-2">
        <Check className="size-4 text-brand" strokeWidth={1.75} aria-hidden="true" />{t(key)}
      </li>)}
    </ul>
  </section>;
}
