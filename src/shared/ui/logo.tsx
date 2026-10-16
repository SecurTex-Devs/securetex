import { cn } from '@/shared/lib/cn';

/**
 * Marca de SecurTex: la barra invertida con la que empieza todo comando de
 * LaTeX, encerrada en un sello. «Escribir LaTeX» dentro de «un lugar seguro».
 */
export function LogoMark({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" className="fill-brand" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="none" stroke="white" strokeOpacity="0.18" />
      <path d="M11 8.5 L19.8 23.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" className="dark:stroke-[var(--brand-fg)]" />
      <circle cx="22.2" cy="10.2" r="2.1" fill="white" className="dark:fill-[var(--brand-fg)]" />
    </svg>
  );
}

export function Logo({ className, wordmark = true }: { readonly className?: string; readonly wordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      {wordmark && (
        <span className="font-serif text-[19px] font-semibold tracking-[-0.02em] text-fg">
          Secur<span className="italic text-brand">Tex</span>
        </span>
      )}
    </span>
  );
}
