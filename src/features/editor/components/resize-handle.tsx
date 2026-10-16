'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Separador redimensionable por arrastre Y por teclado (03-Sistema-de-Diseno
 * §4): flechas mueven 16 px, Inicio/Fin llevan a los extremos.
 */
export function ResizeHandle({ value, min, max, onChange, label, invert = false }: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (v: number) => void;
  readonly label: string;
  readonly invert?: boolean;
}) {
  const start = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, v: value };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    onChange(clamp(start.current.v + (invert ? -dx : dx)));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    const dir = invert ? -1 : 1;
    if (e.key === 'ArrowLeft') onChange(clamp(value - step * dir));
    else if (e.key === 'ArrowRight') onChange(clamp(value + step * dir));
    else if (e.key === 'Home') onChange(min);
    else if (e.key === 'End') onChange(max);
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => { start.current = null; }}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative z-10 -mx-[3px] w-[7px] shrink-0 cursor-col-resize touch-none',
        'after:absolute after:inset-y-0 after:left-[3px] after:w-px after:bg-line after:transition-colors',
        'hover:after:w-[2px] hover:after:bg-brand focus-visible:after:w-[2px] focus-visible:after:bg-brand focus-visible:shadow-none',
      )}
    />
  );
}
