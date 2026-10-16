'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Seis casillas para el código TOTP. Admite pegar el código entero, flechas y
 * retroceso. `autoComplete="one-time-code"` deja que el sistema lo rellene.
 */
export function OtpInput({ value, onChange, label, invalid, disabled, autoFocus, describedBy }: {
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly label: string;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly describedBy?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const setAt = (index: number, char: string) => {
    const next = digits.slice();
    next[index] = char;
    onChange(next.join('').replace(/\s/g, ''));
  };

  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex justify-between gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`${label} · ${i + 1}`}
          aria-invalid={invalid || undefined}
          maxLength={1}
          onPaste={onPaste}
          onKeyDown={onKey(i)}
          onChange={(e) => {
            const char = e.target.value.replace(/\D/g, '').slice(-1);
            setAt(i, char);
            if (char && i < 5) refs.current[i + 1]?.focus();
          }}
          className={cn(
            'h-14 w-full min-w-0 rounded-[10px] bg-surface text-center font-mono text-2xl text-fg',
            'shadow-[inset_0_0_0_1px_var(--border-strong)] transition-shadow duration-[var(--dur-micro)]',
            'focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--brand),0_0_0_4px_var(--brand-soft)]',
            invalid && 'shadow-[inset_0_0_0_1.5px_var(--danger)]',
            i === 3 && 'ml-2',
          )}
        />
      ))}
    </div>
  );
}
