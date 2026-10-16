'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';
import { getT } from '@/shared/i18n';

const control =
  'w-full rounded-[var(--radius-control)] bg-surface text-fg placeholder:text-fg-3 ' +
  'shadow-[inset_0_0_0_1px_var(--border-strong),0_1px_1px_rgb(30_24_14/0.03)] ' +
  'transition-[box-shadow,background-color] duration-[var(--dur-micro)] ' +
  'hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--text-3)_60%,transparent)] ' +
  'focus:outline-none focus:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--brand-soft)] ' +
  'aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--danger),0_0_0_3px_var(--danger-soft)] ' +
  'disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-surface-2';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly ref?: Ref<HTMLInputElement>;
  readonly inputSize?: 'md' | 'lg';
}

export function Input({ className, inputSize = 'md', ...rest }: InputProps) {
  return <input className={cn(control, inputSize === 'lg' ? 'h-11 px-3.5 text-[15px]' : 'h-9 px-3 text-sm', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-24 px-3 py-2 text-sm leading-relaxed', className)} {...rest} />;
}

export interface FieldProps {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: string | undefined;
  readonly optional?: boolean;
  readonly className?: string;
  /** Recibe los atributos de accesibilidad que enlazan etiqueta, ayuda y error. */
  readonly children: (a11y: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/**
 * Campo con etiqueta, ayuda y error enlazados por aria-describedby; el error
 * se anuncia (role="alert") y nunca se transmite solo por color.
 */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const t = getT('common');
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-[13px] font-medium text-fg">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-fg-3">{t('optional')}</span>}
      </label>
      {children({ id, ...(describedBy ? { 'aria-describedby': describedBy } : {}), ...(error ? { 'aria-invalid': true } : {}) })}
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-[13px] text-danger">
          <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-danger" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-fg-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function PasswordInput(props: InputProps) {
  const [visible, setVisible] = useState(false);
  const t = getT('common');
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-11', props.className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('password.hide') : t('password.show')}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-[var(--radius-control)] text-fg-3 transition-colors hover:text-fg"
      >
        {visible ? <EyeOff className="size-4" strokeWidth={1.5} /> : <Eye className="size-4" strokeWidth={1.5} />}
      </button>
    </div>
  );
}
