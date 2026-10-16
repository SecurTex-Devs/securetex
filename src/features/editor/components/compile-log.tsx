'use client';

import { CircleAlert, CircleX, Info, X } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { IconButton } from '@/shared/ui/button';
import type { Diagnostic } from '../lib/diagnostics';
import { useEditor, type CompileResult } from '../store';

const LEVEL = {
  error: { tone: 'danger', Icon: CircleX },
  warning: { tone: 'warn', Icon: CircleAlert },
  typesetting: { tone: 'neutral', Icon: Info },
} as const;

/** Registro sintético en el formato de pdfTeX, ya saneado (RS-036: sin rutas absolutas ni host). */
function rawLog(result: CompileResult, engine: string): string {
  const lines = [
    `This is ${engine === 'xelatex' ? 'XeTeX' : engine === 'lualatex' ? 'LuaHBTeX' : 'pdfTeX'}, Version 3.141592653 (TeX Live 2025) (preloaded format=${engine})`,
    ' \\write18 disabled.',
    ' openin_any=p  openout_any=p',
    'entering extended mode',
    '(./main.tex',
    'LaTeX2e <2024-11-01> patch level 2',
    ...result.diagnostics.map((d) => (d.level === 'error' ? `./${d.file}:${d.line}: ${d.message}.\nl.${d.line} ${d.snippet}` : `LaTeX Warning: ${d.message} on input line ${d.line}.`)),
    `Output written on main.pdf (${result.pages.length} pages).`,
    'Transcript written on main.log.',
  ];
  return lines.join('\n');
}

export function CompileLog({ engine }: { readonly engine: string }) {
  const t = getT('editor');
  const result = useEditor((s) => s.result);
  const setLogOpen = useEditor((s) => s.setLogOpen);
  const jumpTo = useEditor((s) => s.jumpTo);
  if (!result) return null;
  const counts = { error: 0, warning: 0, typesetting: 0 };
  for (const d of result.diagnostics) counts[d.level] += 1;

  return (
    <section aria-label={t('log.title')} className="flex h-full flex-col border-t border-line bg-surface">
      <Tabs.Root defaultValue="summary" className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line pl-4 pr-1.5">
          <h2 className="text-[13px] font-medium text-fg">{t('log.title')}</h2>
          <Badge size="sm" tone={counts.error ? 'danger' : 'ok'}>{counts.error} {t('log.error')}</Badge>
          <Badge size="sm" tone={counts.warning ? 'warn' : 'neutral'}>{counts.warning} {t('log.warning')}</Badge>
          <Tabs.List className="ml-3 flex gap-1" aria-label={t('log.title')}>
            {(['summary', 'raw'] as const).map((v) => (
              <Tabs.Trigger key={v} value={v} className="h-7 rounded-[6px] px-2.5 text-xs text-fg-2 data-[state=active]:bg-surface-3 data-[state=active]:text-fg">{v === 'summary' ? t('log.summary') : t('log.raw')}</Tabs.Trigger>
            ))}
          </Tabs.List>
          <div className="ml-auto flex">
            <IconButton size="sm" label={getT('common')('close')} icon={<X className="size-4" strokeWidth={1.5} />} onClick={() => setLogOpen(false)} />
          </div>
        </div>
        <Tabs.Content value="summary" className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {result.diagnostics.length === 0 ? <p className="px-2 py-3 text-[13px] text-fg-2">{t('log.clean')}</p> : (
            <ul className="grid gap-1.5">
              {result.diagnostics.map((d, i) => <DiagnosticRow key={i} d={d} onGo={() => jumpTo(d.file, d.line)} />)}
            </ul>
          )}
        </Tabs.Content>
        <Tabs.Content value="raw" className="min-h-0 flex-1 overflow-y-auto">
          {/* Texto plano siempre: el registro contiene texto que el usuario controla. */}
          <pre className="whitespace-pre-wrap p-4 font-mono text-[11.5px] leading-relaxed text-fg-2">{rawLog(result, engine)}</pre>
          <p className="px-4 pb-4 text-xs text-fg-3">{t('log.sanitized')}</p>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}

function DiagnosticRow({ d, onGo }: { readonly d: Diagnostic; readonly onGo: () => void }) {
  const t = getT('editor');
  const { tone, Icon } = LEVEL[d.level];
  return (
    <li>
      <button type="button" onClick={onGo} aria-label={t('log.goto', { file: d.file, line: d.line })}
        className={cn('flex w-full gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-surface-2', d.level === 'error' && 'bg-danger-soft/60')}>
        <Icon className={cn('mt-0.5 size-4 shrink-0', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-fg-3')} strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13px] font-medium text-fg">{d.message}</span>
            <span className="font-mono text-[11px] text-fg-3">{t('log.where', { file: d.file, line: d.line })}</span>
          </span>
          <span className="mt-0.5 block truncate font-mono text-[12px] text-fg-2">{d.snippet}</span>
          {d.suggestion && <span className="mt-1 block text-xs text-fg-2">{d.suggestion}</span>}
        </span>
      </button>
    </li>
  );
}
