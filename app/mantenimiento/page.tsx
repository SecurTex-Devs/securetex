import { HardDrive, Wrench } from 'lucide-react';
import type { Metadata } from 'next';
import { getT } from '@/shared/i18n';
import { Logo } from '@/shared/ui/logo';

export const metadata: Metadata = { title: 'Mantenimiento' };

/** P-46 · mantenimiento programado (activable desde administración). */
export default function Maintenance() {
  const t = getT('states');
  return (
    <main className="grain grid min-h-dvh place-items-center bg-bg px-6">
      <div className="absolute left-6 top-6"><Logo /></div>
      <div className="max-w-[460px] text-center animate-rise">
        <div className="mx-auto mb-6 grid size-14 place-items-center rounded-[16px] bg-surface text-warn shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]"><Wrench className="size-6" strokeWidth={1.5} aria-hidden="true" /></div>
        <h1 className="font-serif text-[32px] font-medium tracking-[-0.02em] text-fg">{t('maintenance.title')}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{t('maintenance.body')}</p>
        <p className="mt-6 flex items-center justify-center gap-2 rounded-[12px] bg-ok-soft px-4 py-3 text-[13px] text-fg-2"><HardDrive className="size-4 text-ok" strokeWidth={1.75} aria-hidden="true" />{t('maintenance.safe')}</p>
      </div>
    </main>
  );
}
