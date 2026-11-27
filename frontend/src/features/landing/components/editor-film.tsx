'use client';

import { Maximize2, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getT } from '@/shared/i18n';

export function EditorFilm() {
  const t = getT('landing');
  const video = useRef<HTMLVideoElement>(null);
  const requested = useRef<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !reduce.matches && requested.current !== false) void element.play().catch(() => {});
      else element.pause();
    }, { threshold: 0.35 });
    const stop = () => { if (reduce.matches) element.pause(); };
    reduce.addEventListener('change', stop);
    observer.observe(element);
    return () => { observer.disconnect(); reduce.removeEventListener('change', stop); };
  }, []);
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    requested.current = element.paused;
    if (requested.current) void element.play().catch(() => setAvailable(false));
    else element.pause();
  };
  return <figure className="relative">
    <div className="overflow-hidden rounded-[14px] border border-line-strong bg-surface p-1.5 shadow-[var(--shadow-pop)] sm:p-2">
      <video ref={video} className="aspect-[8/5] w-full rounded-[8px] bg-surface object-cover" muted loop playsInline preload="none"
        poster="/landing/editor-escritorio.png" aria-label={t('film.label')} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setAvailable(false)}>
        <source src="/landing/editor-tour.mp4" type="video/mp4" />
      </video>
    </div>
    <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-fg-2">
      <span>{t(available ? 'film.caption' : 'film.unavailable')}</span>
      <span className="flex gap-1">
        <button type="button" onClick={toggle} disabled={!available} aria-label={t(playing ? 'film.pause' : 'film.play')}
          className="landing-icon-action grid size-9 place-items-center rounded-full border border-line-strong bg-surface disabled:opacity-40">
          {playing ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
        </button>
        <button type="button" disabled={!available} onClick={() => void video.current?.requestFullscreen?.().catch(() => {})} aria-label={t('film.fullscreen')}
          className="landing-icon-action grid size-9 place-items-center rounded-full border border-line-strong bg-surface disabled:opacity-40">
          <Maximize2 className="size-3.5" aria-hidden="true" />
        </button>
      </span>
    </figcaption>
  </figure>;
}
