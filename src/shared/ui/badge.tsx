import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'sec';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3/80 text-fg-2 shadow-[inset_0_0_0_1px_var(--border)]',
  brand: 'bg-brand-soft text-brand shadow-[inset_0_0_0_1px_var(--brand-line)]',
  ok: 'bg-ok-soft text-ok shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ok)_30%,transparent)]',
  warn: 'bg-warn-soft text-warn shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warn)_30%,transparent)]',
  danger: 'bg-danger-soft text-danger shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_28%,transparent)]',
  sec: 'bg-sec-soft text-sec shadow-[inset_0_0_0_1px_var(--sec-line)]',
};

/** Etiqueta de estado: color + texto siempre (WCAG 1.4.1). */
export function Badge({ tone = 'neutral', icon, children, className, size = 'md' }: {
  readonly tone?: BadgeTone;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium [&>svg]:shrink-0',
        size === 'sm' ? 'h-5 px-1.5 text-[11px] [&>svg]:size-3' : 'h-[22px] px-2 text-xs [&>svg]:size-3.5',
        TONES[tone], className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Dot({ tone = 'ok', pulse = false }: { readonly tone?: 'ok' | 'warn' | 'danger' | 'brand' | 'neutral'; readonly pulse?: boolean }) {
  const color = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', brand: 'bg-brand', neutral: 'bg-fg-3' }[tone];
  return <span aria-hidden="true" className={cn('inline-block size-1.5 rounded-full', color, pulse && 'animate-[pulse-dot_1.6s_ease-in-out_infinite]')} />;
}

export function Kbd({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-surface px-1 font-mono text-[11px] text-fg-2 shadow-[inset_0_0_0_1px_var(--border-strong),0_1px_0_var(--border-strong)]">
      {children}
    </kbd>
  );
}
