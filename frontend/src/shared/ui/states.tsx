'use client';

import { Copy, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { getT } from '@/shared/i18n';
import { isApiError } from '@/shared/api/errors';
import { Button } from './button';

/** Estado vacío que guía hacia la primera acción útil (RNF-030). */
export function EmptyState({ icon, title, description, action, className }: {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-16 text-center', className)}>
      {icon && (
        <div className="mb-5 grid size-14 place-items-center rounded-[16px] bg-surface text-fg-2 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)] [&>svg]:size-6">
          {icon}
        </div>
      )}
      <h2 className="font-serif text-2xl font-medium tracking-[-0.01em] text-fg">{title}</h2>
      {description && <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-fg-2">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** P-43 · error genérico y accionable. Solo muestra el traceId (RNF-031). */
export function ErrorState({ error, onRetry, compact = false }: { readonly error: unknown; readonly onRetry?: () => void; readonly compact?: boolean }) {
  const t = getT('states');
  const traceId = isApiError(error) ? error.traceId : null;
  const [copied, setCopied] = useState(false);
  return (
    <div role="alert" className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-16')}>
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-danger-soft font-serif text-2xl text-danger" aria-hidden="true">!</div>
      <h2 className="font-serif text-xl font-medium text-fg">{t('error.title')}</h2>
      <p className="mt-1.5 max-w-[46ch] text-sm text-fg-2">{t('error.body')}</p>
      <div className="mt-5 flex gap-2">
        {onRetry && <Button size="sm" leading={<RotateCcw className="size-3.5" strokeWidth={1.75} />} onClick={onRetry}>{t('error.retry')}</Button>}
        <Button size="sm" variant="ghost" asChild><Link href="/proyectos">{t('error.home')}</Link></Button>
      </div>
      {traceId && (
        <button
          type="button"
          onClick={() => { void navigator.clipboard.writeText(traceId); setCopied(true); }}
          className="mt-5 inline-flex items-center gap-2 rounded-md px-2 py-1 font-mono text-[11px] text-fg-3 hover:bg-surface-3"
          aria-label={t('error.copyTrace')}
        >
          <Copy className="size-3" strokeWidth={1.75} aria-hidden="true" />
          {copied ? t('error.copied') : `ref. ${traceId.slice(0, 12)}`}
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { readonly className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton', className)} />;
}
