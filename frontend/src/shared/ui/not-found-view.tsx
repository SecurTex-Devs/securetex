import { LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { getT } from '@/shared/i18n';
import { Button } from './button';
import { Logo } from './logo';

/**
 * P-44 · «no existe» y «no tienes acceso» son la MISMA pantalla, a propósito
 * (T-P07): no se confirma la existencia de un recurso privado.
 */
export function NotFoundView({ project = false }: { readonly project?: boolean }) {
  const t = getT('states');
  return (
    <div className="grain grid min-h-dvh place-items-center bg-bg px-6">
      <div className="absolute left-6 top-6"><Link href="/" className="rounded-md"><Logo /></Link></div>
      <div className="max-w-[440px] text-center animate-rise">
        <p className="font-serif text-[120px] font-medium leading-none tracking-[-0.04em] text-fg/10" aria-hidden="true">404</p>
        <div className="mx-auto -mt-8 mb-6 grid size-14 place-items-center rounded-[16px] bg-surface text-fg-2 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]">
          <LockKeyhole className="size-6" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] text-fg">{project ? t('notFound.project') : t('notFound.title')}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{t('notFound.body')}</p>
        <Button asChild variant="primary" size="lg" className="mt-8"><Link href="/proyectos">{t('notFound.cta')}</Link></Button>
      </div>
    </div>
  );
}
