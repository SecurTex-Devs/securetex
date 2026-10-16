import { cn } from '@/shared/lib/cn';

type Kind = 'thesis' | 'slides' | 'poster' | 'article';

function kindOf(name: string): Kind {
  const n = name.toLowerCase();
  if (n.includes('presentación') || n.includes('defensa')) return 'slides';
  if (n.includes('póster') || n.includes('poster')) return 'poster';
  if (n.includes('tesis')) return 'thesis';
  return 'article';
}

function Lines({ n, className }: { readonly n: number; readonly className?: string }) {
  return (
    <div className={cn('grid gap-[3px]', className)} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-[2px] rounded-full bg-[#2a261e]/15" style={{ width: `${i === n - 1 ? 62 : 88 + ((i * 7) % 12)}%` }} />
      ))}
    </div>
  );
}

/**
 * Miniatura tipográfica del documento: no es una captura del PDF (todavía no
 * hay compilación), sino una página compuesta a partir del título del
 * proyecto. Da a cada tarjeta un carácter propio sin imágenes externas.
 */
export function PaperThumb({ name, className }: { readonly name: string; readonly className?: string }) {
  const kind = kindOf(name);
  const title = name.split('·').pop()?.trim() ?? name;
  if (kind === 'slides') {
    return (
      <div className={cn('paper flex aspect-[16/10] flex-col justify-between rounded-[4px] p-4 font-serif', className)}>
        <span className="h-1 w-8 rounded-full bg-[#2742c4]/70" aria-hidden="true" />
        <p className="text-[13px] font-medium leading-tight text-[#1d1b17]">{title}</p>
        <div className="flex items-end justify-between">
          <Lines n={2} className="w-1/2" />
          <span className="text-[8px] text-[#8a8270]">1 / 24</span>
        </div>
      </div>
    );
  }
  if (kind === 'poster') {
    return (
      <div className={cn('paper grid aspect-[3/4] grid-rows-[auto_1fr] gap-2 rounded-[4px] p-3 font-serif', className)}>
        <p className="rounded-[2px] bg-[#13895a]/90 px-2 py-1.5 text-center text-[10px] font-medium leading-tight text-white">{title}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((c) => (
            <div key={c} className="grid content-start gap-1.5">
              <span className="h-6 rounded-[2px] bg-[#2a261e]/[0.07]" aria-hidden="true" />
              <Lines n={5} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'thesis') {
    return (
      <div className={cn('paper flex aspect-[3/4] flex-col items-center rounded-[4px] px-4 pb-4 pt-5 text-center font-serif', className)}>
        <span className="text-[7px] uppercase tracking-[0.2em] text-[#8a8270]">Universidad Técnica de Ambato</span>
        <span className="mt-1 h-px w-10 bg-[#2a261e]/20" aria-hidden="true" />
        <p className="mt-auto text-[12px] font-medium leading-snug text-[#1d1b17]">{title}</p>
        <span className="mt-1.5 text-[7px] italic text-[#8a8270]">Trabajo de titulación</span>
        <span className="mt-auto text-[7px] text-[#8a8270]">Ambato · 2026</span>
      </div>
    );
  }
  return (
    <div className={cn('paper flex aspect-[3/4] flex-col rounded-[4px] px-4 pb-4 pt-5 font-serif', className)}>
      <p className="text-center text-[11px] font-medium leading-snug text-[#1d1b17]">{title}</p>
      <span className="mx-auto mt-1 text-[6.5px] text-[#8a8270]">A. Torres · M. Rodríguez</span>
      <div className="mx-auto mt-2.5 w-[80%]"><Lines n={3} /></div>
      <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
        <Lines n={9} />
        <div className="grid content-start gap-2">
          <span className="h-7 rounded-[2px] bg-[#2a261e]/[0.07]" aria-hidden="true" />
          <Lines n={5} />
        </div>
      </div>
    </div>
  );
}

const ACCENT: Record<Kind, string> = { thesis: 'bg-[#2742c4]', slides: 'bg-[#c27c0e]', poster: 'bg-[#13895a]', article: 'bg-[#6531c4]' };

/** Glifo de página para las filas de la lista: mismo tipo de documento, a 28 px. */
export function MiniPaper({ name }: { readonly name: string }) {
  const kind = kindOf(name);
  return (
    <span aria-hidden="true" className={cn('paper relative flex flex-col gap-[3px] overflow-hidden rounded-[3px] px-[5px] pt-[7px]', kind === 'slides' ? 'h-[22px] w-[34px]' : 'h-[36px] w-[28px]')}>
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', ACCENT[kind])} />
      <span className="h-[2px] w-[70%] rounded-full bg-[#2a261e]/40" />
      <span className="h-[2px] w-full rounded-full bg-[#2a261e]/15" />
      <span className="h-[2px] w-[85%] rounded-full bg-[#2a261e]/15" />
      {kind !== 'slides' && <span className="h-[2px] w-[60%] rounded-full bg-[#2a261e]/15" />}
    </span>
  );
}
