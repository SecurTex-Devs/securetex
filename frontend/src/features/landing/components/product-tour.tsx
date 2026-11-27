'use client';

import Image from 'next/image';
import { Tabs } from 'radix-ui';
import { useEffect, useState } from 'react';
import { ArrowRight, FileCheck2, PenLine, UsersRound } from 'lucide-react';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Reveal } from './reveal';

const VIEWS = [
  { id: 'write', icon: PenLine, file: 'editor' },
  { id: 'team', icon: UsersRound, file: 'colaboracion' },
  { id: 'pdf', icon: FileCheck2, file: 'pdf-firmado' },
] as const;

export function ProductTour() {
  const t = getT('landing');
  const [selected, setSelected] = useState<(typeof VIEWS)[number]['id']>('write');
  const [keyboard, setKeyboard] = useState(false);
  const [vertical, setVertical] = useState(false);
  useEffect(() => {
    const wide = matchMedia('(min-width: 1024px)');
    const update = () => setVertical(wide.matches);
    update();
    wide.addEventListener('change', update);
    return () => wide.removeEventListener('change', update);
  }, []);
  return <section id="editor" className="scroll-mt-24 border-y border-line bg-surface/50 px-4 py-16 sm:px-7 lg:py-24">
    <div className="mx-auto max-w-[1224px]">
      <Reveal>
        <p className="text-[13px] font-medium text-brand">{t('tour.eyebrow')}</p>
        <h2 className="mt-4 max-w-[23ch] text-balance font-serif text-[clamp(2.3rem,4.1vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.035em]">{t('tour.title')}</h2>
      </Reveal>
      <Tabs.Root value={selected} onValueChange={value => { const view = VIEWS.find(item => item.id === value); if (view) setSelected(view.id); }} orientation={vertical ? 'vertical' : 'horizontal'} className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)] lg:gap-10"
        onKeyDownCapture={() => setKeyboard(true)} onPointerDownCapture={() => setKeyboard(false)}>
        <Tabs.List aria-label={t('tour.tabs')} className="grid grid-cols-3 content-start gap-2 lg:grid-cols-1">
          {VIEWS.map(({ id, icon: Icon }, i) => <Tabs.Trigger key={id} value={id}
            className="landing-tour-tab group rounded-[12px] border border-transparent px-2 py-4 text-center lg:px-5 lg:py-5 lg:text-left data-[state=active]:border-line-strong data-[state=active]:bg-surface data-[state=active]:shadow-[var(--shadow-card)]">
            <span className="flex flex-col items-center gap-2 text-xs font-semibold sm:text-sm lg:flex-row lg:gap-3"><Icon className="size-4 shrink-0 text-brand" strokeWidth={1.75} aria-hidden="true" />{t(`tour.${id}.label`)}
              <span className="ml-auto hidden font-mono text-[11px] font-normal text-fg-2 lg:block">0{i + 1}</span>
            </span>
            <span className="mt-3 hidden max-w-[38ch] text-[13px] leading-relaxed text-fg-2 lg:block">{t(`tour.${id}.body`)}</span>
            <ArrowRight className="landing-action-arrow mt-3 hidden size-4 text-brand lg:block" aria-hidden="true" />
          </Tabs.Trigger>)}
        </Tabs.List>
        <p className="text-[13px] leading-relaxed text-fg-2 lg:hidden">{t(`tour.${selected}.body`)}</p>
        <div className="relative min-w-0 overflow-hidden rounded-[14px] border border-line-strong bg-sunken shadow-[var(--shadow-card)]">
          <div className="relative aspect-[390/844] sm:aspect-[8/5]">
            {VIEWS.map(({ id, file }) => <Tabs.Content key={id} value={id} forceMount
              className={cn('landing-tour-panel absolute inset-0 outline-none', keyboard && 'landing-no-transition')}>
              <Image src={`/landing/${file}-escritorio.png`} alt={t(`tour.image.${id}`)} fill sizes="(max-width: 1023px) 100vw, 800px" className="hidden object-cover object-top sm:block" />
              <Image src={`/landing/${file}-movil.png`} alt={t(`tour.image.${id}`)} fill sizes="(max-width: 639px) 100vw, 1px" className="object-cover object-top sm:hidden" />
            </Tabs.Content>)}
          </div>
        </div>
      </Tabs.Root>
    </div>
  </section>;
}
