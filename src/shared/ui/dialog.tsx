'use client';

import { X } from 'lucide-react';
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { getT } from '@/shared/i18n';
import { Button } from './button';

const overlay = 'fixed inset-0 z-40 bg-[rgb(14_12_8/0.42)] backdrop-blur-[3px] data-[state=open]:animate-[fade-in_200ms_var(--ease-out)]';
const content =
  'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto ' +
  'rounded-[var(--radius-panel)] bg-surface shadow-[var(--shadow-pop),inset_0_0_0_1px_var(--border)] ' +
  'data-[state=open]:animate-[dialog-in_220ms_var(--ease-out)] focus:outline-none';

export interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
  readonly width?: 'sm' | 'md' | 'lg' | 'xl';
}

const WIDTHS = { sm: 'max-w-[420px]', md: 'max-w-[520px]', lg: 'max-w-[680px]', xl: 'max-w-[880px]' } as const;

/**
 * Diálogo modal sobre Radix: foco atrapado, Esc cierra y el foco vuelve al
 * botón que lo abrió (AGENTS.md §5). Los modales escalan desde el centro.
 */
export function Dialog({ open, onOpenChange, title, description, icon, children, footer, width = 'md' }: DialogProps) {
  const t = getT('common');
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content className={cn(content, WIDTHS[width])} {...(description ? {} : { 'aria-describedby': undefined })}>
          <header className="flex items-start gap-3 px-6 pb-2 pt-5">
            {icon && <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--border)]">{icon}</div>}
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-fg">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-[13px] leading-relaxed text-fg-2">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close aria-label={t('close')} className="-mr-2 -mt-1 grid size-8 place-items-center rounded-[7px] text-fg-3 transition-colors hover:bg-surface-3 hover:text-fg">
              <X className="size-4" strokeWidth={1.5} />
            </DialogPrimitive.Close>
          </header>
          {children && <div className="px-6 py-3">{children}</div>}
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-3.5">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface ConfirmProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly destructive?: boolean;
  readonly loading?: boolean;
  readonly children?: ReactNode;
}

/** Confirmación previa obligatoria para acciones destructivas (03-Sistema-de-Diseno §3.1). */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, destructive, loading, children }: ConfirmProps) {
  const t = getT('common');
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlay} />
        <AlertPrimitive.Content className={cn(content, 'max-w-[440px] p-6')}>
          <AlertPrimitive.Title className="font-serif text-[22px] font-medium leading-tight text-fg">{title}</AlertPrimitive.Title>
          <AlertPrimitive.Description className="mt-2 text-sm leading-relaxed text-fg-2">{description}</AlertPrimitive.Description>
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex justify-end gap-2">
            <AlertPrimitive.Cancel asChild><Button>{t('cancel')}</Button></AlertPrimitive.Cancel>
            <Button variant={destructive ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
