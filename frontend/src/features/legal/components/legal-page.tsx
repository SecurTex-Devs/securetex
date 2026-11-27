import Link from 'next/link';
import { getT } from '@/shared/i18n';
import { safeUrl } from '@/shared/security/safe-url';
import { ThemeToggle } from '@/shared/theme/theme-toggle';
import { Logo } from '@/shared/ui/logo';

const SECTIONS = {
  privacy: [
    ['privacy.identity.title', 'privacy.identity.body'], ['privacy.use.title', 'privacy.use.body'],
    ['privacy.documents.title', 'privacy.documents.body'], ['privacy.providers.title', 'privacy.providers.body'],
    ['privacy.security.title', 'privacy.security.body'], ['privacy.retention.title', 'privacy.retention.body'],
    ['privacy.contact.title', 'privacy.contact.body'],
  ],
  terms: [
    ['terms.account.title', 'terms.account.body'], ['terms.content.title', 'terms.content.body'],
    ['terms.use.title', 'terms.use.body'], ['terms.demo.title', 'terms.demo.body'],
    ['terms.service.title', 'terms.service.body'], ['terms.contact.title', 'terms.contact.body'],
  ],
} as const;

export function LegalPage({ document }: { readonly document: keyof typeof SECTIONS }) {
  const t = getT('legal');
  const email = process.env['PUBLIC_SUPPORT_EMAIL']?.trim();
  const contact = email && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) ? safeUrl(`mailto:${email}`) : null;
  return <div className="min-h-dvh bg-bg">
    <header className="border-b border-line">
      <nav aria-label={t('nav.label')} className="mx-auto flex min-h-[72px] max-w-[1100px] flex-wrap items-center gap-4 px-4 sm:px-7">
        <Link href="/" className="rounded-md"><Logo /></Link>
        <div className="ml-auto flex items-center gap-4"><ThemeToggle /><Link href="/entrar" className="rounded-md py-2 text-[13px] font-medium hover:text-brand">{t('nav.login')}</Link></div>
      </nav>
    </header>
    <main id="contenido" className="mx-auto max-w-[790px] px-4 py-12 sm:px-7 sm:py-16">
      <Link href="/" className="inline-flex min-h-9 items-center rounded-md text-[13px] text-brand underline-offset-4 hover:underline">{t('nav.home')}</Link>
      <article className="mt-6">
        <h1 className="text-balance font-serif text-[clamp(2.5rem,6vw,3.7rem)] font-medium leading-[1.05] tracking-[-0.035em]">{t(`${document}.title`)}</h1>
        <p className="mt-4 text-xs text-fg-2">{t('updated')}</p>
        <p className="mt-7 text-[16px] leading-relaxed text-fg-2">{t(`${document}.intro`)}</p>
        <div className="mt-10 space-y-8">
          {SECTIONS[document].map(([title, body]) => <section key={title} className="border-t border-line pt-5">
            <h2 className="text-lg font-semibold leading-snug">{t(title)}</h2>
            <p className="mt-3 text-[15px] leading-[1.8] text-fg-2">{t(body)}</p>
          </section>)}
        </div>
        <p className="mt-6 break-words text-sm text-fg-2">{contact ? <><span className="font-medium text-fg">{t('contact.label')}: </span><a href={contact} className="rounded-sm text-brand underline underline-offset-4">{email}</a></> : t('contact.fallback')}</p>
      </article>
    </main>
    <footer className="border-t border-line px-4 py-7 sm:px-7">
      <nav aria-label={t('nav.label')} className="mx-auto flex max-w-[736px] flex-wrap gap-x-6 gap-y-3 text-[13px] text-fg-2">
        <Link href="/privacidad" className="rounded-sm py-1 hover:text-brand">{t('footer.privacy')}</Link>
        <Link href="/terminos" className="rounded-sm py-1 hover:text-brand">{t('footer.terms')}</Link>
      </nav>
    </footer>
  </div>;
}
