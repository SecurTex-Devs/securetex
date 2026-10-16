import { ArrowUpRight, FileCheck2, Fingerprint, GraduationCap, KeyRound, Link2, Lock, PenLine, ScanSearch, ScrollText, ShieldCheck, ShieldX, UserRoundCheck, UsersRound } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { ThemeToggle } from '@/shared/theme/theme-toggle';
import { Logo } from '@/shared/ui/logo';
import { HeroVisual } from './hero-visual';
import { Reveal } from './reveal';

function PillCta({ href, children, variant = 'primary' }: { readonly href: string; readonly children: ReactNode; readonly variant?: 'primary' | 'ghost' }) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex h-12 items-center gap-3 rounded-full pl-6 pr-1.5 text-[15px] font-medium transition-[transform,background-color] duration-200 ease-[var(--ease-out)] active:scale-[0.98]',
        variant === 'primary' ? 'bg-fg text-bg hover:opacity-95' : 'bg-surface text-fg shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-surface-2',
      )}
    >
      {children}
      <span className={cn('grid size-9 place-items-center rounded-full transition-transform duration-200 ease-[var(--ease-out)] group-hover:-translate-y-px group-hover:translate-x-0.5', variant === 'primary' ? 'bg-bg/15' : 'bg-surface-3')}>
        <ArrowUpRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
    </Link>
  );
}

function Nav() {
  const t = getT('landing');
  return (
    <header className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <nav aria-label="Principal" className="flex w-full max-w-[960px] items-center gap-2 rounded-full bg-surface/75 py-1.5 pl-4 pr-1.5 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)] backdrop-blur-xl">
        <Link href="/" className="rounded-md"><Logo /></Link>
        <ul className="ml-6 hidden items-center gap-1 text-[13px] text-fg-2 md:flex">
          <li><a href="#producto" className="rounded-full px-3 py-1.5 hover:bg-surface-3 hover:text-fg">{t('nav.product')}</a></li>
          <li><a href="#seguridad" className="rounded-full px-3 py-1.5 hover:bg-surface-3 hover:text-fg">{t('nav.security')}</a></li>
          <li><Link href="/plantillas" className="rounded-full px-3 py-1.5 hover:bg-surface-3 hover:text-fg">{t('nav.templates')}</Link></li>
        </ul>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link href="/entrar" className="hidden rounded-full px-3.5 py-2 text-[13px] font-medium text-fg hover:bg-surface-3 sm:block">{t('nav.login')}</Link>
          <Link href="/registro" className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-brand-fg transition-transform active:scale-[0.97]">{t('nav.signup')}</Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  const t = getT('landing');
  return (
    <section className="relative overflow-hidden px-4 pb-24 pt-36 sm:px-6 md:pt-44">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--brand-soft),transparent)] opacity-90" />
      <div className="relative mx-auto max-w-[1180px]">
        <div className="mx-auto max-w-[880px] text-center">
          <p className="eyebrow animate-rise"><ShieldCheck className="size-3.5 text-sec" strokeWidth={2} aria-hidden="true" />{t('hero.eyebrow')}</p>
          <h1 className="mt-7 animate-rise font-serif text-[clamp(2.6rem,6.4vw,5.4rem)] font-medium leading-[0.98] tracking-[-0.035em] text-fg [animation-delay:60ms]">
            {t('hero.title1')}<br />
            <em className="text-brand">{t('hero.title2')}</em> {t('hero.title3')}
          </h1>
          <p className="mx-auto mt-7 max-w-[60ch] animate-rise text-[17px] leading-relaxed text-fg-2 [animation-delay:120ms]">{t('hero.body')}</p>
          <div className="mt-9 flex animate-rise flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
            <PillCta href="/registro">{t('hero.cta')}</PillCta>
            <PillCta href="/plantillas" variant="ghost">{t('hero.secondary')}</PillCta>
          </div>
          <p className="mt-8 animate-rise font-mono text-[11.5px] uppercase tracking-[0.14em] text-fg-3 [animation-delay:240ms]">{t('hero.stack')}</p>
        </div>
        <div id="producto" className="mx-auto mt-16 max-w-[1120px] scroll-mt-28">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

const PIPELINE = [
  { icon: Lock, key: '1' },
  { icon: FileCheck2, key: '2' },
  { icon: ScanSearch, key: '3' },
  { icon: ScrollText, key: '4' },
] as const;

function Pipeline() {
  const t = getT('landing');
  return (
    <section id="seguridad" className="scroll-mt-24 px-4 py-28 sm:px-6">
      <div className="mx-auto grid max-w-[1180px] gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
        <Reveal>
          <p className="eyebrow">{t('pipeline.eyebrow')}</p>
          <h2 className="mt-6 font-serif text-[clamp(2rem,4vw,3.3rem)] font-medium leading-[1.04] tracking-[-0.03em] text-fg">{t('pipeline.title')}</h2>
          <p className="mt-5 max-w-[48ch] text-[16px] leading-relaxed text-fg-2">{t('pipeline.body')}</p>
        </Reveal>
        <ol className="grid gap-3 sm:grid-cols-2">
          {PIPELINE.map(({ icon: Icon, key }, i) => (
            <Reveal key={key} as="li" delay={i * 90}>
              <div className="bezel h-full">
                <div className="bezel-core h-full p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-[11px] bg-sec-soft text-sec"><Icon className="size-5" strokeWidth={1.5} aria-hidden="true" /></span>
                    <span className="font-mono text-xs text-fg-3">0{key}</span>
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold text-fg">{t(`pipeline.${key}.title`)}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{t(`pipeline.${key}.body`)}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function BentoCard({ className, icon, title, body, children, delay = 0 }: {
  readonly className?: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly children?: ReactNode;
  readonly delay?: number;
}) {
  return (
    <Reveal delay={delay} className={cn('bezel', className)}>
      <div className="bezel-core flex h-full flex-col overflow-hidden p-6">
        <span className="grid size-10 place-items-center rounded-[11px] bg-brand-soft text-brand [&>svg]:size-5">{icon}</span>
        <h3 className="mt-5 font-serif text-[22px] font-medium tracking-[-0.01em] text-fg">{title}</h3>
        <p className="mt-1.5 max-w-[44ch] text-[14px] leading-relaxed text-fg-2">{body}</p>
        {children && <div className="mt-6 flex-1">{children}</div>}
      </div>
    </Reveal>
  );
}

function Bento() {
  const t = getT('landing');
  return (
    <section className="px-4 py-28 sm:px-6">
      <div className="mx-auto max-w-[1180px]">
        <Reveal className="mx-auto max-w-[720px] text-center">
          <p className="eyebrow">{t('bento.eyebrow')}</p>
          <h2 className="mt-6 font-serif text-[clamp(2rem,4vw,3.3rem)] font-medium leading-[1.04] tracking-[-0.03em] text-fg">{t('bento.title')}</h2>
        </Reveal>
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
          <BentoCard className="md:col-span-4" icon={<UsersRound strokeWidth={1.5} />} title={t('bento.collab.title')} body={t('bento.collab.body')}>
            <ul className="grid gap-2 sm:grid-cols-3" aria-hidden="true">
              {([['Ana Torres', 'AT', 'bg-u1', 'Propietaria', 'todo'], ['María Rodríguez', 'MR', 'bg-u3', 'Editora', 'escribe y compila'], ['Jorge Cárdenas', 'JC', 'bg-u2', 'Revisor', 'lee y compila']] as const).map(([name, initials, color, role, can]) => (
                <li key={name} className="flex items-center gap-3 rounded-[12px] bg-sunken px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--border)]">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white', color)}>{initials}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-fg">{name}</span>
                    <span className="block truncate text-[11.5px] text-fg-3">{role} · {can}</span>
                  </span>
                </li>
              ))}
            </ul>
          </BentoCard>
          <BentoCard className="md:col-span-2" delay={80} icon={<KeyRound strokeWidth={1.5} />} title={t('bento.crypto.title')} body={t('bento.crypto.body')}>
            <ol className="grid gap-1.5 font-mono text-[11px]" aria-hidden="true">
              {['KEK por proyecto · AES-256-KW', 'DEK por guardado · AES-256-GCM', 'AAD · proyecto ‖ archivo ‖ versión', 'HMAC-SHA-256 · antes de descifrar'].map((l, i) => (
                <li key={l} className="flex items-center gap-2 rounded-[7px] bg-sec-soft px-2.5 py-1.5 text-sec" style={{ marginLeft: i * 6 }}>{l}</li>
              ))}
            </ol>
          </BentoCard>
          <BentoCard className="md:col-span-2" delay={40} icon={<ShieldX strokeWidth={1.5} />} title={t('bento.blocked.title')} body={t('bento.blocked.body')}>
            <div className="rounded-[10px] bg-danger-soft p-3 text-[12px] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_22%,transparent)]" aria-hidden="true">
              <p className="font-medium text-danger">bloqueante · Ejecución de comandos</p>
              <p className="mt-1 font-mono text-[11px] text-fg-2">informe.tex:12 · \immediate\write18{'{…}'}</p>
              <p className="mt-1.5 text-fg-2">Precalcula el resultado y súbelo como archivo.</p>
            </div>
          </BentoCard>
          <BentoCard className="md:col-span-2" delay={120} icon={<Link2 strokeWidth={1.5} />} title={t('bento.audit.title')} body={t('bento.audit.body')}>
            <div className="flex items-center gap-1.5 overflow-hidden font-mono text-[10px]" aria-hidden="true">
              {['9f2c…', 'a71e…', '3bd0…', 'e458…'].map((h, i) => (
                <span key={h} className="flex items-center gap-1.5">
                  <span className="rounded-[6px] bg-surface-2 px-2 py-1.5 text-fg-2 shadow-[inset_0_0_0_1px_var(--border)]">#{1041 + i}<br /><span className="text-fg-3">{h}</span></span>
                  {i < 3 && <span className="text-fg-3">→</span>}
                </span>
              ))}
            </div>
          </BentoCard>
          <BentoCard className="md:col-span-2" delay={160} icon={<Fingerprint strokeWidth={1.5} />} title={t('bento.mfa.title')} body={t('bento.mfa.body')}>
            <div className="flex justify-between gap-1.5 font-mono text-lg text-fg" aria-hidden="true">
              {['4', '8', '1', '2', '7', '9'].map((d, i) => <span key={i} className={cn('grid h-11 flex-1 place-items-center rounded-[8px] bg-surface-2 shadow-[inset_0_0_0_1px_var(--border-strong)]', i === 3 && 'ml-1.5')}>{d}</span>)}
            </div>
          </BentoCard>
          <BentoCard className="md:col-span-6" delay={60} icon={<ShieldCheck strokeWidth={1.5} />} title={t('bento.rls.title')} body={t('bento.rls.body')}>
            <pre className="overflow-x-auto rounded-[12px] bg-ink p-4 font-mono text-[12px] leading-relaxed text-ink-fg/80" aria-hidden="true">
              <span className="text-[#b7c3ff]">CREATE POLICY</span> projects_select <span className="text-[#b7c3ff]">ON</span> projects <span className="text-[#b7c3ff]">FOR SELECT USING</span> ({'\n'}
              {'  '}owner_id = app_current_user(){'\n'}
              {'  '}<span className="text-[#b7c3ff]">OR</span> app_has_project_role(id, <span className="text-[#7ee2b0]">{"ARRAY['owner','editor','reviewer','viewer']"}</span>){'\n'}
              );  <span className="text-ink-fg/40">-- sin contexto de usuario: cero filas (fail closed)</span>
            </pre>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function Roles() {
  const t = getT('landing');
  const items = [
    { icon: GraduationCap, title: t('roles.student'), body: t('roles.studentBody'), color: 'bg-u1' },
    { icon: PenLine, title: t('roles.advisor'), body: t('roles.advisorBody'), color: 'bg-u3' },
    { icon: UserRoundCheck, title: t('roles.reviewer'), body: t('roles.reviewerBody'), color: 'bg-u2' },
  ];
  return (
    <section className="px-4 py-28 sm:px-6">
      <div className="mx-auto max-w-[1180px]">
        <Reveal>
          <p className="eyebrow">{t('roles.eyebrow')}</p>
          <h2 className="mt-6 max-w-[16ch] font-serif text-[clamp(2rem,4vw,3.3rem)] font-medium leading-[1.04] tracking-[-0.03em] text-fg">{t('roles.title')}</h2>
        </Reveal>
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={it.title} as="li" delay={i * 90}>
              <div className="h-full border-t border-line-strong pt-6">
                <span className={cn('grid size-11 place-items-center rounded-full text-white', it.color)}><it.icon className="size-5" strokeWidth={1.5} aria-hidden="true" /></span>
                <h3 className="mt-5 font-serif text-[26px] font-medium tracking-[-0.01em] text-fg">{it.title}</h3>
                <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-fg-2">{it.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  const t = getT('landing');
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[32px] bg-ink px-8 py-20 text-center text-ink-fg">
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-28 size-[420px] rounded-full bg-[#3c55ff] opacity-25 blur-[110px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-20 size-[460px] rounded-full bg-[#8c5bff] opacity-20 blur-[120px]" />
        <h2 className="relative mx-auto max-w-[18ch] font-serif text-[clamp(2.2rem,4.6vw,3.8rem)] font-medium leading-[1.02] tracking-[-0.03em] text-white">{t('cta.title')}</h2>
        <p className="relative mt-5 text-[16px] text-white/70">{t('cta.body')}</p>
        <div className="relative mt-9 flex justify-center">
          <Link href="/registro" className="group inline-flex h-12 items-center gap-3 rounded-full bg-white pl-6 pr-1.5 text-[15px] font-medium text-[#14141f] transition-transform active:scale-[0.98]">
            {t('hero.cta')}
            <span className="grid size-9 place-items-center rounded-full bg-[#14141f]/10 transition-transform group-hover:-translate-y-px group-hover:translate-x-0.5"><ArrowUpRight className="size-4" strokeWidth={1.75} aria-hidden="true" /></span>
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  const t = getT('landing');
  return (
    <footer className="border-t border-line px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 text-[13px] text-fg-3">
        <div className="flex items-center gap-4"><Logo /><span className="hidden sm:inline">{t('footer.academic')}</span></div>
        <ul className="flex gap-5">
          <li><Link href="/plantillas" className="hover:text-fg">{t('nav.templates')}</Link></li>
          <li><a href="#seguridad" className="hover:text-fg">{t('footer.security')}</a></li>
          <li><Link href="/registro" className="hover:text-fg">{t('nav.signup')}</Link></li>
        </ul>
      </div>
    </footer>
  );
}

/** P-01 · portada pública. Server Component: ningún dato privado, ningún script de terceros. */
export function LandingPage() {
  return (
    <div className="grain min-h-dvh bg-bg">
      <Nav />
      <main id="contenido">
        <Hero />
        <Pipeline />
        <Bento />
        <Roles />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
