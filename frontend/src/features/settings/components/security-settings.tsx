'use client';

import { KeyRound, Laptop, LogOut, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useMe } from '@/shared/api/session';
import type { Activity } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { dateTime, relativeTime } from '@/shared/lib/format';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, PasswordInput } from '@/shared/ui/field';
import { ErrorState, Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';
import { PasswordStrengthMeter } from '@/shared/ui/password-strength';
import { useActivity, useChangePassword, useLogoutOthers, useRevokeSession, useSessions } from '../api';
import { useSensitive } from './reauth';
import { Panel, SettingsHeader } from './settings-shell';

/** P-28 · panel de transparencia: sesiones, contraseña y actividad (RF-008, F-024). */
export function SecuritySettings() {
  const t = getT('account');
  const me = useMe();
  const [changing, setChanging] = useState(false);
  return (
    <>
      <SettingsHeader title={t('security.title')} subtitle={t('security.subtitle')} />
      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-10 place-items-center rounded-[11px] bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--border)]"><KeyRound className="size-5" strokeWidth={1.5} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">{t('security.password')}</p>
            <p className="text-[13px] text-fg-3">
              {me.data?.hasPassword
                ? t('security.passwordUpdated', { when: me.data.passwordUpdatedAt ? relativeTime(me.data.passwordUpdatedAt) : '—' })
                : t('security.passwordNone')}
            </p>
          </div>
          {me.data?.hasPassword && <Button onClick={() => setChanging(true)}>{t('security.change')}</Button>}
        </div>
      </Panel>
      <Sessions />
      <ActivityLog />
      {changing && <ChangePasswordDialog email={me.data?.primaryEmail ?? ''} onClose={() => setChanging(false)} />}
    </>
  );
}

function Sessions() {
  const t = getT('account');
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const logoutOthers = useLogoutOthers();
  const sensitive = useSensitive();
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;
  return (
    <Panel
      title={t('security.sessions')}
      action={others > 0 ? (
        <Button size="sm" variant="ghost" className="text-danger" leading={<LogOut className="size-3.5" strokeWidth={1.75} />} loading={logoutOthers.isPending}
          onClick={() => void sensitive(() => logoutOthers.mutateAsync()).then((r) => r && toast.security(t('security.closedOthers', { n: r.closedSessions })))}>
          {t('security.closeOthers')}
        </Button>
      ) : undefined}
      className="[&>div:last-child]:p-0"
    >
      {sessions.isLoading ? <div className="grid gap-2 p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        : sessions.error ? <ErrorState compact error={sessions.error} onRetry={() => void sessions.refetch()} /> : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-fg-3">
                <th scope="col" className="py-2.5 pl-5 font-semibold">{t('security.device')}</th>
                <th scope="col" className="hidden font-semibold sm:table-cell">{t('security.location')}</th>
                <th scope="col" className="font-semibold">{t('security.lastSeen')}</th>
                <th scope="col" className="pr-5"><span className="sr-only">{t('security.close')}</span></th>
              </tr>
            </thead>
            <tbody>
              {sessions.data?.map((s) => {
                const Icon = /iOS|Android/.test(s.deviceLabel) ? Smartphone : Laptop;
                return (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="py-3 pl-5">
                      <span className="flex items-center gap-2.5">
                        <Icon className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                        <span className="font-medium text-fg">{s.deviceLabel}</span>
                        {s.current && <Badge size="sm" tone="ok">{t('security.thisSession')}</Badge>}
                        <span className="text-xs text-fg-3">· {t(`security.method.${s.authMethod as 'password'}`)}</span>
                      </span>
                    </td>
                    <td className="hidden font-mono text-xs text-fg-2 sm:table-cell">{s.ipPrefix}</td>
                    <td className="text-fg-2">{s.current ? getT('common')('time.now') : relativeTime(s.lastSeenAt)}</td>
                    <td className="pr-5 text-right">
                      {!s.current && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id, { onSuccess: () => toast.security(t('security.closed')) })}>{t('security.close')}</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
    </Panel>
  );
}

const TONE: Record<string, { tone: BadgeTone; label: 'events.tone.access' | 'events.tone.warning' | 'events.tone.permission' }> = {
  success: { tone: 'ok', label: 'events.tone.access' },
  failure: { tone: 'warn', label: 'events.tone.warning' },
  denied: { tone: 'danger', label: 'events.tone.warning' },
};

function ActivityLog() {
  const t = getT('account');
  const activity = useActivity();
  return (
    <Panel title={t('security.activity')} description={t('security.ipNote')}>
      {activity.isLoading ? <Skeleton className="h-24" /> : activity.error ? <ErrorState compact error={activity.error} /> : activity.data?.length === 0 ? (
        <p className="text-[13px] text-fg-3">{t('security.activityEmpty')}</p>
      ) : (
        <ol className="grid gap-2.5">
          {activity.data?.map((e: Activity) => {
            const permission = e.eventType.startsWith('project.');
            const tone = permission ? { tone: 'brand' as const, label: 'events.tone.permission' as const } : (TONE[e.outcome] ?? TONE['success']);
            const key = `events.${e.eventType}` as Parameters<typeof t>[0];
            const label = t(key);
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <Badge size="sm" tone={tone?.tone ?? 'neutral'}>{t(tone?.label ?? 'events.tone.access')}</Badge>
                <span className="text-fg-2 tabular">{dateTime(e.occurredAt)}</span>
                <span className="text-fg">{label === key ? e.eventType : label}</span>
                {e.actorIpPrefix && <span className="font-mono text-xs text-fg-3">{e.actorIpPrefix}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function ChangePasswordDialog({ email, onClose }: { readonly email: string; readonly onClose: () => void }) {
  const t = getT('account');
  const change = useChangePassword();
  const sensitive = useSensitive();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      const r = await sensitive(() => change.mutateAsync(value));
      if (r) { toast.security(t('security.changed'), t('security.changedHint', { n: r.closedSessions })); onClose(); }
    } catch (err) {
      setError(isApiError(err) ? (err.fields['newPassword'] ?? err.message) : undefined);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('security.changeTitle')} width="sm">
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 pb-3">
        <Field label={t('security.newPassword')} error={error}>
          {(a) => <div><PasswordInput {...a} autoFocus autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} /><PasswordStrengthMeter password={value} email={email} /></div>}
        </Field>
        <Button type="submit" variant="primary" loading={change.isPending} disabled={!value}>{t('security.change')}</Button>
      </form>
    </Dialog>
  );
}
