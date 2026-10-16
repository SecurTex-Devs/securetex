import type { Src } from './latex-blocks';

/**
 * SyncTeX sobre el PDF real. El mapa lo calcula el sandbox a partir del
 * .synctex.gz, la API lo valida, lo reserializa y lo firma con Ed25519, y el
 * navegador verifica esa firma antes de llegar aquí (C4b):
 *
 *   { v: 1, files: string[], pages: [{ b: number[], r: number[] }] }
 *
 *   b · cajas de línea: [archivo, línea, x, yArriba, ancho, alto] × n
 *   r · tramos de una línea de código: [archivo, línea, x1, x2, yBase] × n
 *
 * Coordenadas en décimas de bp desde la esquina superior izquierda de la
 * página. Aun firmado se vuelve a validar la forma: es barato y este módulo
 * no debe romperse con un mapa inesperado.
 */

export interface SyncPage {
  readonly boxes: Int32Array;
  readonly runs: Int32Array;
}

export interface SyncMap {
  readonly files: readonly string[];
  readonly pages: readonly SyncPage[];
}

/** Rectángulo en bp, origen arriba a la izquierda. */
export interface SyncRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SyncTarget {
  readonly page: number;
  readonly rects: readonly SyncRect[];
}

const BOX = 6;
const RUN = 5;
const MAX_PAGES = 2000;
const MAX_FILES = 200;
const MAX_COORD = 200_000;
/** Altura aproximada de una línea de texto sobre su base, en décimas de bp, si no hay caja que la contenga. */
const ASCENT = 80;
const DESCENT = 25;
/** El tramo acaba donde EMPIEZA su último carácter: se alarga para cubrirlo. */
const LAST_GLYPH = 50;

const ints = (v: unknown, stride: number, files: number): Int32Array | null => {
  if (!Array.isArray(v) || v.length % stride !== 0) return null;
  const out = new Int32Array(v.length);
  for (let i = 0; i < v.length; i += 1) {
    const n: unknown = v[i];
    if (typeof n !== 'number' || !Number.isInteger(n) || Math.abs(n) > MAX_COORD * 10) return null;
    if (i % stride === 0 && (n < 0 || n >= files)) return null;
    out[i] = n;
  }
  return out;
};

export function parseSyncMap(bytes: Uint8Array): SyncMap | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const files = o['files'];
  const pages = o['pages'];
  if (o['v'] !== 1 || !Array.isArray(files) || !Array.isArray(pages) || files.length > MAX_FILES || pages.length > MAX_PAGES) return null;
  if (!files.every((f): f is string => typeof f === 'string')) return null;
  const parsed: SyncPage[] = [];
  for (const p of pages) {
    if (!p || typeof p !== 'object') return null;
    const boxes = ints((p as Record<string, unknown>)['b'], BOX, files.length);
    const runs = ints((p as Record<string, unknown>)['r'], RUN, files.length);
    if (!boxes || !runs) return null;
    parsed.push({ boxes, runs });
  }
  return { files, pages: parsed };
}

/** La caja de línea más ajustada que contiene el punto (o la base de un tramo). */
function enclosingBox(p: SyncPage, x: number, y: number): number {
  let best = -1;
  for (let i = 0; i < p.boxes.length; i += BOX) {
    const bx = p.boxes[i + 2] ?? 0;
    const by = p.boxes[i + 3] ?? 0;
    const bw = p.boxes[i + 4] ?? 0;
    const bh = p.boxes[i + 5] ?? 0;
    if (x < bx || x > bx + bw || y < by || y > by + bh) continue;
    if (best === -1 || bh < (p.boxes[best + 5] ?? 0) || (bh === p.boxes[best + 5] && bw > (p.boxes[best + 4] ?? 0))) best = i;
  }
  return best;
}

const srcOf = (map: SyncMap, arr: Int32Array, i: number): Src | null => {
  const file = map.files[arr[i] ?? -1];
  return file ? { file, line: arr[i + 1] ?? 1 } : null;
};

/**
 * SyncTeX inverso: doble clic en (x, y) bp de la página `page` (desde 1) →
 * archivo y línea. Se busca la línea del PDF bajo el puntero y, dentro de
 * ella, el tramo más cercano en horizontal; sin línea, el tramo más cercano.
 */
export function syncInverse(map: SyncMap, page: number, xBp: number, yBp: number): Src | null {
  const p = map.pages[page - 1];
  if (!p) return null;
  const x = xBp * 10;
  const y = yBp * 10;
  const box = enclosingBox(p, x, y);
  const top = box === -1 ? -Infinity : (p.boxes[box + 3] ?? 0);
  const bottom = box === -1 ? Infinity : top + (p.boxes[box + 5] ?? 0);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < p.runs.length; i += RUN) {
    const x1 = p.runs[i + 2] ?? 0;
    const x2 = (p.runs[i + 3] ?? 0) + LAST_GLYPH;
    const base = p.runs[i + 4] ?? 0;
    if (base < top || base > bottom) continue;
    const dx = Math.max(0, x1 - x, x - x2);
    // Sin caja: la distancia vertical pesa más que la horizontal (se apunta a una línea).
    const dy = box === -1 ? Math.max(0, base - ASCENT - y, y - base - DESCENT) * 3 : 0;
    if (dx + dy < bestScore) { bestScore = dx + dy; best = i; }
  }
  if (best !== -1) return srcOf(map, p.runs, best);
  return box !== -1 ? srcOf(map, p.boxes, box) : null;
}

/** Línea con registros más cercana a la pedida (a igual distancia, la siguiente). */
function nearestLine(map: SyncMap, file: number, line: number): number | null {
  let best: number | null = null;
  const consider = (l: number) => {
    if (best === null || Math.abs(l - line) < Math.abs(best - line) || (Math.abs(l - line) === Math.abs(best - line) && l > best)) best = l;
  };
  for (const p of map.pages) {
    for (let i = 0; i < p.runs.length; i += RUN) if (p.runs[i] === file) consider(p.runs[i + 1] ?? 0);
    for (let i = 0; i < p.boxes.length; i += BOX) if (p.boxes[i] === file) consider(p.boxes[i + 1] ?? 0);
  }
  return best;
}

/** Los tramos de una misma línea base se funden en un solo rectángulo. */
function mergeRects(rects: SyncRect[]): SyncRect[] {
  const out: SyncRect[] = [];
  for (const r of rects.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const prev = out[out.length - 1];
    if (prev && prev.y === r.y && prev.h === r.h && r.x <= prev.x + prev.w + 1) {
      out[out.length - 1] = { ...prev, w: Math.max(prev.x + prev.w, r.x + r.w) - prev.x };
    } else out.push(r);
  }
  return out;
}

/**
 * SyncTeX directo: archivo y línea → la primera página donde aparece y los
 * rectángulos (en bp) que ocupa en ella. Si esa línea no produjo nada en el
 * PDF (un comentario, una línea en blanco), se usa la más cercana que sí.
 */
export function syncForward(map: SyncMap, file: string, line: number): SyncTarget | null {
  const f = map.files.indexOf(file);
  if (f === -1) return null;
  const target = nearestLine(map, f, line);
  if (target === null) return null;
  for (let n = 0; n < map.pages.length; n += 1) {
    const p = map.pages[n];
    if (!p) continue;
    const rects: SyncRect[] = [];
    for (let i = 0; i < p.runs.length; i += RUN) {
      if (p.runs[i] !== f || p.runs[i + 1] !== target) continue;
      const x1 = p.runs[i + 2] ?? 0;
      const x2 = (p.runs[i + 3] ?? 0) + LAST_GLYPH;
      const base = p.runs[i + 4] ?? 0;
      const box = enclosingBox(p, x1, base);
      const top = box === -1 ? base - ASCENT : (p.boxes[box + 3] ?? 0);
      const height = box === -1 ? ASCENT + DESCENT : (p.boxes[box + 5] ?? 0);
      rects.push({ x: x1, y: top, w: x2 - x1, h: height });
    }
    if (!rects.length) {
      for (let i = 0; i < p.boxes.length; i += BOX) {
        if (p.boxes[i] !== f || p.boxes[i + 1] !== target) continue;
        rects.push({ x: p.boxes[i + 2] ?? 0, y: p.boxes[i + 3] ?? 0, w: p.boxes[i + 4] ?? 0, h: p.boxes[i + 5] ?? 0 });
      }
    }
    if (rects.length) {
      const toBp = (r: SyncRect): SyncRect => ({ x: r.x / 10, y: r.y / 10, w: r.w / 10, h: r.h / 10 });
      return { page: n + 1, rects: mergeRects(rects).map(toBp) };
    }
  }
  return null;
}
