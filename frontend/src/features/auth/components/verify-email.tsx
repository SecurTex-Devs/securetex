'use client';

import { CircleCheck, CircleX, Lock, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { isApiError } from '@/shared/api/errors';
import { consumeFragmentToken } from '@/shared/lib/fragment-token';
import { formatClock, useCountdown } from '@/shared/hooks/use-countdown';
import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { Notice } from '@/shared/ui/notice';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';
import { useMe, useResendVerification, useVerifyEmail } from '../api';
import { AuthHeading } from './auth-heading';

type Phase = 'waiting' | 'checking' | 'success' | 'failed';

/** P-03 · verificación del correo. El token llega en el fragmento y se borra al leerlo. */
export function VerifyEmail() {
  const t = getT('auth');
  const verify = useVerifyEmail();
  const [phase, setPhase] = useState<Phase>('waiting');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = consumeFragmentToken();
    if (!token) return;
    setPhase('checking');
    verify.mutate(token, { onSuccess: () => setPhase('success'), onError: () => setPhase('failed') });
  }, [verify]);

  if (phase === 'checking') {
    return (
      <div className="flex flex-col items-center py-10 text-center" role="status">
        <Spinner className="size-6 text-brand" />
        <p className="mt-4 text-sm text-fg-2">{t('verify.checking')}</p>
      </div>
    );
  }
  if (phase === 'success') {
    return (
      <div>
        <AuthHeading icon={<CircleCheck className="text-ok" strokeWidth={1.5} />} title={t('verify.success')} subtitle={t('verify.successBody')} />
        <Button asChild variant="primary" size="lg" className="w-full"><Link href="/entrar?motivo=verificado">{t('verify.goLogin')}</Link></Button>
      </div>
    );
  }
  if (phase === 'failed') {
    return (
      <div>
        <AuthHeading icon={<CircleX className="text-danger" strokeWidth={1.5} />} title={t('verify.failed')} subtitle={t('verify.failedBody')} />
        <Button asChild size="lg" className="w-full"><Link href="/entrar">{t('verify.goLogin')}</Link></Button>
      </div>
    );
  }
  return <WaitingForEmail />;
}

function WaitingForEmail() {
  const t = getT('auth');
  const me = useMe({ silent401: true });
  const resend = useResendVerification();
  const [cooldown, startCooldown] = useCountdown();
  const signedIn = me.isSuccess && !me.data.emailVerified;

  const onResend = () =>
    resend.mutate(undefined, {
      onSuccess: (r) => { toast.success(t('verify.resent')); startCooldown(r.retryAfterSeconds); },
      onError: (e) => { if (isApiError(e) && e.retryAfterSeconds) startCooldown(e.retryAfterSeconds); else if (isApiError(e)) toast.error(e.message); },
    });

  return (
    <div>
      <AuthHeading icon={<MailCheck strokeWidth={1.5} />} title={t('verify.title')} subtitle={t('verify.body')} />
      {signedIn && (
        <>
          <Notice tone="warn" icon={<Lock strokeWidth={1.75} />} title={t('verify.locked')}>{t('verify.lockedHint')}</Notice>
          <Button size="lg" className="mt-5 w-full" onClick={onResend} loading={resend.isPending} disabled={cooldown > 0}>{t('verify.resend')}</Button>
          {cooldown > 0 && <p className="mt-2 text-center text-xs text-fg-3 tabular" aria-live="polite">{t('verify.resendIn', { time: formatClock(cooldown) })}</p>}
        </>
      )}
      <p className="mt-6 text-[13px] leading-relaxed text-fg-2">{t('verify.deliveryHint')}</p>
      <p className="mt-8 text-center text-[13px]">
        <Link href={signedIn ? '/proyectos' : '/entrar'} className="font-medium text-brand underline-offset-4 hover:underline">
          {signedIn ? t('verify.goProjects') : t('verify.goLogin')}
        </Link>
      </p>
    </div>
  );
}
