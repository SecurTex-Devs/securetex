'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Aparición al entrar en pantalla: IntersectionObserver (nunca un listener de
 * scroll), solo transform/opacity, una sola vez. El HTML sin JavaScript queda
 * visible y el movimiento reducido conserva el contenido sin desplazamiento.
 */
export function Reveal({ children, delay = 0, className, as: Tag = 'div' }: {
  readonly children: ReactNode;
  readonly delay?: number;
  readonly className?: string;
  readonly as?: 'div' | 'li' | 'section';
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setShown(true); io.disconnect(); }
      else setShown(false);
    }, { rootMargin: '0px 0px -24px 0px', threshold: 0.06 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-[opacity,transform] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
