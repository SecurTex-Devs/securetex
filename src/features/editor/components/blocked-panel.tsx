'use client';

import { ArrowRight, ShieldX } from 'lucide-react';
import { getT } from '@/shared/i18n';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { useEditor, type SecurityFinding } from '../store';

/**
 * P-47 · el estado más específico del producto: un usuario legítimo se topa
 * con un control de seguridad. El mensaje dice qué ha pasado sin acusar,
 * señala la línea exacta, ofrece una alternativa y explica el porqué
 * (Docs/04-Interfaces §3.2).
 */
export function BlockedPanel({ findings }: { readonly findings: readonly SecurityFinding[] }) {
  const t = getT('editor');
  const jumpTo = useEditor((s) => s.jumpTo);
  const first = findings.find((f) => f.severity === 'blocking');
  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-[620px] animate-rise" role="alert">
        <div className="grid size-14 place-items-center rounded-[16px] bg-danger-soft text-danger shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_25%,transparent)]">
          <ShieldX className="size-7" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h2 className="mt-5 font-serif text-[30px] font-medium leading-tight tracking-[-0.02em] text-fg">{t('blocked.title')}</h2>
        <p className="mt-2.5 text-[14px] leading-relaxed text-fg-2">{t('blocked.body')}</p>

        <h3 className="mb-3 mt-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{t('blocked.found')}</h3>
        <ul className="grid gap-2.5">
          {findings.map((f) => (
            <li key={`${f.rule}:${f.file}:${f.line}`} className="rounded-[12px] bg-surface p-4 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={f.severity === 'blocking' ? 'danger' : 'warn'} size="sm">{f.severity === 'blocking' ? t('blocked.blocking') : t('blocked.warning')}</Badge>
                <span className="text-sm font-medium text-fg">{f.title}</span>
              </div>
              <button type="button" onClick={() => jumpTo(f.file, f.line)} className="mt-2 block w-full rounded-[7px] bg-sunken px-3 py-2 text-left font-mono text-[12px] text-fg-2 shadow-[inset_0_0_0_1px_var(--border)] hover:text-fg">
                <span className="text-fg-3">{f.file}:{f.line} · </span>{f.snippet}
              </button>
              <p className="mt-2 text-[13px] text-fg-2"><span className="font-medium text-fg">{t('blocked.alternative')}:</span> {f.alternative}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-[14px] bg-sec-soft p-5 shadow-[inset_0_0_0_1px_var(--sec-line)]">
          <h3 className="text-sm font-medium text-fg">{t('blocked.why')}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{t('blocked.whyBody')}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{t('blocked.local')}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {first && <Button variant="primary" trailing={<ArrowRight className="size-4" strokeWidth={1.75} />} onClick={() => jumpTo(first.file, first.line)}>{t('blocked.goto', { line: first.line })}</Button>}
        </div>
      </div>
    </div>
  );
}
