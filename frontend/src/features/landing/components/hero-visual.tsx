import { Check, FileText, Folder, Lock, Play, ShieldCheck } from 'lucide-react';
import { Fraction, V } from '@/shared/ui/math';

const CODE: ReadonlyArray<ReadonlyArray<readonly [string, string]>> = [
  [['cmd', '\\section'], ['br', '{'], ['txt', 'Modelo propuesto'], ['br', '}']],
  [],
  [['txt', 'Sea '], ['math', '$a$'], ['txt', ' el evento de ataque y '], ['math', '$d$']],
  [['txt', 'la evidencia observada en cada ventana.']],
  [['cmd', '\\begin'], ['br', '{'], ['atom', 'equation'], ['br', '}']],
  [['txt', '  P(a \\mid d) = '], ['cmd', '\\frac'], ['br', '{'], ['txt', 'P(d \\mid a)P(a)'], ['br', '}{'], ['txt', 'P(d)'], ['br', '}']],
  [['txt', '  '], ['cmd', '\\label'], ['br', '{'], ['atom', 'eq:bayes'], ['br', '}']],
  [['cmd', '\\end'], ['br', '{'], ['atom', 'equation'], ['br', '}']],
  [],
  [['txt', 'Como muestra la ecuación~'], ['cmd', '\\ref'], ['br', '{'], ['atom', 'eq:bayes'], ['br', '}'], ['txt', ', basta']],
  [['txt', 'con estimar la tasa base '], ['cmd', '\\cite'], ['br', '{'], ['atom', 'torres2025'], ['br', '}'], ['txt', '.']],
];

const TOKEN: Readonly<Record<string, string>> = {
  cmd: 'text-brand', br: 'text-fg-3', atom: 'text-sec', math: 'text-u2', txt: 'text-fg',
};

/**
 * Composición estática del producto para la portada: árbol, editor y vista previa.
 * No es una captura: está construida con los mismos tokens que la aplicación,
 * así que respeta el tema claro y oscuro.
 */
export function HeroVisual() {
  return (
    <div className="bezel animate-rise [animation-delay:200ms]">
      <div className="bezel-core overflow-hidden">
        <div className="flex h-10 items-center gap-2 border-b border-line bg-surface px-3">
          <span className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => <span key={i} className="size-2.5 rounded-full bg-surface-3" />)}
          </span>
          <span className="ml-3 truncate font-serif text-[13px] text-fg">Tesis · Detección de intrusiones</span>
          <span className="ml-2 hidden items-center gap-1 text-[11px] text-fg-3 sm:flex"><Lock className="size-3 text-sec" strokeWidth={2} aria-hidden="true" />Guardado y cifrado</span>
          <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-brand px-2.5 text-[11px] font-medium text-brand-fg"><Play className="size-3 fill-current" strokeWidth={1.5} aria-hidden="true" />Compilar</span>
        </div>
        <div className="grid grid-cols-[150px_minmax(0,1.15fr)_minmax(0,1fr)] max-md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="border-r border-line bg-surface py-2 text-[11.5px] text-fg-2 max-md:hidden">
            <li className="flex items-center gap-1.5 px-3 py-1"><Folder className="size-3.5 text-fg-3" strokeWidth={1.5} aria-hidden="true" />capitulos</li>
            {['introduccion.tex', 'metodologia.tex', 'resultados.tex'].map((f, i) => (
              <li key={f} className={i === 1 ? 'mx-1.5 flex items-center gap-1.5 rounded-[5px] bg-brand-soft px-1.5 py-1 pl-5 text-fg' : 'flex items-center gap-1.5 px-3 py-1 pl-6'}>
                <FileText className="size-3.5 text-brand" strokeWidth={1.5} aria-hidden="true" />{f}
              </li>
            ))}
            <li className="flex items-center gap-1.5 px-3 py-1"><FileText className="size-3.5 text-brand" strokeWidth={1.5} aria-hidden="true" />main.tex</li>
            <li className="flex items-center gap-1.5 px-3 py-1"><FileText className="size-3.5 text-u2" strokeWidth={1.5} aria-hidden="true" />referencias.bib</li>
          </ul>
          <pre className="overflow-hidden bg-surface py-3 font-mono text-[11.5px] leading-[1.8]" aria-hidden="true">
            {CODE.map((line, i) => (
              <span key={i} className="flex">
                <span className="w-8 shrink-0 pr-3 text-right text-fg-3">{i + 1}</span>
                <span className="whitespace-pre">
                  {line.map(([k, v], j) => <span key={j} className={TOKEN[k]}>{v}</span>)}
                  {i === 5 && <span className="relative"><span className="absolute -top-[2px] left-0 h-[1.5em] w-[2px] animate-[caret-blink_1.1s_steps(1)_infinite] bg-brand" /></span>}
                </span>
              </span>
            ))}
          </pre>
          <div className="relative bg-sunken p-4">
            <div className="paper mx-auto rounded-[2px] px-6 py-6 font-serif text-[10.5px] leading-[1.6]">
              <p className="text-[12px] font-semibold">2 &nbsp;Modelo propuesto</p>
              <p className="mt-1.5 text-justify indent-4">Sea <V>a</V> el evento de ataque y <V>d</V> la evidencia observada en cada ventana.</p>
              <p className="relative my-3 flex items-center justify-center gap-1 text-[12px]">
                <V>P</V>(<V>a</V> | <V>d</V>) = <Fraction num={<><V>P</V>(<V>d</V> | <V>a</V>)<V>P</V>(<V>a</V>)</>} den={<><V>P</V>(<V>d</V>)</>} />
                <span className="absolute right-0">(1)</span>
              </p>
              <p className="text-justify indent-4">Como muestra la ecuación 1, basta con estimar la tasa base [1].</p>
              <div className="mt-3 space-y-1.5" aria-hidden="true">
                {[92, 100, 84, 96, 60].map((w, i) => <span key={i} className="block h-[3px] rounded-full bg-[#2a261e]/10" style={{ width: `${w}%` }} />)}
              </div>
            </div>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-2.5 py-1 text-[10.5px] text-fg-2 shadow-[var(--shadow-card),inset_0_0_0_1px_var(--border)]">
              <ShieldCheck className="size-3.5 text-ok" strokeWidth={1.75} aria-hidden="true" />Analizado por el servidor
              <span className="text-fg-3">·</span>
              <Check className="size-3 text-ok" strokeWidth={2.5} aria-hidden="true" />HMAC verificado
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
