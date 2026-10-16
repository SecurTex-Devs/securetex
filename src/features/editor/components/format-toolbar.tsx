'use client';

import type { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import { Tabs } from 'radix-ui';
import { Bold, Heading2, Image as ImageIcon, Italic, Link2, List, LocateFixed, Quote, Search, Sigma, SquareFunction, X } from 'lucide-react';
import { useState, type RefObject } from 'react';
import { getT } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button, IconButton } from '@/shared/ui/button';
import { Popover, Tooltip } from '@/shared/ui/menu';
import { insertText, wrapSelection } from '../lib/codemirror-setup';
import { useEditor } from '../store';

const SYMBOLS: Readonly<Record<'greek' | 'operators' | 'relations' | 'arrows', ReadonlyArray<readonly [string, string, string]>>> = {
  greek: [['α', '\\alpha', 'alfa'], ['β', '\\beta', 'beta'], ['γ', '\\gamma', 'gamma'], ['δ', '\\delta', 'delta'], ['ε', '\\epsilon', 'épsilon'], ['θ', '\\theta', 'theta'], ['λ', '\\lambda', 'lambda'], ['μ', '\\mu', 'mu'], ['π', '\\pi', 'pi'], ['σ', '\\sigma', 'sigma'], ['φ', '\\phi', 'fi'], ['ω', '\\omega', 'omega'], ['Δ', '\\Delta', 'delta mayúscula'], ['Σ', '\\Sigma', 'sigma mayúscula'], ['Ω', '\\Omega', 'omega mayúscula'], ['Φ', '\\Phi', 'fi mayúscula']],
  operators: [['∑', '\\sum', 'sumatorio'], ['∏', '\\prod', 'productorio'], ['∫', '\\int', 'integral'], ['∂', '\\partial', 'derivada parcial'], ['∇', '\\nabla', 'nabla'], ['√', '\\sqrt{}', 'raíz'], ['×', '\\times', 'por'], ['·', '\\cdot', 'punto'], ['±', '\\pm', 'más menos'], ['∞', '\\infty', 'infinito'], ['∪', '\\cup', 'unión'], ['∩', '\\cap', 'intersección']],
  relations: [['≤', '\\leq', 'menor o igual'], ['≥', '\\geq', 'mayor o igual'], ['≠', '\\neq', 'distinto'], ['≈', '\\approx', 'aproximadamente'], ['≡', '\\equiv', 'equivalente'], ['∈', '\\in', 'pertenece'], ['∉', '\\notin', 'no pertenece'], ['⊂', '\\subset', 'subconjunto'], ['∝', '\\propto', 'proporcional'], ['∀', '\\forall', 'para todo'], ['∃', '\\exists', 'existe'], ['∣', '\\mid', 'dado']],
  arrows: [['→', '\\rightarrow', 'flecha derecha'], ['←', '\\leftarrow', 'flecha izquierda'], ['⇒', '\\Rightarrow', 'implica'], ['⇔', '\\Leftrightarrow', 'si y solo si'], ['↦', '\\mapsto', 'se aplica en'], ['↑', '\\uparrow', 'flecha arriba'], ['↓', '\\downarrow', 'flecha abajo'], ['⟶', '\\longrightarrow', 'flecha larga']],
};

/** Barra de inserción rápida sobre el editor (F-112 paleta de símbolos, F-114 figura). */
export function FormatToolbar({ viewRef, readOnly }: { readonly viewRef: RefObject<EditorView | null>; readonly readOnly: boolean }) {
  const t = getT('editor');
  const activeFile = useEditor((s) => s.activeFile);
  const cursor = useEditor((s) => s.cursor);
  const setHighlight = useEditor((s) => s.setHighlight);
  const v = () => viewRef.current;
  const run = (fn: (view: EditorView) => void) => () => { const view = v(); if (view) fn(view); };

  const actions = [
    { label: t('toolbar.bold'), kbd: 'Ctrl+B', icon: Bold, fn: run((x) => wrapSelection(x, '\\textbf{', '}', 'texto')) },
    { label: t('toolbar.italic'), kbd: 'Ctrl+I', icon: Italic, fn: run((x) => wrapSelection(x, '\\emph{', '}', 'texto')) },
    { label: t('toolbar.section'), icon: Heading2, fn: run((x) => wrapSelection(x, '\\section{', '}', 'Título')) },
    { label: t('toolbar.math'), icon: SquareFunction, fn: run((x) => wrapSelection(x, '$', '$', 'x^2')) },
    { label: t('toolbar.list'), icon: List, fn: run((x) => insertText(x, '\\begin{itemize}\n  \\item \n\\end{itemize}\n')) },
    { label: t('toolbar.cite'), icon: Quote, fn: run((x) => wrapSelection(x, '\\cite{', '}', '')) },
    { label: t('toolbar.ref'), icon: Link2, fn: run((x) => wrapSelection(x, '\\ref{', '}', '')) },
    { label: t('toolbar.figure'), icon: ImageIcon, fn: run((x) => insertText(x, '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{figuras/}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}\n')) },
  ];

  return (
    <div role="toolbar" aria-label={t('toolbar.label')} className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line bg-surface px-2">
      {!readOnly && actions.map((a) => (
        <Tooltip key={a.label} content={a.kbd ? `${a.label} · ${a.kbd}` : a.label}>
          <IconButton size="sm" className="size-7" label={a.label} icon={<a.icon className="size-[15px]" strokeWidth={1.6} />} onClick={a.fn} />
        </Tooltip>
      ))}
      {!readOnly && <SymbolPalette onInsert={(cmd) => { const view = v(); if (view) insertText(view, cmd); }} />}
      <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
      <Tooltip content={`${t('toolbar.search')} · Ctrl+F`}>
        <IconButton size="sm" className="size-7" label={t('toolbar.search')} icon={<Search className="size-[15px]" strokeWidth={1.6} />} onClick={run((x) => openSearchPanel(x))} />
      </Tooltip>
      <Tooltip content={t('toolbar.toPdf')}>
        <IconButton size="sm" className="size-7" label={t('toolbar.toPdf')} icon={<LocateFixed className="size-[15px]" strokeWidth={1.6} />}
          onClick={() => setHighlight(nearestBlock(activeFile, cursor.line))} />
      </Tooltip>
    </div>
  );
}

/** SyncTeX directo aproximado: el bloque cuyo inicio es la línea más cercana por encima del cursor. */
function nearestBlock(file: string, line: number) {
  const result = useEditor.getState().result;
  if (!result) return null;
  const candidates = result.model.blocks.filter((b) => b.src.file === file && b.src.line <= line);
  const best = candidates.sort((a, b) => b.src.line - a.src.line)[0];
  return best ? best.src : null;
}

function SymbolPalette({ onInsert }: { readonly onInsert: (cmd: string) => void }) {
  const t = getT('editor');
  const [hover, setHover] = useState<string>('\\alpha');
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const table = `\\begin{tabular}{${'l'.repeat(cols)}}\n  \\toprule\n  ${Array.from({ length: cols }, (_, i) => `Enc. ${i + 1}`).join(' & ')} \\\\\n  \\midrule\n${Array.from({ length: rows - 1 }, () => `  ${Array.from({ length: cols }, () => ' ').join(' & ')} \\\\`).join('\n')}\n  \\bottomrule\n\\end{tabular}\n`;
  return (
    <Popover
      align="start"
      className="w-[320px] p-0"
      trigger={<IconButton size="sm" className="size-7" label={t('toolbar.symbols')} icon={<Sigma className="size-[15px]" strokeWidth={1.6} />} />}
    >
      <Tabs.Root defaultValue="greek">
        <Tabs.List aria-label={t('symbols.title')} className="flex gap-0.5 border-b border-line p-1.5">
          {(['greek', 'operators', 'relations', 'arrows', 'table'] as const).map((k) => (
            <Tabs.Trigger key={k} value={k} className="h-7 flex-1 rounded-[6px] text-[11.5px] text-fg-2 data-[state=active]:bg-surface-3 data-[state=active]:text-fg">{t(`symbols.${k}`)}</Tabs.Trigger>
          ))}
        </Tabs.List>
        {(['greek', 'operators', 'relations', 'arrows'] as const).map((k) => (
          <Tabs.Content key={k} value={k} className="p-2">
            <div role="grid" aria-label={t(`symbols.${k}`)} className="grid grid-cols-8 gap-1">
              {SYMBOLS[k].map(([glyph, cmd, name]) => (
                <button key={cmd} type="button" aria-label={`${name}, comando ${cmd}`} onMouseEnter={() => setHover(cmd)} onFocus={() => setHover(cmd)} onClick={() => onInsert(cmd)}
                  className="grid aspect-square place-items-center rounded-[7px] font-serif text-[17px] text-fg transition-colors hover:bg-brand-soft hover:text-brand">
                  {glyph}
                </button>
              ))}
            </div>
            <p className="mt-2 flex items-center justify-between border-t border-line px-1 pt-2 text-xs text-fg-3">{t('symbols.insert')}<code className="font-mono text-fg">{hover}</code></p>
          </Tabs.Content>
        ))}
        <Tabs.Content value="table" className="p-3">
          <div className="flex items-center gap-3 text-xs text-fg-2">
            <label className="flex items-center gap-1.5">{t('symbols.rows')}<input type="number" min={2} max={12} value={rows} onChange={(e) => setRows(Math.min(12, Math.max(2, Number(e.target.value))))} className="h-7 w-14 rounded-[6px] bg-surface px-2 text-fg shadow-[inset_0_0_0_1px_var(--border-strong)]" /></label>
            <label className="flex items-center gap-1.5">{t('symbols.cols')}<input type="number" min={1} max={8} value={cols} onChange={(e) => setCols(Math.min(8, Math.max(1, Number(e.target.value))))} className="h-7 w-14 rounded-[6px] bg-surface px-2 text-fg shadow-[inset_0_0_0_1px_var(--border-strong)]" /></label>
          </div>
          <div className="mt-3 grid gap-px overflow-hidden rounded-[6px] bg-line" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-hidden="true">
            {Array.from({ length: rows * cols }, (_, i) => <span key={i} className={cn('h-5 bg-surface', i < cols && 'bg-surface-3')} />)}
          </div>
          <Button size="sm" variant="primary" className="mt-3 w-full" onClick={() => onInsert(table)}>{t('symbols.insertTable')}</Button>
        </Tabs.Content>
      </Tabs.Root>
    </Popover>
  );
}

export function TabsBar() {
  const openTabs = useEditor((s) => s.openTabs);
  const active = useEditor((s) => s.activeFile);
  const open = useEditor((s) => s.open);
  const close = useEditor((s) => s.closeTab);
  const c = getT('common');
  return (
    <div role="tablist" className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-line bg-surface-2 px-2">
      {openTabs.map((p) => (
        <div key={p} className={cn('group flex h-8 items-center rounded-t-[8px] pl-3 pr-1 text-[12.5px]', p === active ? 'bg-surface text-fg shadow-[inset_0_1px_0_var(--border),inset_1px_0_0_var(--border),inset_-1px_0_0_var(--border)]' : 'text-fg-2 hover:text-fg')}>
          <button type="button" role="tab" aria-selected={p === active} onClick={() => open(p)} className="max-w-[180px] truncate">{p.split('/').pop()}</button>
          <button type="button" aria-label={`${c('close')} ${p}`} onClick={() => close(p)} className={cn('ml-1 grid size-5 place-items-center rounded-[4px] text-fg-3 hover:bg-surface-3 hover:text-fg', p !== active && 'opacity-0 group-hover:opacity-100')}>
            <X className="size-3" strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
