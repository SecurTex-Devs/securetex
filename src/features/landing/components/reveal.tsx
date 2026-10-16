'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Aparición al entrar en pantalla: IntersectionObserver (nunca un listener de
 * scroll), solo transform/opacity/blur, una sola vez. Con movimiento reducido,
 * el contenido aparece sin desplazamiento.
 */
export function Reveal({ children, delay = 0, className, as: Tag = 'div' }: {
  readonly children: ReactNode;
  readonly delay?: number;
  readonly className?: string;
  readonly as?: 'div' | 'li' | 'section';
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -80px 0px', threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-[opacity,transform,filter] duration-[900ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-8 opacity-0 blur-[6px] motion-reduce:translate-y-0 motion-reduce:blur-0',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
