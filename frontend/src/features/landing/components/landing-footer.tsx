import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getT } from '@/shared/i18n';
import { Logo } from '@/shared/ui/logo';
import { DemoButton } from './demo-button';
import { Reveal } from './reveal';

export function LandingFooter() {
  const t = getT('landing');
  return <footer className="border-t border-line bg-surface/60 px-4 sm:px-7">
    <div className="mx-auto max-w-[1224px]">
      <Reveal className="flex flex-wrap items-center justify-between gap-8 py-14 lg:py-20">
        <div><h2 className="text-balance font-serif text-[clamp(2.5rem,4.3vw,3.7rem)] font-medium leading-tight tracking-[-0.035em]">{t('cta.title')}</h2>
          <p className="mt-3 text-sm text-fg-2">{t('cta.body')}</p></div>
        <div className="flex flex-wrap items-center gap-6"><DemoButton />
          <Link href="/registro" className="landing-text-action group inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium">
            {t('hero.account')}<ArrowRight className="landing-action-arrow size-4" aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
      <div className="flex flex-wrap items-center justify-between gap-6 border-t border-line py-7">
        <div className="flex items-center gap-4"><Logo /><p className="hidden text-xs text-fg-2 sm:block">{t('footer.tagline')}</p></div>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-fg-2">
          <li><Link href="https://github.com/SecurTex-Devs/securetex" className="landing-nav-link rounded-sm py-1">{t('footer.project')}</Link></li>
          <li><Link href="/entrar" className="landing-nav-link rounded-sm py-1">{t('nav.login')}</Link></li>
          <li><Link href="/privacidad" className="landing-nav-link rounded-sm py-1">{t('footer.privacy')}</Link></li>
          <li><Link href="/terminos" className="landing-nav-link rounded-sm py-1">{getT('legal')('footer.terms')}</Link></li>
        </ul>
      </div>
    </div>
  </footer>;
}
