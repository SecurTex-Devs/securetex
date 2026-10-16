/** Diferencias por líneas (LCS) para comparar una versión con el texto actual. */
export type DiffLine = { readonly kind: 'same' | 'added' | 'removed'; readonly text: string };

const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // Prefijo y sufijo comunes fuera: el caso típico es un cambio pequeño en un archivo largo.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const head = a.slice(0, start).map((text) => ({ kind: 'same' as const, text }));
  const tail = a.slice(endA).map((text) => ({ kind: 'same' as const, text }));
  if (midA.length * midB.length > MAX_CELLS) {
    // Demasiado grande para LCS: se muestra como sustitución del bloque central.
    return [...head, ...midA.map((text) => ({ kind: 'removed' as const, text })), ...midB.map((text) => ({ kind: 'added' as const, text })), ...tail];
  }
  const n = midA.length;
  const m = midB.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] = midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) { out.push({ kind: 'same', text: midA[i]! }); i += 1; j += 1; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) { out.push({ kind: 'removed', text: midA[i]! }); i += 1; }
    else { out.push({ kind: 'added', text: midB[j]! }); j += 1; }
  }
  while (i < n) out.push({ kind: 'removed', text: midA[i++]! });
  while (j < m) out.push({ kind: 'added', text: midB[j++]! });
  return [...head, ...out, ...tail];
}
