'use client';

import { Copy, Download, KeyRound, ShieldAlert, ShieldCheck, Smartphone, Ticket } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useMe } from '@/shared/api/session';
import type { TotpSetup } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog, Dialog } from '@/shared/ui/dialog';
import { OtpInput } from '@/shared/ui/otp-input';
import { Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';
import { useDisableMfa, useRegenerateCodes, useTotpConfirm, useTotpSetup } from '../api';
import { useSensitive } from './reauth';
import { Panel, SettingsHeader } from './settings-shell';

/** P-29 · segundo factor (RF-006). */
export function MfaSettings() {
  const t = getT('account');
  const me = useMe();
  const setup = useTotpSetup();
  const regenerate = useRegenerateCodes();
  const disable = useDisableMfa();
  const sensitive = useSensitive();
  const [secret, setSecret] = useState<TotpSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  if (me.isLoading || !me.data) return <Skeleton className="h-72" />;
  const mfa = me.data.mfa;

  const start = async () => {
    try {
      const r = await sensitive(() => setup.mutateAsync());
      if (r) setSecret(r);
    } catch (e) { toast.error(isApiError(e) ? e.message : getT('states')('error.title')); }
  };
  const regen = async () => {
    const r = await sensitive(() => regenerate.mutateAsync());
    if (r) setCodes(r.recoveryCodes);
  };
  const off = async () => {
    const r = await sensitive(() => disable.mutateAsync());
    setConfirmDisable(false);
    if (r) toast.security(t('mfa.disabled'));
  };

  return (
    <>
      <SettingsHeader title={t('mfa.title')} subtitle={t('mfa.subtitle')} />
      <div className={cn('mb-5 flex items-start gap-4 rounded-[14px] p-5 animate-rise', mfa.totpEnabled ? 'bg-sec-soft shadow-[inset_0_0_0_1px_var(--sec-line)]' : 'bg-warn-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warn)_28%,transparent)]')}>
        {mfa.totpEnabled ? <ShieldCheck className="size-6 shrink-0 text-sec" strokeWidth={1.5} aria-hidden="true" /> : <ShieldAlert className="size-6 shrink-0 text-warn" strokeWidth={1.5} aria-hidden="true" />}
        <div>
          <p className="text-[15px] font-medium text-fg">{mfa.totpEnabled ? t('mfa.on') : t('mfa.off')}</p>
          <p className="mt-0.5 text-[13px] text-fg-2">{mfa.totpEnabled ? t('mfa.onBody', { n: mfa.recoveryCodesRemaining }) : t('mfa.offBody')}</p>
        </div>
      </div>

      <Panel>
        <ul className="grid divide-y divide-line">
          <Method icon={<Smartphone />} title={t('mfa.totp')} body={t('mfa.totpBody')} badge={mfa.totpEnabled ? <Badge size="sm" tone="ok">{t('mfa.active')}</Badge> : undefined}>
            {mfa.totpEnabled
              ? <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDisable(true)}>{t('mfa.disable')}</Button>
              : <Button size="sm" variant="primary" loading={setup.isPending} onClick={() => void start()}>{t('mfa.enable')}</Button>}
          </Method>
          {mfa.totpEnabled && (
            <Method icon={<Ticket />} title={t('mfa.recovery')} body={t('mfa.recoveryBody')} badge={<Badge size="sm">{mfa.recoveryCodesRemaining} / 10</Badge>}>
              <Button size="sm" loading={regenerate.isPending} onClick={() => void regen()}>{t('mfa.regenerate')}</Button>
            </Method>
          )}
        </ul>
      </Panel>

      {secret && <SetupDialog secret={secret} onClose={() => setSecret(null)} onDone={(c) => { setSecret(null); setCodes(c); }} />}
      {codes && <CodesDialog codes={codes} onClose={() => setCodes(null)} />}
      <ConfirmDialog open={confirmDisable} onOpenChange={setConfirmDisable} destructive loading={disable.isPending}
        title={t('mfa.disableTitle')} description={t('mfa.disableBody')} confirmLabel={t('mfa.disable')} onConfirm={() => void off()} />
    </>
  );
}

function Method({ icon, title, body, badge, children }: { readonly icon: React.ReactNode; readonly title: string; readonly body: string; readonly badge?: React.ReactNode; readonly children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
      <span className="grid size-10 place-items-center rounded-[11px] bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--border)] [&>svg]:size-5 [&>svg]:stroke-[1.5]" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">{title}{badge}</p>
        <p className="text-[13px] text-fg-3">{body}</p>
      </div>
      {children}
    </li>
  );
}

function SetupDialog({ secret, onClose, onDone }: { readonly secret: TotpSetup; readonly onClose: () => void; readonly onDone: (codes: string[]) => void }) {
  const t = getT('account');
  const confirm = useTotpConfirm();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const onSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    setError(undefined);
    confirm.mutate(code, {
      onSuccess: (r) => { toast.security(t('mfa.enabled')); onDone(r.recoveryCodes); },
      onError: (err) => { setError(isApiError(err) ? (err.fields['code'] ?? err.message) : undefined); setCode(''); },
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('mfa.setup.title')} icon={<KeyRound className="size-[18px]" strokeWidth={1.5} />}>
      <form onSubmit={onSubmit} className="grid gap-5 pb-3 sm:grid-cols-[200px_1fr]">
        <div className="grid place-items-center rounded-[14px] bg-white p-3 shadow-[inset_0_0_0_1px_var(--border)]">
          {/* El QR llega como data:image/png del propio servidor (CSP img-src data:). */}
          <img src={secret.qrDataUrl} alt={t('mfa.setup.step1')} width={176} height={176} className="size-44" />
        </div>
        <div className="grid content-start gap-4">
          <p className="text-[13px] text-fg-2"><span className="font-medium text-fg">1.</span> {t('mfa.setup.step1')}</p>
          <div>
            <p className="text-xs text-fg-3">{t('mfa.setup.manual')}</p>
            <code className="mt-1 block select-all break-all rounded-[8px] bg-surface-2 px-2.5 py-2 font-mono text-[12.5px] tracking-wider text-fg shadow-[inset_0_0_0_1px_var(--border)]">{secret.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          </div>
          <p className="text-[13px] text-fg-2"><span className="font-medium text-fg">2.</span> {t('mfa.setup.step2')}</p>
          <OtpInput value={code} onChange={(v) => { setCode(v); }} label={t('reauth.code')} invalid={Boolean(error)} autoFocus />
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
          <Button type="submit" variant="primary" loading={confirm.isPending} disabled={code.length !== 6}>{t('mfa.setup.confirm')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function CodesDialog({ codes, onClose }: { readonly codes: readonly string[]; readonly onClose: () => void }) {
  const t = getT('account');
  const text = codes.join('\n');
  const download = () => {
    // Se genera en el navegador; el servidor solo conserva el hash de cada código.
    const url = URL.createObjectURL(new Blob([`SecurTex · códigos de respaldo\n\n${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'securtex-codigos-respaldo.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('mfa.codes.title')} description={t('mfa.codes.body')} icon={<Ticket className="size-[18px] text-sec" strokeWidth={1.5} />}
      footer={<>
        <Button leading={<Copy className="size-3.5" strokeWidth={1.75} />} onClick={() => { void navigator.clipboard.writeText(text); toast.success(t('mfa.codes.copied')); }}>{t('mfa.codes.copy')}</Button>
        <Button leading={<Download className="size-3.5" strokeWidth={1.75} />} onClick={download}>{t('mfa.codes.download')}</Button>
        <Button variant="primary" onClick={onClose}>{t('mfa.codes.done')}</Button>
      </>}>
      <ol className="grid grid-cols-2 gap-2 pb-2">
        {codes.map((c, i) => (
          <li key={c} className="flex items-center gap-2 rounded-[8px] bg-surface-2 px-3 py-2 font-mono text-[14px] tracking-wider text-fg shadow-[inset_0_0_0_1px_var(--border)]">
            <span className="w-5 text-xs text-fg-3">{i + 1}.</span>{c}
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
