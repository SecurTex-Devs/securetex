import { FileCheck2, FolderLock, ScanSearch, UserRoundCheck } from 'lucide-react';
import { getT } from '@/shared/i18n';
import { Reveal } from './reveal';

const GUARANTEES = [
  { key: '1', icon: FolderLock }, { key: '2', icon: UserRoundCheck },
  { key: '3', icon: ScanSearch }, { key: '4', icon: FileCheck2 },
] as const;

export function SecuritySection() {
  const t = getT('landing');
  return <section id="seguridad" className="scroll-mt-24 border-y border-line bg-surface/50 px-4 py-16 sm:px-7 lg:py-20">
    <div className="mx-auto grid max-w-[1224px] gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <Reveal>
        <p className="text-[13px] font-medium text-brand">{t('pipeline.eyebrow')}</p>
        <h2 className="mt-4 max-w-[14ch] font-serif text-[clamp(2.3rem,4.1vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.035em]">{t('pipeline.title')}</h2>
        <p className="mt-5 max-w-[37ch] text-[15px] leading-relaxed text-fg-2">{t('pipeline.body')}</p>
      </Reveal>
      <dl className="grid gap-x-9 gap-y-8 sm:grid-cols-2">
        {GUARANTEES.map(({ key, icon: Icon }) => <Reveal key={key}>
          <dt className="flex items-center gap-2.5 text-sm font-semibold"><Icon className="size-[18px] shrink-0 text-brand" strokeWidth={1.5} aria-hidden="true" />{t(`pipeline.${key}.title`)}</dt>
          <dd className="mt-3 text-[13px] leading-relaxed text-fg-2">{t(`pipeline.${key}.body`)}</dd>
        </Reveal>)}
      </dl>
    </div>
  </section>;
}
