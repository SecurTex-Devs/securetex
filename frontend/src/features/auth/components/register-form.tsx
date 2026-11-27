'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { humanWait, isApiError } from '@/shared/api/errors';
import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/controls';
import { Field, Input, PasswordInput } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { useRegister } from '../api';
import { AuthHeading } from './auth-heading';
import { PasswordStrengthMeter } from '@/shared/ui/password-strength';
import { Divider, ProviderButtons } from './provider-buttons';

/** P-02 · registro. La respuesta es la misma exista o no el correo (T-A09). */
export function RegisterForm() {
  const t = getT('auth');
  const router = useRouter();
  const register = useRegister();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setGeneral(null);
    if (!form.acceptTerms) {
      setErrors({ acceptTerms: t('register.termsError') });
      return;
    }
    register.mutate({ ...form, acceptTerms: true }, {
      onSuccess: () => router.push('/verificar?enviado=1'),
      onError: (err) => {
        if (!isApiError(err)) return;
        if (err.kind === 'validation') {
          setErrors({ ...err.fields });
          // El foco va al primer campo con error (Docs/05 §2.2).
          requestAnimationFrame(() => document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus());
        } else if (err.kind === 'rate_limited') setGeneral(t('login.rateLimited', { wait: humanWait(err.retryAfterSeconds ?? 60) }));
        else setGeneral(err.message);
      },
    });
  };

  return (
    <div>
      <AuthHeading title={t('register.title')} subtitle={t('register.subtitle')} />
      <ProviderButtons />
      <Divider label={t('login.or')} />
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {general && <Notice tone="danger">{general}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('register.firstName')} error={errors['firstName']}>
            {(a) => <Input {...a} autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />}
          </Field>
          <Field label={t('register.lastName')} error={errors['lastName']}>
            {(a) => <Input {...a} autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />}
          </Field>
        </div>
        <Field label={t('register.email')} hint={t('register.emailHint')} error={errors['email']}>
          {(a) => <Input {...a} type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
        </Field>
        <Field label={t('register.password')} hint={form.password ? undefined : t('register.passwordHint')} error={errors['password']}>
          {(a) => (
            <div>
              <PasswordInput {...a} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
              <PasswordStrengthMeter password={form.password} email={form.email} />
            </div>
          )}
        </Field>
        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-fg-2">
            <span className="mt-px"><Checkbox checked={form.acceptTerms} onCheckedChange={(v) => set('acceptTerms', v)} {...(errors['acceptTerms'] ? { 'aria-invalid': true } : {})} /></span>
            {t('register.terms')}
          </label>
          {errors['acceptTerms'] && <p role="alert" className="mt-1.5 text-[13px] text-danger">{errors['acceptTerms']}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-7 text-xs text-fg-2">
            <Link href="/terminos" target="_blank" rel="noopener" className="rounded-sm underline underline-offset-4 hover:text-brand">{getT('legal')('footer.terms')}</Link>
            <Link href="/privacidad" target="_blank" rel="noopener" className="rounded-sm underline underline-offset-4 hover:text-brand">{getT('legal')('footer.privacy')}</Link>
          </p>
        </div>
        <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={register.isPending}>{t('register.submit')}</Button>
      </form>
      <p className="mt-8 text-center text-[13px] text-fg-2">
        {t('register.haveAccount')}{' '}
        <Link href="/entrar" className="font-medium text-brand underline-offset-4 hover:underline">{t('register.login')}</Link>
      </p>
    </div>
  );
}
