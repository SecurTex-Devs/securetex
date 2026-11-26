'use client';

import { ChevronDown, Code2, Columns2, FileText, History, Play, Settings2, Share2 } from 'lucide-react';
import Link from 'next/link';
import type { Project } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { ThemeToggle } from '@/shared/theme/theme-toggle';
import { Badge } from '@/shared/ui/badge';
import { Button, IconButton } from '@/shared/ui/button';
import { Segmented, Switch } from '@/shared/ui/controls';
import { LogoMark } from '@/shared/ui/logo';
import { Menu, MenuLabel, Tooltip } from '@/shared/ui/menu';
import { useEditor, type ViewMode } from '../store';
import { CryptoStatus } from './crypto-popover';
import { PresenceBar } from './presence-bar';

export function EditorTopBar({ project, online, isDemo = false, onShare, onSettings }: {
  readonly project: Project;
  readonly online: boolean;
  readonly isDemo?: boolean;
  readonly onShare: () => void;
  readonly onSettings: () => void;
}) {
  const t = getT('editor');
  const c = getT('common');
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const panel = useEditor((s) => s.panel);
  const togglePanel = useEditor((s) => s.togglePanel);
  const status = useEditor((s) => s.status);
  const build = useEditor((s) => s.build);
  const compilingPdf = useEditor((s) => s.pdfStatus === 'running');
  const busy = status === 'analyzing' || status === 'running' || compilingPdf;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <Tooltip content={t('back')}>
        <Link href={isDemo ? '/' : '/proyectos'} aria-label={t('back')} className="shrink-0 rounded-[9px] transition-transform active:scale-95"><LogoMark /></Link>
      </Tooltip>
      <div className={isDemo ? 'flex min-w-0 flex-1 items-center gap-2' : 'flex min-w-0 items-center gap-2'}>
        <h1 className="truncate font-serif text-[17px] font-medium tracking-[-0.01em] text-fg">{project.name}</h1>
        {!isDemo && project.role !== 'owner' && <Badge size="sm" tone={project.role === 'viewer' ? 'neutral' : 'sec'}>{c(`roles.${project.role}`)}</Badge>}
      </div>
      <div className="hidden md:block"><CryptoStatus online={online} /></div>

      <div className="ml-auto flex items-center gap-2">
        <div className={isDemo ? 'hidden sm:block' : undefined}><PresenceBar /></div>
        <Segmented<ViewMode> size="sm" label={t('views.label')} value={view} onValueChange={setView} options={[
          { value: 'code', label: '', icon: <Code2 className="size-3.5" strokeWidth={1.75} />, title: t('views.code') },
          { value: 'split', label: '', icon: <Columns2 className="size-3.5" strokeWidth={1.75} />, title: t('views.split') },
          { value: 'pdf', label: '', icon: <FileText className="size-3.5" strokeWidth={1.75} />, title: t('views.pdf') },
        ]} />

        <span className="mx-0.5 hidden h-5 w-px bg-line md:block" aria-hidden="true" />
        {!isDemo && <div className="flex items-center gap-2"><IconButton size="sm" label={t('history.title')} aria-pressed={panel === 'history'} className={panel === 'history' ? 'bg-brand-soft text-brand' : undefined}
          icon={<History className="size-4" strokeWidth={1.5} />} onClick={() => togglePanel('history')} />
        <IconButton size="sm" label={t('settings')} icon={<Settings2 className="size-4" strokeWidth={1.5} />} onClick={onSettings} />
        <Button size="sm" leading={<Share2 className="size-3.5" strokeWidth={1.75} />} onClick={onShare}>{t('share')}</Button></div>}
        <CompileButton busy={busy} onCompile={() => void build()} demo={isDemo} />
        <ThemeToggle />
      </div>
    </header>
  );
}

function CompileButton({ busy, onCompile, demo }: { readonly busy: boolean; readonly onCompile: () => void; readonly demo: boolean }) {
  const t = getT('editor');
  const auto = useEditor((s) => s.autoCompile);
  const setAuto = useEditor((s) => s.setAutoCompile);
  const hasResult = useEditor((s) => s.result !== null);
  return (
    <div className="flex">
      <Tooltip content="Ctrl + Enter">
        <Button size="sm" variant="primary" className={demo ? undefined : 'rounded-r-none'} loading={busy} leading={<Play className="size-3.5 fill-current" strokeWidth={1.5} />} onClick={onCompile}>
          {hasResult ? t('recompile') : t('compile')}
        </Button>
      </Tooltip>
      {!demo && <Menu label={t('compile.menu')} trigger={
        <Button size="sm" variant="primary" aria-label={t('compile.menu')} className="w-7 rounded-l-none border-l border-white/20 px-0">
          <ChevronDown className="size-3.5" strokeWidth={2} />
        </Button>
      }>
        <MenuLabel>{t('compile.menu')}</MenuLabel>
        <div className="flex items-center justify-between gap-4 px-2.5 py-1.5 text-[13px] text-fg">
          <span>{t('compile.auto')}<span className="block text-xs text-fg-3">{t('compile.autoHint')}</span></span>
          <Switch label={t('compile.auto')} checked={auto} onCheckedChange={setAuto} />
        </div>
      </Menu>}
    </div>
  );
}
