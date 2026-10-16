'use client';

import { CircleAlert, CircleCheck, CircleX, ShieldAlert, ShieldCheck, Terminal, Wifi, WifiOff } from 'lucide-react';
import type { CompilerEngine } from '@/shared/api/types';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Spinner } from '@/shared/ui/spinner';
import { useEditor } from '../store';

const ENGINE: Record<CompilerEngine, string> = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX' };

/** Barra de estado de 30 px: compilación y conexión, anunciadas con aria-live. */
export function StatusBar({ engine, online, readOnly }: { readonly engine: CompilerEngine; readonly online: boolean; readonly readOnly: boolean }) {
  const t = getT('editor');
  const status = useEditor((s) => s.status);
  const result = useEditor((s) => s.result);
  const cursor = useEditor((s) => s.cursor);
  const activeFile = useEditor((s) => s.activeFile);
  const setLogOpen = useEditor((s) => s.setLogOpen);
  const logOpen = useEditor((s) => s.logOpen);
  const warnings = result?.diagnostics.filter((d) => d.level !== 'error').length ?? 0;
  const errors = result?.diagnostics.filter((d) => d.level === 'error').length ?? 0;
  const secWarnings = result?.findings.filter((f) => f.severity === 'warning').length ?? 0;

  const state = (() => {
    switch (status) {
      case 'analyzing': case 'running':
        return { icon: <Spinner className="size-3.5 text-brand" />, label: t(`compile.${status}`), tone: 'text-fg-2' };
      case 'success': return { icon: <CircleCheck className="size-3.5" strokeWidth={2} />, label: t('compile.success'), tone: 'text-ok' };
      case 'failed': return { icon: <CircleX className="size-3.5" strokeWidth={2} />, label: t('compile.failed'), tone: 'text-danger' };
      case 'blocked': return { icon: <ShieldAlert className="size-3.5" strokeWidth={2} />, label: t('compile.blocked'), tone: 'text-danger' };
      case 'idle': return { icon: <CircleAlert className="size-3.5" strokeWidth={2} />, label: t('compile.never'), tone: 'text-fg-3' };
    }
  })();

  return (
    <footer className="flex h-[30px] shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-line bg-surface px-3 text-[11.5px] text-fg-2">
      <span className={cn('flex items-center gap-1.5 font-medium', state.tone)} role="status" aria-live="polite">
        {state.icon}{state.label}
      </span>
      {result && (status === 'success' || status === 'failed') && (
        <span className="hidden tabular sm:inline">{t('compile.stats', { time: (result.durationMs / 1000).toFixed(1).replace('.', ','), pages: result.pages.length, warnings })}</span>
      )}
      {secWarnings > 0 && status !== 'blocked' && <span className="flex items-center gap-1 text-warn"><ShieldAlert className="size-3.5" strokeWidth={1.75} aria-hidden="true" />{t('blocked.warnings')}</span>}
      {result && status !== 'blocked' && (
        <button type="button" onClick={() => setLogOpen(!logOpen)} aria-pressed={logOpen} className={cn('flex items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 py-0.5 hover:bg-surface-3', errors && 'text-danger')}>
          <Terminal className="size-3.5" strokeWidth={1.75} aria-hidden="true" />{t('log.title')}
        </button>
      )}
      <span className="ml-auto hidden items-center gap-1 whitespace-nowrap text-sec xl:flex"><ShieldCheck className="size-3.5" strokeWidth={1.75} aria-hidden="true" />{t('compile.serverAnalysis')}</span>
      <span className="hidden whitespace-nowrap lg:inline">{ENGINE[engine]}</span>
      <span className="ml-auto whitespace-nowrap tabular xl:ml-0">{activeFile.split('/').pop()} · {t('editor.position', { line: cursor.line, col: cursor.col })}</span>
      {readOnly && <span className="font-medium text-warn">{t('editor.readonly')}</span>}
      <span className={cn('flex items-center gap-1', online ? 'text-ok' : 'text-warn')}>
        {online ? <Wifi className="size-3.5" strokeWidth={1.75} aria-hidden="true" /> : <WifiOff className="size-3.5" strokeWidth={1.75} aria-hidden="true" />}
        <span className="sr-only">{online ? 'En línea' : t('offline')}</span>
      </span>
    </footer>
  );
}
