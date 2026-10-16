'use client';

import { CheckCircle2, Clock3 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useMe } from '@/shared/api/session';
import { getT } from '@/shared/i18n';
import { shortDate } from '@/shared/lib/format';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/controls';
import { Field, Input } from '@/shared/ui/field';
import { ErrorState, Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';
import { useUpdateProfile } from '../api';
import { Panel, SettingsHeader } from './settings-shell';

const ZONES = ['America/Guayaquil', 'America/Bogota', 'America/Lima', 'America/Mexico_City', 'Europe/Madrid', 'UTC'] as const;

/** P-27 · perfil (RF-012). */
export function ProfileSettings() {
  const t = getT('account');
  const me = useMe();
  const update = useUpdateProfile();
  const [form, setForm] = useState({ firstName: '', lastName: '', institution: '', roleTitle: '', locale: 'es' as 'es' | 'en', timezone: 'America/Guayaquil' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (me.data) setForm({ firstName: me.data.firstName, lastName: me.data.lastName, institution: me.data.institution, roleTitle: me.data.roleTitle, locale: me.data.locale === 'en' ? 'en' : 'es', timezone: me.data.timezone });
  }, [me.data]);

  if (me.isLoading) return <div className="grid gap-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64" /></div>;
  if (me.error || !me.data) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  const name = `${me.data.firstName} ${me.data.lastName}`.trim() || me.data.primaryEmail;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    update.mutate(form, {
      onSuccess: () => toast.success(t('profile.saved')),
      onError: (err) => { if (isApiError(err)) setErrors({ ...err.fields }); },
    });
  };

  return (
    <>
      <SettingsHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
      <Panel>
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={name} seed={me.data.id} size="xl" />
          <div>
            <p className="font-serif text-[22px] font-medium text-fg">{name}</p>
            <p className="text-[13px] text-fg-3">{t('profile.since', { date: shortDate(me.data.createdAt) })}</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.firstName')} error={errors['firstName']}>{(a) => <Input {...a} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} maxLength={80} autoComplete="given-name" />}</Field>
          <Field label={t('profile.lastName')} error={errors['lastName']}>{(a) => <Input {...a} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} maxLength={80} autoComplete="family-name" />}</Field>
          <Field label={t('profile.institution')} optional>{(a) => <Input {...a} value={form.institution} onChange={(e) => set('institution', e.target.value)} maxLength={80} autoComplete="organization" />}</Field>
          <Field label={t('profile.roleTitle')} optional>{(a) => <Input {...a} value={form.roleTitle} onChange={(e) => set('roleTitle', e.target.value)} maxLength={80} />}</Field>
          <Field label={t('profile.locale')}>{(a) => <Select {...a} value={form.locale} onValueChange={(v) => set('locale', v)} options={[{ value: 'es', label: 'Español (Ecuador)' }, { value: 'en', label: 'English' }]} />}</Field>
          <Field label={t('profile.timezone')}>{(a) => <Select {...a} value={form.timezone as (typeof ZONES)[number]} onValueChange={(v) => set('timezone', v)} options={ZONES.map((z) => ({ value: z, label: z.replace('_', ' ') }))} />}</Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="primary" loading={update.isPending}>{t('profile.save')}</Button>
          </div>
        </form>
      </Panel>
      <Panel title={t('profile.emails')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[13px] text-fg">{me.data.primaryEmail}</span>
          <Badge tone="brand" size="sm">{t('profile.primary')}</Badge>
          {me.data.emailVerified
            ? <Badge tone="ok" size="sm" icon={<CheckCircle2 strokeWidth={2} />}>{t('profile.verified')}</Badge>
            : <Badge tone="warn" size="sm" icon={<Clock3 strokeWidth={2} />}>{t('profile.unverified')}</Badge>}
        </div>
      </Panel>
    </>
  );
}
