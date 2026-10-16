'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { humanWait, isApiError, type ApiError } from '@/shared/api/errors';
import { formatClock, useCountdown } from '@/shared/hooks/use-countdown';
import { getT } from '@/shared/i18n';
import { safeInternalPath } from '@/shared/security/safe-url';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/controls';
import { Field, Input, PasswordInput } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { useLogin } from '../api';
import { AuthHeading } from './auth-heading';
import { Divider, ProviderButtons } from './provider-buttons';

const OIDC_CODES = new Set(['oidc_link_required', 'oidc_email_unverified', 'oidc_state_invalid', 'not_found']);

/** P-04 · inicio de sesión. Los mensajes no revelan si el correo existe (T-A09). */
export function LoginForm() {
  const t = getT('auth');
  const router = useRouter();
  const params = useSearchParams();
  const next = safeInternalPath(params.get('next'));
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [lockedFor, startLock] = useCountdown();
  const [problem, setProblem] = useState<ApiError | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    login.mutate(
      { email, password, remember },
      {
        onSuccess: (res) => {
          if (res.status === 'mfa_required') router.push(`/mfa?next=${encodeURIComponent(next)}`);
          else { router.replace(next); router.refresh(); }
        },
        onError: (err) => {
          if (!isApiError(err)) return;
          setProblem(err);
          if (err.kind === 'rate_limited' && err.retryAfterSeconds) startLock(err.retryAfterSeconds);
          setPassword('');
        },
      },
    );
  };

  return (
    <div>
      <AuthHeading title={t('login.title')} subtitle={t('login.subtitle')} />
      <StatusBanner reason={params.get('motivo')} oidcError={params.get('error')} />
      <ProviderButtons />
      <Divider label={t('login.or')} />

      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {problem && <LoginProblem error={problem} lockedFor={lockedFor} />}
        <Field label={t('login.email')} error={problem?.fields['email']}>
          {(a11y) => <Input {...a11y} inputSize="lg" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t('login.password')}>
          {(a11y) => <PasswordInput {...a11y} inputSize="lg" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-fg-2">
            <Checkbox checked={remember} onCheckedChange={setRemember} />
            <span>{t('login.remember')}<span className="sr-only">. {t('login.rememberHint')}</span></span>
          </label>
          <Link href="/recuperar" className="text-[13px] font-medium text-brand underline-offset-4 hover:underline">{t('login.forgot')}</Link>
        </div>
        <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={login.isPending} disabled={lockedFor > 0}
          trailing={<ArrowRight className="size-4 transition-transform duration-[var(--dur-micro)] group-hover:translate-x-0.5" strokeWidth={1.75} />}>
          {lockedFor > 0 ? formatClock(lockedFor) : t('login.submit')}
        </Button>
      </form>

      <p className="mt-8 text-center text-[13px] text-fg-2">
        {t('login.noAccount')}{' '}
        <Link href="/registro" className="font-medium text-brand underline-offset-4 hover:underline">{t('login.register')}</Link>
      </p>
    </div>
  );

  function StatusBanner({ reason, oidcError }: { readonly reason: string | null; readonly oidcError: string | null }) {
    if (oidcError) {
      const key = OIDC_CODES.has(oidcError) ? (`login.oidc.${oidcError}` as const) : 'login.oidc.generic';
      return <Notice tone="warn" className="mb-6">{t(key as Parameters<typeof t>[0])}</Notice>;
    }
    if (reason === 'sesion') return <Notice tone="info" className="mb-6">{t('login.sessionExpired')}</Notice>;
    if (reason === 'verificado') return <Notice tone="ok" className="mb-6">{t('login.verified')}</Notice>;
    if (reason === 'restablecida') return <Notice tone="ok" className="mb-6">{t('login.passwordReset')}</Notice>;
    return null;
  }
}

function LoginProblem({ error, lockedFor }: { readonly error: ApiError; readonly lockedFor: number }) {
  const t = getT('auth');
  if (error.code === 'account_locked') {
    return <Notice tone="danger" title={t('login.invalid')}>{t('login.locked', { wait: humanWait(lockedFor || (error.retryAfterSeconds ?? 900)) })}</Notice>;
  }
  if (error.kind === 'rate_limited') return <Notice tone="warn">{t('login.rateLimited', { wait: humanWait(lockedFor || 60) })}</Notice>;
  if (error.code === 'invalid_credentials') {
    return (
      <Notice tone="danger" title={t('login.invalid')}>
        {error.remainingAttempts !== null ? t('login.remaining', { n: error.remainingAttempts }) : null}
      </Notice>
    );
  }
  if (error.kind === 'validation') return null;
  return <Notice tone="danger">{error.message}</Notice>;
}
