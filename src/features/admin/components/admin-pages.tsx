'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LayoutDashboard, LogIn, ScrollText, Search, ShieldAlert, ShieldCheck, ShieldX, UserCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { api, unwrap } from '@/shared/api/client';
import { isApiError } from '@/shared/api/errors';
import { useMe } from '@/shared/api/session';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { dateTime, relativeTime } from '@/shared/lib/format';
import { Avatar } from '@/shared/ui/avatar';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';

const NAV = [
  { href: '/admin', label: 'nav.overview', icon: LayoutDashboard },
  { href: '/admin/usuarios', label: 'nav.users', icon: Users },
  { href: '/admin/auditoria', label: 'nav.audit', icon: ScrollText },
] as const;

const adminKeys = {
  users: (q: string) => ['admin', 'users', q] as const,
  audit: ['admin', 'audit'] as const,
};

function useAdminUsers(q = '') {
  return useQuery({
    queryKey: adminKeys.users(q),
    queryFn: () => unwrap(api.GET('/api/v1/admin/users', { params: { query: q ? { q } : {} } })),
    retry: false,
  });
}

function useAuditEvents() {
  return useQuery({ queryKey: adminKeys.audit, queryFn: () => unwrap(api.GET('/api/v1/admin/audit')), retry: false });
}

export function AdminShell({ children }: { readonly children: ReactNode }) {
  const t = getT('admin');
  const pathname = usePathname();
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-8 sm:px-6 md:flex-row lg:py-10">
      <nav aria-label={t('nav.label')} className="shrink-0 md:w-[210px]">
        <p className="mb-4 font-serif text-[26px] font-medium tracking-[-0.02em] text-fg">{t('title')}</p>
        <ul className="grid gap-0.5">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? 'page' : undefined} className={cn('flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-[13px]', active ? 'bg-surface font-medium text-fg shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:bg-surface-3/60 hover:text-fg')}>
                  <n.icon className={cn('size-4', active ? 'text-brand' : 'text-fg-3')} strokeWidth={1.5} aria-hidden="true" />{t(n.label)}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 px-2.5 text-xs leading-relaxed text-fg-3">{t('nav.note')}</p>
      </nav>
      <main id="contenido" className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

function Header({ title, subtitle, action }: { readonly title: string; readonly subtitle?: string; readonly action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        <h1 className="font-serif text-[32px] font-medium leading-tight tracking-[-0.02em] text-fg">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[66ch] text-sm text-fg-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** El 403 de la API es la frontera real; la interfaz solo lo explica. */
function Forbidden() {
  return <EmptyState icon={<ShieldX strokeWidth={1.5} />} title={getT('states')('notFound.title')} description={getT('states')('notFound.body')} />;
}
const isForbidden = (e: unknown) => isApiError(e) && e.kind === 'forbidden';

// ─────────────────────────── P-38 · resumen ───────────────────────────

function StatTile({ label, value, hint, icon, tone = 'neutral' }: { readonly label: string; readonly value: string; readonly hint: string; readonly icon: ReactNode; readonly tone?: BadgeTone }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-[13px] text-fg-2">{label}<span className="text-fg-3 [&>svg]:size-4" aria-hidden="true">{icon}</span></div>
      <p className="mt-2 font-serif text-[34px] font-medium leading-none tracking-[-0.02em] text-fg tabular">{value}</p>
      <Badge size="sm" tone={tone} className="mt-2.5">{hint}</Badge>
    </div>
  );
}

const SIGNALS: Readonly<Record<string, { readonly icon: typeof ShieldX; readonly tone: 'danger' | 'warn' }>> = {
  'compile.blocked': { icon: ShieldX, tone: 'danger' },
  'integrity.violation': { icon: ShieldX, tone: 'danger' },
  'auth.refresh.reuse_detected': { icon: ShieldAlert, tone: 'danger' },
  'auth.login.locked': { icon: ShieldAlert, tone: 'warn' },
  'authz.denied': { icon: ShieldAlert, tone: 'warn' },
  'admin.user.suspended': { icon: ShieldAlert, tone: 'warn' },
};

/** Resumen calculado con datos reales: cuentas (API de administración) y los últimos 200 eventos de auditoría. */
export function AdminOverview() {
  const t = getT('admin');
  const users = useAdminUsers();
  const events = useAuditEvents();
  if (isForbidden(users.error) || isForbidden(events.error)) return <Forbidden />;

  const list = users.data ?? [];
  const evts = events.data ?? [];
  const active = list.filter((u) => u.status === 'active').length;
  const withMfa = list.filter((u) => u.mfaEnabled).length;
  const suspended = list.filter((u) => u.status === 'suspended').length;
  const count = (pred: (type: string, outcome: string) => boolean) => evts.filter((e) => pred(e.eventType, e.outcome)).length;
  const failedLogins = count((type, outcome) => type.startsWith('auth.login') && outcome !== 'success');
  const blocked = count((type) => type === 'compile.blocked');
  const denied = count((type) => type === 'authz.denied');
  const signals = evts.filter((e) => e.severity === 'warning' || e.severity === 'critical').slice(0, 8);
  const pct = list.length ? Math.round((withMfa / list.length) * 100) : 0;

  return (
    <>
      <Header title={t('overview.title')} subtitle={t('overview.subtitle')} />
      {users.isLoading || events.isLoading ? <Skeleton className="h-64" /> : users.error ? <ErrorState error={users.error} onRetry={() => void users.refetch()} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-3">
            <StatTile label={t('overview.users')} value={String(list.length)} hint={t('overview.usersHint', { n: active })} icon={<Users strokeWidth={1.5} />} tone="ok" />
            <StatTile label={t('overview.mfa')} value={`${pct} %`} hint={t('overview.mfaHint', { n: withMfa })} icon={<KeyRound strokeWidth={1.5} />} tone={pct >= 50 ? 'sec' : 'warn'} />
            <StatTile label={t('overview.suspended')} value={String(suspended)} hint={t('overview.suspendedHint')} icon={<UserCheck strokeWidth={1.5} />} />
            <StatTile label={t('overview.failedLogins')} value={String(failedLogins)} hint={t('overview.window')} icon={<LogIn strokeWidth={1.5} />} tone={failedLogins ? 'warn' : 'ok'} />
            <StatTile label={t('overview.blocked')} value={String(blocked)} hint={t('overview.window')} icon={<ShieldX strokeWidth={1.5} />} tone="sec" />
            <StatTile label={t('overview.denied')} value={String(denied)} hint={t('overview.window')} icon={<ShieldAlert strokeWidth={1.5} />} tone={denied ? 'warn' : 'ok'} />
          </div>
          <section className="card p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-fg">{t('overview.signals')}</h2>
              <Link href="/admin/auditoria" className="text-xs text-brand hover:underline">{t('overview.allEvents')}</Link>
            </div>
            {signals.length === 0 ? (
              <p className="flex items-center gap-2 text-[13px] text-ok"><ShieldCheck className="size-4" strokeWidth={1.75} aria-hidden="true" />{t('overview.noSignals')}</p>
            ) : (
              <ul className="grid gap-2">
                {signals.map((e) => {
                  const s = SIGNALS[e.eventType] ?? { icon: ShieldAlert, tone: e.severity === 'critical' ? 'danger' : 'warn' };
                  return (
                    <li key={e.id} className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)]">
                      <s.icon className={cn('size-4 shrink-0', s.tone === 'danger' ? 'text-danger' : 'text-warn')} strokeWidth={1.75} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg">{e.eventType}{e.reason ? <span className="text-fg-3"> · {e.reason}</span> : null}</span>
                      <span className="whitespace-nowrap text-xs text-fg-3" title={dateTime(e.occurredAt)}>{relativeTime(e.occurredAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

// ─────────────────────────── P-39 · usuarios ───────────────────────────

const STATUS_TONE: Record<string, BadgeTone> = { active: 'ok', pending: 'warn', suspended: 'danger', deleted: 'neutral' };

export function AdminUsers() {
  const t = getT('admin');
  const qc = useQueryClient();
  const me = useMe();
  const [q, setQ] = useState('');
  const users = useAdminUsers();
  const [target, setTarget] = useState<{ id: string; email: string; suspend: boolean } | null>(null);
  const toggle = useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) => {
      const params = { params: { path: { userId: id } } };
      return suspend ? unwrap(api.POST('/api/v1/admin/users/{userId}/suspend', params)) : unwrap(api.POST('/api/v1/admin/users/{userId}/reactivate', params));
    },
    onSuccess: async (_r, v) => {
      toast.security(v.suspend ? t('users.suspended') : t('users.reactivated'), target?.email);
      setTarget(null);
      await qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : getT('states')('error.title')),
  });
  const rows = useMemo(() => (users.data ?? []).filter((u) => `${u.firstName} ${u.lastName} ${u.primaryEmail}`.toLowerCase().includes(q.trim().toLowerCase())), [users.data, q]);
  if (isForbidden(users.error)) return <Forbidden />;

  return (
    <>
      <Header title={t('users.title')} subtitle={t('users.note')} action={
        <div className="relative w-[280px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" strokeWidth={1.5} aria-hidden="true" /><Input type="search" aria-label={t('users.search')} placeholder={t('users.search')} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></div>
      } />
      {users.isLoading ? <Skeleton className="h-80" /> : users.error ? <ErrorState error={users.error} onRetry={() => void users.refetch()} /> : rows.length === 0 ? <EmptyState title={t('users.empty')} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-fg-3">
              <th scope="col" className="py-2.5 pl-5 font-semibold">{t('users.user')}</th>
              <th scope="col" className="font-semibold">{t('users.mfa')}</th>
              <th scope="col" className="font-semibold">{t('users.status')}</th>
              <th scope="col" className="font-semibold">{t('users.sessions')}</th>
              <th scope="col" className="font-semibold">{t('users.lastLogin')}</th>
              <th scope="col" className="pr-5"><span className="sr-only">{t('users.actions')}</span></th>
            </tr></thead>
            <tbody>
              {rows.map((u) => {
                const name = `${u.firstName} ${u.lastName}`.trim() || u.primaryEmail;
                const suspended = u.status === 'suspended';
                const self = u.id === me.data?.id;
                return (
                  <tr key={u.id} className="border-b border-line last:border-0">
                    <td className="py-3 pl-5">
                      <span className="flex items-center gap-3">
                        <Avatar name={name} seed={u.id} size="sm" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-medium text-fg">{name}{u.isSystemAdmin && <Badge size="sm" tone="brand">{t('users.admin')}</Badge>}</span>
                          <span className="block truncate text-xs text-fg-3">{u.primaryEmail}</span>
                        </span>
                      </span>
                    </td>
                    <td>{u.mfaEnabled ? <Badge size="sm" tone="sec" icon={<ShieldCheck strokeWidth={2} />}>TOTP</Badge> : <Badge size="sm">—</Badge>}</td>
                    <td><Badge size="sm" tone={STATUS_TONE[u.status] ?? 'neutral'}>{t(`users.status.${u.status}`)}</Badge></td>
                    <td className="tabular text-fg-2">{u.activeSessions}</td>
                    <td className="whitespace-nowrap text-fg-2">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : t('users.never')}</td>
                    <td className="pr-5 text-right">
                      {!self && u.status !== 'deleted' && (
                        <Button size="sm" variant={suspended ? 'default' : 'ghost'} className={suspended ? undefined : 'text-danger'} onClick={() => setTarget({ id: u.id, email: u.primaryEmail, suspend: !suspended })}>
                          {suspended ? t('users.reactivate') : t('users.suspend')}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.suspend ? t('users.suspendTitle', { email: target.email }) : t('users.reactivateTitle', { email: target?.email ?? '' })}
        description={target?.suspend ? t('users.suspendBody') : t('users.reactivateBody')}
        confirmLabel={target?.suspend ? t('users.suspend') : t('users.reactivate')}
        destructive={target?.suspend ?? false}
        loading={toggle.isPending}
        onConfirm={() => target && toggle.mutate({ id: target.id, suspend: target.suspend })}
      />
    </>
  );
}

// ─────────────────────────── P-41 · auditoría (API real) ───────────────────────────

const OUTCOME_TONE: Record<string, BadgeTone> = { success: 'ok', failure: 'warn', denied: 'danger' };

export function AdminAudit() {
  const t = getT('admin');
  const events = useAuditEvents();
  const verify = useMutation({ mutationFn: () => unwrap(api.GET('/api/v1/admin/audit/verify')) });
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => (events.data ?? []).filter((e) => e.eventType.includes(filter)), [events.data, filter]);
  if (isForbidden(events.error)) return <Forbidden />;
  return (
    <>
      <Header title={t('audit.title')} subtitle={t('audit.subtitle')} action={
        <Button variant="primary" loading={verify.isPending} leading={<ShieldCheck className="size-4" strokeWidth={1.75} />} onClick={() => verify.mutate()}>{t('audit.verify')}</Button>
      } />
      {verify.data && (
        <Notice tone={verify.data.ok ? 'sec' : 'danger'} className="mb-5">
          {verify.data.ok ? t('audit.ok', { n: verify.data.checked }) : t('audit.broken', { seq: verify.data.brokenAtSeq ?? '?' })}
        </Notice>
      )}
      <div className="mb-3 max-w-[320px]"><Input aria-label="Filtrar por tipo de evento" placeholder="auth.login, project., authz.denied…" value={filter} onChange={(e) => setFilter(e.target.value)} className="font-mono text-xs" /></div>
      {events.isLoading ? <Skeleton className="h-80" /> : events.error ? <ErrorState error={events.error} onRetry={() => void events.refetch()} /> : rows.length === 0 ? <EmptyState title={t('audit.empty')} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-fg-3">
              {(['seq', 'when', 'event', 'actor', 'outcome', 'hash'] as const).map((c) => <th key={c} scope="col" className="py-2.5 pl-4 font-semibold">{t(`audit.col.${c}`)}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                  <td className="py-2 pl-4 font-mono text-fg-3 tabular">{e.seq}</td>
                  <td className="whitespace-nowrap pl-4 text-fg-2 tabular">{dateTime(e.occurredAt)}</td>
                  <td className="pl-4 font-mono text-fg">{e.eventType}</td>
                  <td className="pl-4 font-mono text-[11px] text-fg-3">{e.actorUserId?.slice(0, 8) ?? '—'} · {e.actorIpPrefix ?? ''}</td>
                  <td className="pl-4"><Badge size="sm" tone={OUTCOME_TONE[e.outcome] ?? 'neutral'}>{e.outcome}</Badge></td>
                  <td className="pl-4 pr-4 font-mono text-[11px] text-fg-3">{e.hash.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
