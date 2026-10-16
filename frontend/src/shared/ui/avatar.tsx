import { cn } from '@/shared/lib/cn';

const PALETTE = ['bg-u1', 'bg-u2', 'bg-u3', 'bg-u4', 'bg-sec', 'bg-brand'] as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** Color estable derivado del identificador: la misma persona, el mismo color en todas partes. */
export function colorFor(seed: string): (typeof PALETTE)[number] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? 'bg-brand';
}

const SIZES = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-11 text-sm', xl: 'size-16 text-xl' } as const;

/** Avatar con iniciales. El nombre completo va siempre en el nombre accesible. */
export function Avatar({ name, seed, size = 'md', ring = false, className }: {
  readonly name: string;
  readonly seed?: string;
  readonly size?: keyof typeof SIZES;
  readonly ring?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        'inline-grid shrink-0 select-none place-items-center rounded-full font-semibold tracking-wide text-white dark:text-black/80',
        colorFor(seed ?? name), SIZES[size], ring && 'ring-2 ring-surface', className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 'sm' }: {
  readonly people: readonly { name: string; id: string }[];
  readonly max?: number;
  readonly size?: keyof typeof SIZES;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex -space-x-1.5">
      {shown.map((p) => <Avatar key={p.id} name={p.name} seed={p.id} size={size} ring />)}
      {rest > 0 && (
        <span className={cn('inline-grid place-items-center rounded-full bg-surface-3 font-medium text-fg-2 ring-2 ring-surface', SIZES[size])}>+{rest}</span>
      )}
    </span>
  );
}
