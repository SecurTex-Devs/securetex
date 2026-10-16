import DOMPurify from 'dompurify';

/**
 * Único punto donde se admite HTML generado (la salida de KaTeX). Aun siendo
 * de una librería de confianza, el texto de entrada lo escribe el usuario, así
 * que pasa por DOMPurify con una lista de permitidos estricta
 * (AGENTS.md §1.1: dangerouslySetInnerHTML solo tras DOMPurify).
 */
export function sanitizeMathHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'a'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'href', 'xlink:href', 'srcdoc'],
  });
}
