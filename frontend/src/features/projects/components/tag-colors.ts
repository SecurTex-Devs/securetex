/** Colores de etiqueta permitidos por el contrato: siempre tokens, nunca valores libres. */
export const TAG_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'slate'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_DOT: Readonly<Record<string, string>> = {
  blue: 'bg-u1',
  green: 'bg-u2',
  amber: 'bg-u4',
  red: 'bg-u3',
  violet: 'bg-sec',
  slate: 'bg-fg-3',
};

export const TAG_CHIP: Readonly<Record<string, string>> = {
  blue: 'text-u1 bg-[color-mix(in_oklab,var(--u1)_11%,transparent)]',
  green: 'text-u2 bg-[color-mix(in_oklab,var(--u2)_11%,transparent)]',
  amber: 'text-warn bg-warn-soft',
  red: 'text-u3 bg-[color-mix(in_oklab,var(--u3)_10%,transparent)]',
  violet: 'text-sec bg-sec-soft',
  slate: 'text-fg-2 bg-surface-3',
};
