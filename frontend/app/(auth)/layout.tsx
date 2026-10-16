import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthShowcase } from '@/features/auth/components/auth-showcase';
import { getT } from '@/shared/i18n';
import { ThemeToggle } from '@/shared/theme/theme-toggle';
import { Logo } from '@/shared/ui/logo';

/** P-02 … P-07 · distribución común del acceso: formulario sobre papel, producto sobre tinta. */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  const t = getT('auth');
  const c = getT('common');
  return (
    <div className="grain grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        {c('skip.toContent')}
      </a>
      <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="rounded-md"><Logo /></Link>
          <ThemeToggle />
        </header>
        <main id="contenido" className="grid flex-1 place-items-center py-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
        <footer className="flex items-center gap-2 text-xs text-fg-3">
          <ShieldCheck className="size-3.5 text-sec" strokeWidth={1.75} aria-hidden="true" />
          {t('login.securityNote')}
        </footer>
      </div>
      <aside className="hidden p-3 lg:block" aria-hidden="false">
        <div className="sticky top-3 h-[calc(100dvh-1.5rem)]">
          <AuthShowcase />
        </div>
      </aside>
    </div>
  );
}
