'use client';

import { Check, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { estimateStrength } from '@/shared/lib/password-strength';
import { getT } from '@/shared/i18n';

const BAR = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-ok', 'bg-ok'] as const;
const TEXT = ['text-danger', 'text-danger', 'text-warn', 'text-ok', 'text-ok'] as const;

/**
 * Medidor de fortaleza en vivo (P-02). Orientativo: la decisión final la toma
 * el servidor, que además comprueba filtraciones por k-anonimato.
 */
export function PasswordStrengthMeter({ password, email }: { readonly password: string; readonly email: string }) {
  const t = getT('auth');
  if (!password) return null;
  const s = estimateStrength(password, email);
  const rules = [
    [s.rules.length, t('strength.rule.length')],
    [s.rules.mix, t('strength.rule.mix')],
    [s.rules.email, t('strength.rule.email')],
  ] as const;
  return (
    <div className="mt-2.5 animate-fade" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full bg-surface-3 transition-colors duration-[var(--dur-panel)]', i < Math.max(1, s.score) && BAR[s.score])} />
        ))}
      </div>
      <p className="mt-1.5 flex justify-between text-xs">
        <span className={cn('font-medium', TEXT[s.score])}>{t('strength.label')}: {t(`strength.${s.score}`)}</span>
        <span className="text-fg-3 tabular">{t('strength.chars', { n: s.length })}</span>
      </p>
      <ul className="mt-2 grid gap-1">
        {rules.map(([ok, label]) => (
          <li key={label} className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-fg-2' : 'text-fg-3')}>
            {ok ? <Check className="size-3.5 text-ok" strokeWidth={2} aria-hidden="true" /> : <Minus className="size-3.5" strokeWidth={2} aria-hidden="true" />}
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
