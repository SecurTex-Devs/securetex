'use client';

import type { EditorView } from '@codemirror/view';
import { Braces, Search, SlidersHorizontal } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useMemo, useState, type RefObject } from 'react';
import { useRawPreferences } from '@/shared/api/session';
import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/field';
import { Tooltip } from '@/shared/ui/menu';
import { COMMAND_GROUPS, effectiveCommands, insertCommand, previewTemplate, type CommandPrefs, type LatexCommand } from '../lib/latex-commands';
import { CommandsDialog } from './commands-dialog';

const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Catálogo efectivo de la persona (de serie + personalizados), desde sus preferencias. */
export function useLatexCommands(): LatexCommand[] {
  const prefs = useRawPreferences().data?.prefs as CommandPrefs | undefined;
  return useMemo(() => effectiveCommands(prefs ?? {}), [prefs]);
}

/**
 * Paleta de comandos LaTeX: se despliega desde la barra del editor, se busca
 * por nombre o por comando, y al hacer clic se inserta en el cursor dejándolo
 * en el primer hueco que hay que rellenar (Tab salta al siguiente).
 */
export function CommandPalette({ viewRef }: { readonly viewRef: RefObject<EditorView | null> }) {
  const t = getT('editor');
  const commands = useLatexCommands();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<LatexCommand | null>(null);
  const [customize, setCustomize] = useState(false);

  const groups = useMemo(() => {
    const needle = fold(q.trim());
    const match = (c: LatexCommand) => !needle || fold(c.label).includes(needle) || fold(c.template).includes(needle);
    const names = [...COMMAND_GROUPS, ...new Set(commands.map((c) => c.group).filter((g) => !(COMMAND_GROUPS as readonly string[]).includes(g)))];
    return names.map((g) => ({ name: g, items: commands.filter((c) => c.group === g && match(c)) })).filter((g) => g.items.length > 0);
  }, [commands, q]);

  const insert = (c: LatexCommand) => {
    const view = viewRef.current;
    if (!view) return;
    // Se inserta ya y el foco queda en el editor, en el primer hueco (el panel no lo devuelve al botón).
    insertCommand(view, c.template);
    setOpen(false);
  };

  return (
    <>
      <PopoverPrimitive.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
        <Tooltip content={t('commands.open')}>
          <PopoverPrimitive.Trigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-[12.5px]" leading={<Braces className="size-[15px]" strokeWidth={1.6} />}>{t('commands.button')}</Button>
          </PopoverPrimitive.Trigger>
        </Tooltip>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content align="start" sideOffset={6} onCloseAutoFocus={(e) => { e.preventDefault(); viewRef.current?.focus(); }} className="z-50 flex w-[380px] flex-col overflow-hidden rounded-[12px] bg-surface shadow-[var(--shadow-pop),inset_0_0_0_1px_var(--border)] animate-pop">
            <div className="border-b border-line p-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                <Input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('commands.search')} aria-label={t('commands.search')} className="pl-8" />
              </div>
            </div>
            <div className="max-h-[340px] overflow-y-auto p-1.5" role="listbox" aria-label={t('commands.title')}>
              {groups.length === 0 ? <p className="px-3 py-6 text-center text-[13px] text-fg-3">{t('commands.empty')}</p> : groups.map((g) => (
                <div key={g.name} className="mb-1">
                  <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-3">{g.name}</p>
                  {g.items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={hover?.id === c.id}
                      onClick={() => insert(c)}
                      onMouseEnter={() => setHover(c)}
                      onFocus={() => setHover(c)}
                      className="flex w-full items-center justify-between gap-3 rounded-[7px] px-2.5 py-1.5 text-left text-[13px] text-fg-2 outline-none hover:bg-surface-3/70 hover:text-fg focus-visible:bg-surface-3/70 focus-visible:text-fg"
                    >
                      <span className="truncate">{c.label}</span>
                      <code className="max-w-[45%] shrink-0 truncate font-mono text-[11px] text-fg-3">{previewTemplate(c.template).split('\n')[0]}</code>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="border-t border-line bg-surface-2/60 px-3 py-2.5">
              <pre className="h-[64px] overflow-hidden whitespace-pre-wrap font-mono text-[11.5px] leading-snug text-fg-2" aria-live="polite">{hover ? previewTemplate(hover.template) : t('commands.hint')}</pre>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-fg-3">{t('commands.tab')}</span>
                <Button size="sm" variant="ghost" leading={<SlidersHorizontal className="size-3.5" strokeWidth={1.75} />} onClick={() => { setOpen(false); setCustomize(true); }}>{t('commands.customize')}</Button>
              </div>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      <CommandsDialog open={customize} onOpenChange={setCustomize} />
    </>
  );
}
