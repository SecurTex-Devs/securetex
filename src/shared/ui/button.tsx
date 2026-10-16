import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/shared/lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'sec' | 'ink';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(20_20_60/0.25)] hover:bg-brand-hover',
  default:
    'bg-surface text-fg shadow-[inset_0_0_0_1px_var(--border-strong),0_1px_2px_rgb(30_24_14/0.05)] hover:bg-surface-2',
  ghost: 'text-fg-2 hover:bg-surface-3/70 hover:text-fg',
  danger: 'bg-danger text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16)] hover:brightness-110',
  sec: 'bg-sec-soft text-sec shadow-[inset_0_0_0_1px_var(--sec-line)] hover:bg-sec/15',
  ink: 'bg-fg text-bg hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-5 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly pill?: boolean;
  /** Acción de más de 300 ms: muestra progreso e impide el doble envío. */
  readonly loading?: boolean;
  readonly asChild?: boolean;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * Botón del sistema de diseño (03-Sistema-de-Diseno §3.1). Como máximo un
 * `primary` por pantalla. Respuesta táctil al pulsar (scale 0.97) y foco visible.
 */
export function Button({
  variant = 'default', size = 'md', pill = false, loading = false, asChild = false,
  leading, trailing, className, children, disabled, type, ...rest
}: ButtonProps) {
  const classes = cn(
    'group relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
    'transition-[transform,background-color,box-shadow,color,opacity] duration-[var(--dur-micro)] ease-[var(--ease-out)]',
    'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
    pill ? 'rounded-full' : 'rounded-[var(--radius-control)]',
    VARIANTS[variant], SIZES[size], className,
  );
  if (asChild) {
    return <Slot.Root className={classes} {...rest}>{children}</Slot.Root>;
  }
  return (
    <button type={type ?? 'button'} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner className="size-4" /> : leading}
      {children}
      {!loading && trailing}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'leading' | 'trailing' | 'children'> {
  /** Obligatorio: el icono es el único contenido (WCAG 4.1.2). */
  readonly label: string;
  readonly icon: ReactNode;
}

export function IconButton({ label, icon, size = 'md', variant = 'ghost', className, ...rest }: IconButtonProps) {
  const square = size === 'sm' ? 'size-8 px-0' : size === 'lg' ? 'size-11 px-0' : 'size-9 px-0';
  return (
    <Button aria-label={label} title={label} variant={variant} size={size} className={cn(square, className)} {...rest}>
      {icon}
    </Button>
  );
}
