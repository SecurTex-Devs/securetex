import type { ReactNode } from 'react';
import { TopBar } from '@/shared/layout/top-bar';
import { getT } from '@/shared/i18n';

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  const c = getT('common');
  return (
    <div className="min-h-dvh bg-bg">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        {c('skip.toContent')}
      </a>
      <TopBar />
      {children}
    </div>
  );
}
