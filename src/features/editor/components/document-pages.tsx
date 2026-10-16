'use client';

import { ImageIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import type { Block, DocumentModel, Src } from '../lib/latex-blocks';
import { renderInline, type InlineContext } from './latex-inline';
import { MathTex } from './math';

interface PagesProps {
  readonly model: DocumentModel;
  readonly pages: readonly (readonly Block[])[];
  readonly zoom: number;
  readonly highlight: Src | null;
  readonly onInverseSync: (src: Src) => void;
}

function same(a: Src | null, b: Src): boolean {
  return a !== null && a.file === b.file && a.line === b.line;
}

/**
 * Páginas A4 de la vista previa. Doble clic en cualquier bloque salta a su
 * línea en el código (SyncTeX inverso, F-146); el bloque resaltado es el
 * destino del salto directo (F-145).
 */
export const DocumentPages = memo(function DocumentPages({ model, pages, zoom, highlight, onInverseSync }: PagesProps) {
  const ctx: InlineContext = { labels: model.labels, citations: model.citations };
  return (
    <div className="mx-auto flex w-fit flex-col gap-6 pb-10" style={{ zoom }}>
      {pages.map((blocks, i) => (
        <article
          key={i}
          aria-label={`Página ${i + 1}`}
          data-page={i + 1}
          className="paper relative w-[640px] shrink-0 rounded-[2px] px-[72px] pb-[64px] pt-[68px] font-serif text-[13.5px] leading-[1.62] text-[#1d1b17] [aspect-ratio:1/1.414]"
        >
          {blocks.map((b, j) => (
            <BlockView key={`${b.src.file}:${b.src.line}:${j}`} block={b} ctx={ctx} active={same(highlight, b.src)} onSync={onInverseSync} />
          ))}
          <span className="absolute bottom-7 left-0 right-0 text-center font-serif text-[11px] text-[#8a8270]">{i + 1}</span>
        </article>
      ))}
    </div>
  );
});

function Wrap({ block, active, onSync, children, className }: { readonly block: Block; readonly active: boolean; readonly onSync: (s: Src) => void; readonly children: ReactNode; readonly className?: string }) {
  return (
    <div
      data-src={`${block.src.file}:${block.src.line}`}
      onDoubleClick={() => onSync(block.src)}
      title="Doble clic: ir al código"
      className={cn(
        '-mx-2 cursor-text rounded-[3px] px-2 transition-[background-color,box-shadow] duration-500',
        active ? 'bg-[#ffe9a8]/70 shadow-[0_0_0_1px_rgb(194_124_14/0.35)]' : 'hover:bg-[#2742c4]/[0.035]',
        className,
      )}
    >
      {children}
    </div>
  );
}

function BlockView({ block, ctx, active, onSync }: { readonly block: Block; readonly ctx: InlineContext; readonly active: boolean; readonly onSync: (s: Src) => void }) {
  const w = { block, active, onSync };
  switch (block.kind) {
    case 'title':
      return (
        <Wrap {...w} className="mb-9 mt-4 text-center">
          <h1 className="text-[26px] font-medium leading-tight tracking-[-0.01em]">{renderInline(block.title, ctx)}</h1>
          <p className="mt-4 text-[14px]">{renderInline(block.author, ctx)}</p>
          <p className="mt-1 text-[12.5px] text-[#5d574b]">{renderInline(block.date, ctx)}</p>
        </Wrap>
      );
    case 'abstract':
      return (
        <Wrap {...w} className="mx-6 mb-6 text-[12.5px] leading-[1.55]">
          <p className="mb-1.5 text-center text-[12px] font-semibold">Resumen</p>
          <p className="text-justify [hyphens:auto]">{renderInline(block.text, ctx)}</p>
        </Wrap>
      );
    case 'heading': {
      const size = block.level === 1 ? 'text-[17px] mt-6 mb-2.5' : block.level === 2 ? 'text-[14.5px] mt-4 mb-1.5' : 'text-[13.5px] mt-3 mb-1 italic';
      return (
        <Wrap {...w}>
          <h2 className={cn('font-semibold tracking-[-0.005em]', size)}>
            {block.number && <span className="mr-3 tabular-nums">{block.number}</span>}
            {renderInline(block.text, ctx)}
          </h2>
        </Wrap>
      );
    }
    case 'paragraph':
      return <Wrap {...w}><p className="mb-2.5 text-justify indent-[1.5em] [hyphens:auto]">{renderInline(block.text, ctx)}</p></Wrap>;
    case 'equation':
      return (
        <Wrap {...w} className="relative my-3 flex items-center justify-center">
          <MathTex tex={block.tex} display />
          {block.number !== null && <span className="absolute right-2 text-[13px]">({block.number})</span>}
        </Wrap>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Wrap {...w}>
          <Tag className={cn('mb-2.5 ml-6 grid gap-1', block.ordered ? 'list-decimal' : 'list-disc marker:text-[#5d574b]')}>
            {block.items.map((it, i) => <li key={i} className="pl-1">{renderInline(it, ctx)}</li>)}
          </Tag>
        </Wrap>
      );
    }
    case 'figure':
      return (
        <Wrap {...w} className="my-4 text-center">
          <div className="mx-auto grid h-[150px] w-[78%] place-items-center rounded-[2px] bg-[repeating-linear-gradient(135deg,#f1ede2_0_8px,#ebe6d8_8px_16px)] text-[#8a8270]">
            <span className="flex items-center gap-2 font-sans text-[11px]"><ImageIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />{block.graphic || 'figura'}</span>
          </div>
          <p className="mt-2 text-[12px]"><span className="font-semibold">Figura {block.number}.</span> {renderInline(block.caption, ctx)}</p>
        </Wrap>
      );
    case 'table':
      return (
        <Wrap {...w} className="my-4">
          <p className="mb-1.5 text-center text-[12px]"><span className="font-semibold">Tabla {block.number}.</span> {renderInline(block.caption, ctx)}</p>
          <table className="mx-auto border-y-[1.5px] border-[#1d1b17] text-[12.5px]">
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className={r === 0 ? 'border-b border-[#1d1b17]' : undefined}>
                  {row.map((cell, c) => <td key={c} className={cn('px-4 py-1', r === 0 && 'font-semibold')}>{renderInline(cell, ctx)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Wrap>
      );
    case 'references':
      return (
        <Wrap {...w}>
          <h2 className="mb-3 mt-6 text-[17px] font-semibold">Referencias</h2>
          <ol className="grid gap-2 text-[12px] leading-[1.45]">
            {block.entries.map((e, i) => (
              <li key={e.key} className="grid grid-cols-[28px_1fr]">
                <span>[{i + 1}]</span>
                <span>{e.author}. <em>{e.title}</em>. {e.venue}{e.venue ? ', ' : ''}{e.year}.</span>
              </li>
            ))}
          </ol>
        </Wrap>
      );
  }
}
