import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** Fracción tipográfica sin HTML inyectado (para composiciones estáticas de marketing). */
export function Fraction({ num, den, className }: { readonly num: ReactNode; readonly den: ReactNode; readonly className?: string }) {
  return (
    <span className={cn('mx-[0.15em] inline-flex flex-col items-center align-middle leading-none', className)}>
      <span className="px-[0.2em] pb-[0.12em]">{num}</span>
      <span className="w-full border-t border-current pt-[0.14em] text-center" aria-hidden="false">{den}</span>
    </span>
  );
}

/** Variable matemática en cursiva serif. */
export function V({ children }: { readonly children: ReactNode }) {
  return <i className="font-serif">{children}</i>;
}
