import { CheckCircle2, Info, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type NoticeTone = 'info' | 'ok' | 'warn' | 'danger' | 'sec';

const STYLE: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'bg-brand-soft shadow-[inset_0_0_0_1px_var(--brand-line)]', icon: 'text-brand', Icon: Info },
  ok: { box: 'bg-ok-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ok)_28%,transparent)]', icon: 'text-ok', Icon: CheckCircle2 },
  warn: { box: 'bg-warn-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warn)_30%,transparent)]', icon: 'text-warn', Icon: TriangleAlert },
  danger: { box: 'bg-danger-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_26%,transparent)]', icon: 'text-danger', Icon: ShieldAlert },
  sec: { box: 'bg-sec-soft shadow-[inset_0_0_0_1px_var(--sec-line)]', icon: 'text-sec', Icon: ShieldCheck },
};

/**
 * Aviso en línea. El de peligro se anuncia como alerta; el resto, como estado.
 * Siempre con icono + texto: nunca solo color.
 */
export function Notice({ tone = 'info', title, children, action, className, icon }: {
  readonly tone?: NoticeTone;
  readonly title?: ReactNode;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly icon?: ReactNode;
}) {
  const s = STYLE[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed', s.box, className)}>
      <span className={cn('mt-0.5 shrink-0 [&>svg]:size-[17px]', s.icon)} aria-hidden="true">{icon ?? <s.Icon strokeWidth={1.75} />}</span>
      <div className="min-w-0 flex-1 text-fg-2">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}
