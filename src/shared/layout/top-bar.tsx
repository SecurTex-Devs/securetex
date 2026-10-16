'use client';

import { Bell, BookOpen, FolderKanban, LayoutTemplate, LogOut, Settings2, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useReceivedInvitations } from '@/shared/api/projects';
import { useLogout, useMe } from '@/shared/api/session';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { ThemeToggle } from '@/shared/theme/theme-toggle';
import { Avatar } from '@/shared/ui/avatar';
import { IconButton } from '@/shared/ui/button';
import { Logo } from '@/shared/ui/logo';
import { Menu, MenuItem, MenuLabel, MenuSeparator, Popover } from '@/shared/ui/menu';
import { VerifyBanner } from './verify-banner';

/** Barra de aplicación fija de 52 px (03-Sistema-de-Diseno §4). */
export function TopBar() {
  const t = getT('shell');
  const pathname = usePathname();
  // Silencioso: la galería de plantillas es pública y aquí puede no haber sesión.
  const { data: me, isError } = useMe({ silent401: true });
  const isAdmin = me?.isSystemAdmin === true;
  const nav = [
    { href: '/proyectos', label: t('nav.projects'), icon: FolderKanban },
    { href: '/plantillas', label: t('nav.templates'), icon: LayoutTemplate },
    ...(isAdmin ? [{ href: '/admin', label: t('nav.admin'), icon: ShieldCheck }] : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="flex h-[52px] items-center gap-4 px-4 sm:px-6">
          <Link href={me ? '/proyectos' : '/'} className="rounded-md"><Logo /></Link>
          <nav aria-label={t('nav.main')} className="ml-4 hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-[7px] px-3 text-[13px] font-medium transition-colors duration-[var(--dur-micro)]',
                    active ? 'bg-surface text-fg shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:bg-surface-3/60 hover:text-fg',
                  )}
                >
                  <item.icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {me && <Notifications enabled={me.emailVerified} />}
            <ThemeToggle />
            {isError && !me && (
              <>
                <Link href="/entrar" className="rounded-[7px] px-3 py-1.5 text-[13px] font-medium text-fg hover:bg-surface-3">{getT('landing')('nav.login')}</Link>
                <Link href="/registro" className="rounded-[7px] bg-brand px-3 py-1.5 text-[13px] font-medium text-brand-fg">{getT('landing')('nav.signup')}</Link>
              </>
            )}
            {me && <UserMenu name={`${me.firstName} ${me.lastName}`.trim() || me.primaryEmail} email={me.primaryEmail} id={me.id} isAdmin={isAdmin} />}
          </div>
        </div>
      </header>
      {me && !me.emailVerified && <VerifyBanner />}
    </>
  );
}

function Notifications({ enabled }: { readonly enabled: boolean }) {
  const t = getT('shell');
  const c = getT('common');
  const { data } = useReceivedInvitations(enabled);
  const count = data?.length ?? 0;
  return (
    <Popover
      align="end"
      className="w-[320px]"
      trigger={
        <IconButton
          label={count ? `${t('notifications.label')} · ${count}` : t('notifications.label')}
          size="sm"
          icon={
            <span className="relative">
              <Bell className="size-4" strokeWidth={1.5} />
              {count > 0 && <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 grid size-3.5 place-items-center rounded-full bg-danger text-[9px] font-semibold text-white">{count}</span>}
            </span>
          }
        />
      }
    >
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{t('notifications.label')}</p>
      {count === 0 ? (
        <p className="px-1 py-3 text-[13px] text-fg-2">{t('notifications.empty')}</p>
      ) : (
        <ul className="grid gap-1">
          {data?.map((inv) => (
            <li key={inv.id} className="rounded-[8px] px-2 py-2 text-[13px] text-fg-2 hover:bg-surface-2">
              {t('notifications.invite', { name: inv.project.name, role: c(`roles.${inv.role}`) })}
            </li>
          ))}
          <li><Link href="/proyectos" className="block px-2 pt-2 text-[13px] font-medium text-brand">{t('notifications.see')}</Link></li>
        </ul>
      )}
    </Popover>
  );
}

function UserMenu({ name, email, id, isAdmin }: { readonly name: string; readonly email: string; readonly id: string; readonly isAdmin: boolean }) {
  const t = getT('shell');
  const router = useRouter();
  const logout = useLogout();
  return (
    <Menu
      label={t('user.menu')}
      trigger={
        <button type="button" aria-label={t('user.menu')} className="ml-1 rounded-full transition-transform duration-[var(--dur-micro)] active:scale-95">
          <Avatar name={name} seed={id} size="md" />
        </button>
      }
    >
      <div className="flex items-center gap-3 px-2.5 py-2">
        <Avatar name={name} seed={id} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{name}</p>
          <p className="truncate text-xs text-fg-3">{email}</p>
        </div>
      </div>
      <MenuSeparator />
      <MenuLabel>{name.split(' ')[0]}</MenuLabel>
      <MenuItem icon={<UserRound strokeWidth={1.5} />} onSelect={() => router.push('/ajustes/perfil')}>{t('user.profile')}</MenuItem>
      <MenuItem icon={<ShieldCheck strokeWidth={1.5} />} onSelect={() => router.push('/ajustes/seguridad')}>{t('user.security')}</MenuItem>
      <MenuItem icon={<SlidersHorizontal strokeWidth={1.5} />} onSelect={() => router.push('/ajustes/editor')}>{t('user.preferences')}</MenuItem>
      {isAdmin && <MenuItem icon={<Settings2 strokeWidth={1.5} />} onSelect={() => router.push('/admin')}>{t('user.admin')}</MenuItem>}
      <MenuItem icon={<BookOpen strokeWidth={1.5} />} onSelect={() => router.push('/plantillas')}>{getT('shell')('nav.templates')}</MenuItem>
      <MenuSeparator />
      <MenuItem icon={<LogOut strokeWidth={1.5} />} tone="danger" onSelect={() => logout.mutate()}>{t('user.logout')}</MenuItem>
    </Menu>
  );
}
