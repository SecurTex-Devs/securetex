'use client';

import { CheckCircle2, Info, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { create } from 'zustand';
import { cn } from '@/shared/lib/cn';
import { getT } from '@/shared/i18n';

type Tone = 'info' | 'success' | 'error' | 'security';

interface ToastItem {
  readonly id: number;
  readonly tone: Tone;
  readonly title: string;
  readonly description?: string;
}

interface ToastState {
  readonly items: readonly ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  remove: (id: number) => void;
}

let seq = 0;
const useToasts = create<ToastState>((set) => ({
  items: [],
  // Un aviso idéntico sustituye al anterior (p. ej., pulsar Ctrl+S varias veces) en vez de apilarse.
  push: (t) => set((s) => ({
    items: [...s.items.filter((i) => i.tone !== t.tone || i.title !== t.title || i.description !== t.description).slice(-3), { ...t, id: ++seq }],
  })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

/** Avisos efímeros. `error` se anuncia como alerta; el resto como estado. */
export const toast = {
  info: (title: string, description?: string) => useToasts.getState().push({ tone: 'info', title, ...(description ? { description } : {}) }),
  success: (title: string, description?: string) => useToasts.getState().push({ tone: 'success', title, ...(description ? { description } : {}) }),
  error: (title: string, description?: string) => useToasts.getState().push({ tone: 'error', title, ...(description ? { description } : {}) }),
  security: (title: string, description?: string) => useToasts.getState().push({ tone: 'security', title, ...(description ? { description } : {}) }),
};

const ICONS = { info: Info, success: CheckCircle2, error: TriangleAlert, security: ShieldCheck } as const;
const TONES = { info: 'text-brand', success: 'text-ok', error: 'text-danger', security: 'text-sec' } as const;

export function Toaster() {
  const { items, remove } = useToasts();
  const t = getT('common');
  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {items.map((item) => {
        const Icon = ICONS[item.tone];
        return (
          <ToastPrimitive.Root
            key={item.id}
            type={item.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => !open && remove(item.id)}
            className={cn(
              'group pointer-events-auto relative flex w-[360px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-[12px] bg-surface p-3.5 pr-10',
              'shadow-[var(--shadow-pop),inset_0_0_0_1px_var(--border)]',
              'data-[state=open]:animate-[pop-in_220ms_var(--ease-out)] data-[state=closed]:animate-[fade-in_120ms_reverse]',
              'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
            )}
          >
            <Icon className={cn('mt-0.5 size-[18px] shrink-0', TONES[item.tone])} strokeWidth={1.75} aria-hidden="true" />
            <div className="min-w-0">
              <ToastPrimitive.Title className="text-sm font-medium text-fg">{item.title}</ToastPrimitive.Title>
              {item.description && <ToastPrimitive.Description className="mt-0.5 text-[13px] leading-snug text-fg-2">{item.description}</ToastPrimitive.Description>}
            </div>
            <ToastPrimitive.Close aria-label={t('close')} className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-fg-3 hover:bg-surface-3 hover:text-fg">
              <X className="size-3.5" strokeWidth={1.75} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
