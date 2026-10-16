import { es, type Messages } from './es';

/**
 * Sistema de i18n (Docs/06-Accesibilidad-e-i18n.md). Ninguna cadena visible se
 * escribe directamente en un componente: se pide aquí por espacio de nombres.
 *
 * Español de Ecuador como base; la traducción al inglés se añade como otro
 * diccionario con la misma forma (`Messages`), que TypeScript obliga a completar.
 */
export type Namespace = keyof Messages;
export type MessageKey<NS extends Namespace> = keyof Messages[NS] & string;
export type Vars = Readonly<Record<string, string | number>>;

const dictionaries = { es } as const;
export type Locale = keyof typeof dictionaries;
const DEFAULT_LOCALE: Locale = 'es';

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function translate<NS extends Namespace>(ns: NS, key: MessageKey<NS>, vars?: Vars, locale: Locale = DEFAULT_LOCALE): string {
  const table = dictionaries[locale][ns] as Readonly<Record<string, string>>;
  return interpolate(table[key] ?? key, vars);
}

/** Devuelve una función `t(clave, variables)` ligada a un espacio de nombres. Válida en servidor y cliente. */
export function getT<NS extends Namespace>(ns: NS) {
  return (key: MessageKey<NS>, vars?: Vars): string => translate(ns, key, vars);
}

/** Alias semántico para componentes de cliente. */
export const useT = getT;
