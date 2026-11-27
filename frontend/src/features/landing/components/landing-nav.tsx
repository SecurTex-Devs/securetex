import Link from 'next/link';
import { getT } from '@/shared/i18n';
import { ThemeToggle } from '@/shared/theme/theme-toggle';
import { Logo } from '@/shared/ui/logo';
import { DemoButton } from './demo-button';

export function LandingNav() {
  const t = getT('landing');
  return <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-xl">
    <nav aria-label={t('nav.label')} className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-3 px-4 sm:px-7">
      <Link href="/" className="rounded-md"><Logo /></Link>
      <ul className="ml-8 hidden items-center gap-7 text-[13px] font-medium text-fg-2 lg:flex">
        <li><a href="#editor" className="landing-nav-link">{t('nav.editor')}</a></li>
        <li><a href="#plantillas" className="landing-nav-link">{t('nav.templates')}</a></li>
        <li><a href="#preguntas" className="landing-nav-link">{t('nav.questions')}</a></li>
      </ul>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <Link href="/entrar" className="landing-nav-link rounded-md px-1 py-2 text-[13px] font-medium sm:mr-3">{t('nav.login')}</Link>
        <div className="hidden sm:block"><DemoButton compact /></div>
      </div>
    </nav>
  </header>;
}
