import { Fingerprint, LockKeyhole, ScrollText, ShieldCheck } from 'lucide-react';
import { getT } from '@/shared/i18n';
import { Fraction, V } from '@/shared/ui/math';

/**
 * Composición del panel derecho del acceso: una página de tesis sobre tinta.
 * Cuenta el producto sin decir nada: escritura académica sobre un fondo de seguridad.
 */
export function AuthShowcase() {
  const t = getT('auth');
  return (
    <div className="relative isolate flex h-full min-h-[640px] flex-col overflow-hidden rounded-[28px] bg-ink p-10 text-ink-fg">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-32 size-[460px] rounded-full bg-[#3c55ff] opacity-[0.22] blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 right-[-80px] size-[520px] rounded-full bg-[#8c5bff] opacity-[0.2] blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />

      <div className="relative flex flex-1 items-center justify-center">
        <figure className="relative w-full max-w-[440px] animate-rise">
          <div className="paper relative -rotate-[1.6deg] rounded-[6px] px-10 pb-12 pt-10 font-serif">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#8a8270]">Capítulo 3</p>
            <h3 className="mt-1 text-[22px] font-medium leading-tight tracking-[-0.01em]">Modelo probabilístico de intrusión</h3>
            <p className="mt-4 text-[13.5px] leading-[1.7] text-[#3b372f]">
              Sea <V>a</V> el evento de ataque y <V>d</V> la evidencia observada en cada ventana temporal. La verosimilitud se actualiza
              <span className="relative mx-0.5 rounded-[2px] bg-[#ffe9a8] px-0.5 [box-decoration-break:clone]"> según la regla de Bayes</span>:
            </p>
            <p className="my-5 flex items-center justify-center gap-1 text-[19px]" aria-label="P de a dado d igual a P de d dado a por P de a, entre P de d">
              <V>P</V>(<V>a</V> | <V>d</V>) =
              <Fraction num={<><V>P</V>(<V>d</V> | <V>a</V>) <V>P</V>(<V>a</V>)</>} den={<><V>P</V>(<V>d</V>)</>} />
            </p>
            <p className="text-[13.5px] leading-[1.7] text-[#3b372f]">
              El modelo converge en menos de 40 ms y reduce un 38 % los falsos positivos
              <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-[caret-blink_1.1s_steps(1)_infinite] bg-[#13895a]" aria-hidden="true" />
            </p>
            <span className="absolute bottom-4 right-6 font-sans text-[10px] text-[#a39b88]">34</span>
          </div>

          <div className="absolute -bottom-7 left-2 flex rotate-[-1deg] items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1.5 font-sans text-[11px] text-white/80 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] backdrop-blur-md">
            <ShieldCheck className="size-3.5 text-[#7ee2b0]" strokeWidth={1.75} aria-hidden="true" />
            Cifrado en reposo · integridad verificada · analizado
          </div>
          <figcaption className="sr-only">{t('aside.caption')}</figcaption>
        </figure>
      </div>

      <div className="relative mt-14">
        <blockquote className="max-w-[30ch] font-serif text-[26px] italic leading-[1.25] tracking-[-0.01em] text-white">
          «{t('aside.quote')}»
        </blockquote>
        <ul className="mt-8 grid gap-3 text-[13px] text-white/70">
          {[
            [LockKeyhole, t('aside.points.isolation')],
            [Fingerprint, t('aside.points.crypto')],
            [ScrollText, t('aside.points.audit')],
          ].map(([Icon, text]) => {
            const I = Icon as typeof LockKeyhole;
            return (
              <li key={text as string} className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]">
                  <I className="size-3.5 text-[#b7c3ff]" strokeWidth={1.75} aria-hidden="true" />
                </span>
                {text as string}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
