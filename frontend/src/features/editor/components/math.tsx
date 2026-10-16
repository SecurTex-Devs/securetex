'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { memo, useMemo } from 'react';
import { sanitizeMathHtml } from '@/shared/security/sanitize';

/**
 * Fórmula renderizada con KaTeX. El TeX lo escribe el usuario, así que:
 *  · `trust: false` → sin \href, \url ni \includegraphics dentro de la fórmula.
 *  · `maxExpand` y `maxSize` → sin bombas de expansión ni tamaños absurdos.
 *  · La salida pasa por DOMPurify antes de insertarse (AGENTS.md §1.1).
 */
export const MathTex = memo(function MathTex({ tex, display = false }: { readonly tex: string; readonly display?: boolean }) {
  const html = useMemo(() => {
    const raw = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      maxExpand: 300,
      maxSize: 12,
      output: 'htmlAndMathml',
      errorColor: '#b42318',
    });
    return sanitizeMathHtml(raw);
  }, [tex, display]);
  return <span className={display ? 'block' : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
});
