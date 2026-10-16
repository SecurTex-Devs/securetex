'use client';

import { MailWarning } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import { isApiError } from '@/shared/api/errors';
import { formatClock, useCountdown } from '@/shared/hooks/use-countdown';
import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

/** P-03 en la aplicación: la cuenta sin verificar no puede crear proyectos (RF-001). */
export function VerifyBanner() {
  const t = getT('shell');
  const [cooldown, start] = useCountdown();
  const resend = useMutation({ mutationFn: () => unwrap(api.POST('/api/v1/auth/verify-email/resend')) });
  return (
    <div role="status" className="border-b border-[color-mix(in_oklab,var(--warn)_30%,transparent)] bg-warn-soft">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-[13px] text-fg sm:px-6">
        <MailWarning className="size-4 text-warn" strokeWidth={1.75} aria-hidden="true" />
        <span className="flex-1">{t('verify.banner')}</span>
        <Button
          size="sm"
          loading={resend.isPending}
          disabled={cooldown > 0}
          onClick={() =>
            resend.mutate(undefined, {
              onSuccess: (r) => { toast.success(t('verify.sent')); start(r.retryAfterSeconds); },
              onError: (e) => { if (isApiError(e) && e.retryAfterSeconds) start(e.retryAfterSeconds); },
            })
          }
        >
          {cooldown > 0 ? formatClock(cooldown) : t('verify.resend')}
        </Button>
      </div>
    </div>
  );
}
