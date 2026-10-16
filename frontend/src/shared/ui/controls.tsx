'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, Select as SelectPrimitive, Switch as SwitchPrimitive, ToggleGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export function Checkbox({ id, checked, onCheckedChange, disabled, ...a11y }: {
  readonly id?: string;
  readonly checked: boolean;
  readonly onCheckedChange: (v: boolean) => void;
  readonly disabled?: boolean;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean;
}) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={cn(
        'grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-surface',
        'shadow-[inset_0_0_0_1px_var(--border-strong)] transition-[background-color,box-shadow] duration-[var(--dur-micro)]',
        'data-[state=checked]:bg-brand data-[state=checked]:shadow-none aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--danger)]',
      )}
      {...a11y}
    >
      <CheckboxPrimitive.Indicator className="text-brand-fg">
        <Check className="size-3.5" strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ checked, onCheckedChange, label, disabled }: {
  readonly checked: boolean;
  readonly onCheckedChange: (v: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full bg-surface-3',
        'shadow-[inset_0_0_0_1px_var(--border-strong)] transition-colors duration-[var(--dur-panel)]',
        'data-[state=checked]:bg-brand disabled:opacity-50',
      )}
    >
      <SwitchPrimitive.Thumb className="block size-[16px] translate-x-[3px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-[var(--dur-panel)] ease-[var(--ease-out)] data-[state=checked]:translate-x-[19px]" />
    </SwitchPrimitive.Root>
  );
}

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
}

export function Select<T extends string>({ value, onValueChange, options, id, label, className, disabled, ...a11y }: {
  readonly value: T;
  readonly onValueChange: (v: T) => void;
  readonly options: readonly SelectOption<T>[];
  readonly id?: string;
  readonly label?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly 'aria-describedby'?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)} {...(disabled ? { disabled } : {})}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        className={cn(
          'inline-flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface px-3 text-sm text-fg',
          'shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-surface-2 data-[placeholder]:text-fg-3 disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...a11y}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon><ChevronDown className="size-4 text-fg-3" strokeWidth={1.5} /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[10px] bg-surface p-1 shadow-[var(--shadow-pop),inset_0_0_0_1px_var(--border)] animate-pop">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-default select-none flex-col rounded-[6px] py-1.5 pl-8 pr-3 text-sm text-fg outline-none data-[highlighted]:bg-brand-soft"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2.5 top-2"><Check className="size-3.5 text-brand" strokeWidth={2.2} /></SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                {o.hint && <span className="text-xs text-fg-3">{o.hint}</span>}
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** Control segmentado (vista Código / Dividido / PDF, Lista / Cuadrícula). */
export function Segmented<T extends string>({ value, onValueChange, options, label, size = 'md' }: {
  readonly value: T;
  readonly onValueChange: (v: T) => void;
  readonly options: readonly { value: T; label: ReactNode; icon?: ReactNode; title?: string }[];
  readonly label: string;
  readonly size?: 'sm' | 'md';
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      className="inline-flex rounded-[9px] bg-surface-3/70 p-[3px] shadow-[inset_0_0_0_1px_var(--border)]"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          title={o.title}
          aria-label={o.title}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[7px] font-medium text-fg-2 transition-[background-color,color,box-shadow] duration-[var(--dur-micro)]',
            'hover:text-fg data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-[0_1px_2px_rgb(30_24_14/0.12),inset_0_0_0_1px_var(--border)]',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
          )}
        >
          {o.icon}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
