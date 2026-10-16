'use client';

import { Database, KeyRound, Link2, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { ReauthProvider } from './reauth';

const GROUPS = [
  { label: 'nav.account', items: [
    { href: '/ajustes/perfil', label: 'nav.profile', icon: UserRound },
    { href: '/ajustes/seguridad', label: 'nav.security', icon: ShieldCheck },
    { href: '/ajustes/mfa', label: 'nav.mfa', icon: KeyRound },
    { href: '/ajustes/cuentas', label: 'nav.linked', icon: Link2 },
  ] },
  { label: 'nav.prefs', items: [{ href: '/ajustes/editor', label: 'nav.editor', icon: SlidersHorizontal }] },
  { label: 'nav.data', items: [{ href: '/ajustes/datos', label: 'nav.mydata', icon: Database }] },
] as const;

/** Barra lateral común a P-27 … P-34. */
export function SettingsShell({ children }: { readonly children: ReactNode }) {
  const t = getT('account');
  const pathname = usePathname();
  return (
    <ReauthProvider>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-4 py-8 sm:px-6 md:flex-row lg:py-10">
        <nav aria-label={t('nav.label')} className="shrink-0 md:w-[220px]">
          <p className="mb-4 font-serif text-[26px] font-medium tracking-[-0.02em] text-fg">{t('title')}</p>
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-5">
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{t(g.label)}</p>
              <ul className="grid gap-0.5">
                {g.items.map((it) => {
                  const active = pathname === it.href;
                  return (
                    <li key={it.href}>
                      <Link href={it.href} aria-current={active ? 'page' : undefined}
                        className={cn('flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] transition-colors', active ? 'bg-surface font-medium text-fg shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:bg-surface-3/60 hover:text-fg')}>
                        <it.icon className={cn('size-4', active ? 'text-brand' : 'text-fg-3')} strokeWidth={1.5} aria-hidden="true" />
                        {t(it.label)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <main id="contenido" className="min-w-0 flex-1">{children}</main>
      </div>
    </ReauthProvider>
  );
}

export function SettingsHeader({ title, subtitle, action }: { readonly title: string; readonly subtitle?: string; readonly action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        <h1 className="font-serif text-[32px] font-medium leading-tight tracking-[-0.02em] text-fg">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[60ch] text-sm text-fg-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Panel({ title, description, children, className, action }: { readonly title?: ReactNode; readonly description?: ReactNode; readonly children: ReactNode; readonly className?: string; readonly action?: ReactNode }) {
  return (
    <section className={cn('card mb-5 overflow-hidden animate-rise', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-fg-2">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
