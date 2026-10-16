'use client';

import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useChangeRole, useInviteMember, useMembers, useRevokeInvitation, useRevokeMember } from '@/shared/api/projects';
import type { InvitableRole, Project } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { ErrorState, Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';

const ROLES: readonly InvitableRole[] = ['editor', 'reviewer', 'viewer'];

/**
 * P-24 · compartir. Conectado a la API real: invitar, cambiar rol, revocar.
 * El rol «owner» no aparece como opción ni la API lo acepta (T-A11).
 */
export function ShareDialog({ project, open, onOpenChange }: { readonly project: Project; readonly open: boolean; readonly onOpenChange: (o: boolean) => void }) {
  const t = getT('share');
  const c = getT('common');
  const isOwner = project.role === 'owner';
  const members = useMembers(project.id, open);
  const invite = useInviteMember(project.id);
  const revokeInvite = useRevokeInvitation(project.id);
  const changeRole = useChangeRole(project.id);
  const revoke = useRevokeMember(project.id);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('editor');
  const [error, setError] = useState<string | null>(null);

  const onInvite = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    invite.mutate({ email, role }, {
      onSuccess: () => { toast.success(t('invited', { email })); setEmail(''); void members.refetch(); },
      onError: (err) => setError(isApiError(err) ? (err.fields['email'] ?? err.message) : null),
    });
  };

  const roleOptions = ROLES.map((r) => ({ value: r, label: c(`roles.${r}`), hint: c(`roles.${r}.hint`) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} width="lg" title={t('title', { name: project.name })} description={t('description')} icon={<UserPlus className="size-[18px]" strokeWidth={1.5} />}>
      {isOwner ? (
        <form onSubmit={onInvite} className="flex flex-wrap items-start gap-2">
          <div className="min-w-[220px] flex-1">
            <Input type="email" aria-label={t('email')} placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} {...(error ? { 'aria-invalid': true } : {})} />
            {error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
          </div>
          <div className="w-[170px]"><Select label={t('role')} value={role} onValueChange={setRole} options={roleOptions} /></div>
          <Button type="submit" variant="primary" loading={invite.isPending} disabled={!email}>{t('invite')}</Button>
        </form>
      ) : <Notice tone="info">{t('onlyOwner')}</Notice>}

      <h3 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{t('members')}</h3>
      {members.isLoading ? (
        <div className="grid gap-2" role="status" aria-label={t('loading')}>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>
      ) : members.error ? <ErrorState compact error={members.error} onRetry={() => void members.refetch()} /> : (
        <ul className="grid divide-y divide-line rounded-[12px] shadow-[inset_0_0_0_1px_var(--border)]">
          {members.data?.members.map((m) => {
            const name = `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.primaryEmail;
            return (
              <li key={m.userId} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={name} seed={m.userId} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{name}</p>
                  <p className="truncate text-xs text-fg-3">{m.user.primaryEmail}</p>
                </div>
                {m.role === 'owner' || !isOwner ? <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{c(`roles.${m.role}`)}</Badge> : (
                  <>
                    <div className="w-[150px]"><Select label={t('role')} value={m.role as InvitableRole} onValueChange={(r) => changeRole.mutate({ userId: m.userId, role: r }, { onSuccess: () => { toast.success(t('roleChanged')); void members.refetch(); } })} options={roleOptions} /></div>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => revoke.mutate(m.userId, { onSuccess: () => { toast.security(t('revoked')); void members.refetch(); } })}>{t('revoke')}</Button>
                  </>
                )}
              </li>
            );
          })}
          {members.data?.invitations.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={inv.email} size="md" className="opacity-60" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{inv.email}</p>
                <p className="text-xs text-fg-3">{t('pending')} · {c(`roles.${inv.role}`)}</p>
              </div>
              {isOwner && <Button size="sm" variant="ghost" onClick={() => revokeInvite.mutate(inv.id, { onSuccess: () => void members.refetch() })}>{t('revokeInvite')}</Button>}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-fg-3">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-sec" strokeWidth={1.75} aria-hidden="true" />
        {t('security.revoke')}
      </p>
    </Dialog>
  );
}
