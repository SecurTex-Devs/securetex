'use client';

import { KeyRound, LogOut, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { humanWait, isApiError } from '@/shared/api/errors';
import { consumeFragmentToken } from '@/shared/lib/fragment-token';
import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { Field, Input, PasswordInput } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { useForgotPassword, useResetPassword } from '../api';
import { AuthHeading } from './auth-heading';
import { PasswordStrengthMeter } from '@/shared/ui/password-strength';

/** P-06 · la respuesta es la misma exista o no la cuenta (RF-007). */
export function ForgotPasswordForm() {
  const t = getT('auth');
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (forgot.isSuccess) {
    return (
      <div>
        <AuthHeading icon={<MailCheck strokeWidth={1.5} />} title={t('forgot.sent')} subtitle={t('forgot.sentBody')} />
        <Button asChild size="lg" className="w-full"><Link href="/entrar">{t('forgot.back')}</Link></Button>
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    forgot.mutate(email, {
      onError: (err) => {
        if (!isApiError(err)) return;
        setError(err.kind === 'rate_limited' ? t('login.rateLimited', { wait: humanWait(err.retryAfterSeconds ?? 60) }) : (err.fields['email'] ?? err.message));
      },
    });
  };

  return (
    <div>
      <AuthHeading title={t('forgot.title')} subtitle={t('forgot.subtitle')} />
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <Field label={t('forgot.email')} error={error ?? undefined}>
          {(a) => <Input {...a} inputSize="lg" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={forgot.isPending}>{t('forgot.submit')}</Button>
      </form>
      <p className="mt-8 text-center text-[13px]">
        <Link href="/entrar" className="font-medium text-brand underline-offset-4 hover:underline">{t('forgot.back')}</Link>
      </p>
    </div>
  );
}

/** P-07 · nueva contraseña con el token del correo; cierra todas las sesiones. */
export function ResetPasswordForm() {
  const t = getT('auth');
  const router = useRouter();
  const reset = useResetPassword();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => setToken(consumeFragmentToken()), []);

  if (token === undefined) return null;
  if (token === null) {
    return (
      <div>
        <AuthHeading icon={<KeyRound strokeWidth={1.5} />} title={t('reset.noToken')} subtitle={t('reset.noTokenBody')} />
        <Button asChild size="lg" className="w-full"><Link href="/recuperar">{t('reset.requestNew')}</Link></Button>
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setErrors({ repeat: t('reset.mismatch') });
      return;
    }
    setErrors({});
    reset.mutate(
      { token, password },
      {
        onSuccess: () => router.replace('/entrar?motivo=restablecida'),
        onError: (err) => { if (isApiError(err)) setErrors(err.kind === 'validation' ? { ...err.fields } : { general: err.message }); },
      },
    );
  };

  return (
    <div>
      <AuthHeading title={t('reset.title')} subtitle={t('reset.subtitle')} />
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {(errors['general'] ?? errors['token']) && <Notice tone="danger">{errors['general'] ?? errors['token']}</Notice>}
        <Field label={t('reset.password')} error={errors['password']}>
          {(a) => (
            <div>
              <PasswordInput {...a} inputSize="lg" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <PasswordStrengthMeter password={password} email="" />
            </div>
          )}
        </Field>
        <Field label={t('reset.repeat')} error={errors['repeat']}>
          {(a) => <PasswordInput {...a} inputSize="lg" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
        </Field>
        <Notice tone="sec" icon={<LogOut strokeWidth={1.75} />} title={t('reset.sessions')}>{t('reset.sessionsBody')}</Notice>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={reset.isPending}>{t('reset.submit')}</Button>
      </form>
    </div>
  );
}
