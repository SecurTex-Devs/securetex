'use client';

import { DropdownMenu, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const panel = 'z-50 rounded-[11px] bg-surface p-1 shadow-[var(--shadow-pop),inset_0_0_0_1px_var(--border)]';

/** Menú contextual sobre Radix: flechas, Home/End, Esc y escritura para buscar. */
export function Menu({ trigger, children, align = 'end', label }: {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly align?: 'start' | 'end' | 'center';
  readonly label?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} aria-label={label} className={cn(panel, 'min-w-[200px]')}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ icon, children, onSelect, tone = 'default', shortcut, disabled }: {
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly onSelect?: () => void;
  readonly tone?: 'default' | 'danger';
  readonly shortcut?: string;
  readonly disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-default select-none items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] outline-none',
        'data-[disabled]:opacity-45 data-[highlighted]:bg-surface-3/80',
        tone === 'danger' ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-fg',
      )}
    >
      {icon && <span className="grid size-4 place-items-center text-fg-3 [&>svg]:size-4" aria-hidden="true">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="font-mono text-[11px] text-fg-3">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuLabel({ children }: { readonly children: ReactNode }) {
  return <DropdownMenu.Label className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}

export function Popover({ trigger, children, align = 'center', side = 'bottom', className }: {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly align?: 'start' | 'end' | 'center';
  readonly side?: 'top' | 'bottom' | 'left' | 'right';
  readonly className?: string;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align={align} side={side} sideOffset={8} className={cn(panel, 'p-3', className)}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * Descripción emergente accesible por teclado. Nunca es la única fuente de
 * información (03-Sistema-de-Diseno §3).
 */
export function Tooltip({ content, children, side = 'top' }: {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-[260px] rounded-[7px] bg-fg px-2.5 py-1.5 text-xs leading-snug text-bg shadow-[0_8px_24px_-8px_rgb(0_0_0/0.4)]">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
