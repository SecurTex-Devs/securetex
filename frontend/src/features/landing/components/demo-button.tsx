'use client';

import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { api, unwrap } from '@/shared/api/client';
import { isApiError } from '@/shared/api/errors';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Spinner } from '@/shared/ui/spinner';

export function DemoButton({ compact = false, className }: { readonly compact?: boolean; readonly className?: string }) {
  const t = getT('landing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await unwrap(api.POST('/api/v1/auth/demo'));
      // Navegación completa: ninguna caché o sala de una cuenta anterior se reutiliza.
      window.location.assign(`/proyecto/${session.projectId}`);
    } catch (err: unknown) {
      setError(isApiError(err) && err.kind === 'rate_limited' ? t('demo.busy') : t('demo.unavailable'));
      setBusy(false);
    }
  };
  return (
    <div className="relative">
      <button type="button" disabled={busy} aria-busy={busy} onClick={() => void start()} className={cn(
        'group inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-full bg-fg font-medium text-bg transition-transform active:scale-[0.98] disabled:cursor-wait disabled:opacity-70',
        compact ? 'h-9 px-4 text-[13px]' : 'h-12 pl-6 pr-1.5 text-[15px]', className,
      )}>
        {busy ? <Spinner className="size-4" /> : null}{busy ? t('demo.opening') : t('hero.cta')}
        {!compact && <span className="grid size-9 place-items-center rounded-full bg-bg/15"><ArrowUpRight className="size-4" strokeWidth={1.75} aria-hidden="true" /></span>}
      </button>
      {error && <p role="alert" className="mt-2 max-w-[32ch] text-left text-[13px] leading-snug text-danger">{error}</p>}
    </div>
  );
}
