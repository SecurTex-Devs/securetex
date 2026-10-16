'use client';

import { ShieldCheck } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isApiError } from '@/shared/api/errors';
import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, PasswordInput } from '@/shared/ui/field';
import { useReauth } from '../api';

type Run = <T>(action: () => Promise<T>) => Promise<T | undefined>;
const ReauthContext = createContext<Run>(async (a) => a());

/**
 * Operaciones sensibles (RS-006): si la API responde `reauth_required`, se
 * pide la contraseña, se eleva la sesión 5 minutos y se repite la acción.
 */
export function useSensitive(): Run {
  return useContext(ReauthContext);
}

export function ReauthProvider({ children }: { readonly children: ReactNode }) {
  const t = getT('account');
  const reauth = useReauth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const ask = () => new Promise<boolean>((resolve) => { pending.current = resolve; setPassword(''); setError(undefined); setOpen(true); });

  const run: Run = useCallback(async (action) => {
    try {
      return await action();
    } catch (e) {
      if (!(isApiError(e) && e.kind === 'reauth_required')) throw e;
      if (!(await ask())) return undefined;
      return action();
    }
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    reauth.mutate({ password }, {
      onSuccess: () => { setOpen(false); pending.current?.(true); pending.current = null; },
      onError: (err) => setError(isApiError(err) ? (err.fields['password'] ?? err.message) : undefined),
    });
  };

  return (
    <ReauthContext.Provider value={run}>
      {children}
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); pending.current?.(false); pending.current = null; } }} width="sm"
        title={t('reauth.title')} description={t('reauth.body')} icon={<ShieldCheck className="size-[18px] text-sec" strokeWidth={1.5} />}>
        <form onSubmit={onSubmit} className="grid gap-4 pb-3">
          <Field label={t('reauth.password')} error={error}>
            {(a) => <PasswordInput {...a} autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" loading={reauth.isPending} disabled={!password}>{t('reauth.submit')}</Button>
        </form>
      </Dialog>
    </ReauthContext.Provider>
  );
}
