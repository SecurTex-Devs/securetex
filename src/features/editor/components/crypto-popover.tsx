'use client';

import { Check, CloudOff, Lock, LockKeyhole } from 'lucide-react';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Popover } from '@/shared/ui/menu';
import { Spinner } from '@/shared/ui/spinner';
import { useEditor } from '../store';

const LAYERS = ['c1', 'c2', 'c3', 'c4', 'c5'] as const;

/**
 * P-48 · estado de guardado y las cinco capas criptográficas que recorre
 * cada cambio (securtex-docs · 14-Criptografia-Multicapa).
 */
export function CryptoStatus({ online }: { readonly online: boolean }) {
  const t = getT('editor');
  const state = useEditor((s) => s.saveState);
  const effective = online ? state : 'offline';
  const label = t(`save.${effective}`);
  const warn = effective === 'offline';
  const Icon = CloudOff;
  return (
    <Popover
      align="start"
      className="w-[340px] p-4"
      trigger={
        <button type="button" className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors', warn ? 'bg-warn-soft text-warn' : 'text-fg-2 hover:bg-surface-3')}>
          {warn ? <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" /> : effective === 'saving' ? <Spinner className="size-3.5 text-sec" /> : <Lock className="size-3.5 text-sec" strokeWidth={1.75} aria-hidden="true" />}
          <span aria-live="polite">{label}</span>
        </button>
      }
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-sec-soft text-sec"><LockKeyhole className="size-4" strokeWidth={1.75} aria-hidden="true" /></span>
        <p className="text-sm font-medium text-fg">{t('crypto.title')}</p>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{t('crypto.body')}</p>
      <ol className="relative mt-4 grid gap-3 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-sec-line">
        {LAYERS.map((l) => (
          <li key={l} className="relative flex gap-3">
            <span className="z-10 grid size-[19px] shrink-0 place-items-center rounded-full bg-sec text-[var(--surface)]"><Check className="size-3" strokeWidth={3} aria-hidden="true" /></span>
            <span>
              <span className="block text-[13px] font-medium text-fg">{t(`crypto.${l}`)}</span>
              <span className="block font-mono text-[11px] text-fg-3">{t(`crypto.${l}d`)}</span>
            </span>
          </li>
        ))}
      </ol>
      {effective === 'offline' && <p className="mt-4 rounded-[8px] bg-warn-soft px-3 py-2 text-xs text-fg">{t('save.offlineHint')}</p>}
    </Popover>
  );
}
