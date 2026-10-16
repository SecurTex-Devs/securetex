import type { ReactNode } from 'react';

export function AuthHeading({ title, subtitle, icon }: { readonly title: ReactNode; readonly subtitle?: ReactNode; readonly icon?: ReactNode }) {
  return (
    <div className="mb-8 animate-rise">
      {icon && (
        <div className="mb-5 grid size-12 place-items-center rounded-[14px] bg-surface text-brand shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)] [&>svg]:size-[22px]">
          {icon}
        </div>
      )}
      <h1 className="font-serif text-[34px] font-medium leading-[1.08] tracking-[-0.02em] text-fg">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{subtitle}</p>}
    </div>
  );
}
