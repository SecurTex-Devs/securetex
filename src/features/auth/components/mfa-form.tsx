'use client';

import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { getT } from '@/shared/i18n';
import { safeInternalPath } from '@/shared/security/safe-url';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { OtpInput } from '@/shared/ui/otp-input';
import { useMfaVerify } from '../api';
import { AuthHeading } from './auth-heading';

/** P-05 · segundo factor: código TOTP o código de respaldo de un solo uso. */
export function MfaForm() {
  const t = getT('auth');
  const router = useRouter();
  const next = safeInternalPath(useSearchParams().get('next'));
  const verify = useMfaVerify();
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const submit = (value: string) => {
    setError(null);
    verify.mutate(
      { kind: mode, code: value },
      {
        onSuccess: () => { router.replace(next); router.refresh(); },
        onError: (e) => {
          if (!isApiError(e)) return;
          if (e.kind === 'unauthorized') setExpired(true);
          else setError(e.message);
          setCode('');
        },
      },
    );
  };

  // Al completar los 6 dígitos se envía solo: menos fricción en el paso más repetido.
  useEffect(() => {
    if (mode === 'totp' && code.length === 6 && !verify.isPending) submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, mode]);

  if (expired) {
    return (
      <div>
        <AuthHeading icon={<ShieldCheck strokeWidth={1.5} />} title={t('mfa.title')} />
        <Notice tone="warn">{t('mfa.expired')}</Notice>
        <Button asChild size="lg" className="mt-5 w-full"><Link href="/entrar">{t('mfa.backToLogin')}</Link></Button>
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit(code); };

  return (
    <div>
      <AuthHeading icon={<ShieldCheck strokeWidth={1.5} />} title={t('mfa.title')} subtitle={mode === 'totp' ? t('mfa.subtitle') : t('mfa.recoveryHint')} />
      <form onSubmit={onSubmit} className="grid gap-5">
        {error && <Notice tone="danger">{error}</Notice>}
        {mode === 'totp' ? (
          <OtpInput value={code} onChange={setCode} label={t('mfa.code')} invalid={Boolean(error)} disabled={verify.isPending} autoFocus />
        ) : (
          <Field label={t('mfa.recovery')}>
            {(a) => <Input {...a} inputSize="lg" autoFocus autoComplete="off" spellCheck={false} placeholder="xxxxx-xxxxx" className="font-mono tracking-wider" value={code} onChange={(e) => setCode(e.target.value)} />}
          </Field>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={verify.isPending} disabled={mode === 'totp' ? code.length !== 6 : code.length < 10}>
          {t('mfa.submit')}
        </Button>
      </form>

      <div className="mt-6 grid gap-2">
        <Button variant="ghost" className="w-full" leading={mode === 'totp' ? <KeyRound className="size-4" strokeWidth={1.5} /> : <Smartphone className="size-4" strokeWidth={1.5} />}
          onClick={() => { setMode(mode === 'totp' ? 'recovery' : 'totp'); setCode(''); setError(null); }}>
          {mode === 'totp' ? t('mfa.useRecovery') : t('mfa.useTotp')}
        </Button>
      </div>
      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-fg-3">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-sec" strokeWidth={1.75} aria-hidden="true" />
        {t('mfa.note')}
      </p>
    </div>
  );
}
