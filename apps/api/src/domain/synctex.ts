import { COMPILE } from './constants';
import { SafeFilePath } from './values';

/**
 * Mapa SyncTeX (PDF ↔ fuente) que calcula el trabajador del sandbox a partir
 * del .synctex.gz. Lo produce código que corre junto a TeX y el documento
 * puede sustituir ese archivo, así que aquí se trata como entrada del
 * atacante (AGENTS.md §3.3): tamaño acotado, estructura exacta, rutas que
 * pasan por SafeFilePath y existen en el proyecto, y números enteros dentro
 * de rango. Si algo no cuadra, no hay mapa: la compilación sigue adelante.
 *
 *   { v: 1, files: string[], pages: [{ b: number[], r: number[] }] }
 *
 *   b · cajas de línea: [archivo, línea, x, yArriba, ancho, alto] × n
 *   r · tramos:         [archivo, línea, x1, x2, yBase] × n
 *
 * Coordenadas en décimas de bp desde la esquina superior izquierda de la página.
 */

export type SynctexRejection = 'too_large' | 'malformed' | 'out_of_bounds' | 'path' | 'empty';

export interface SynctexPage {
  readonly b: readonly number[];
  readonly r: readonly number[];
}

export interface SynctexMap {
  readonly v: 1;
  readonly files: readonly string[];
  readonly pages: readonly SynctexPage[];
}

const BOX = 6;
const RUN = 5;

class Reject extends Error {
  constructor(readonly reason: SynctexRejection) {
    super(reason);
  }
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const coord = (n: unknown): n is number => isInt(n) && Math.abs(n) <= COMPILE.SYNCTEX_MAX_COORD;
const extent = (n: unknown): n is number => isInt(n) && n >= 0 && n <= COMPILE.SYNCTEX_MAX_COORD;
const line = (n: unknown): n is number => isInt(n) && n >= 1 && n <= COMPILE.SYNCTEX_MAX_LINE;

function pathOf(raw: unknown, projectPaths: ReadonlySet<string>): string | null {
  if (typeof raw !== 'string') throw new Reject('malformed');
  try {
    const path = SafeFilePath.of(raw).toString();
    // Ni rutas del contenedor ni archivos que no son del proyecto: se descartan con sus registros.
    return path === raw && projectPaths.has(path) ? path : null;
  } catch {
    return null;
  }
}

/**
 * Valida el mapa y lo reconstruye campo a campo: lo que sale hacia el
 * navegador (y se firma) lo serializa la API, nunca son los bytes del sandbox.
 */
export function validateSynctex(raw: Buffer, projectPaths: ReadonlySet<string>): { map: Buffer } | { rejection: SynctexRejection } {
  if (raw.length === 0) return { rejection: 'empty' };
  if (raw.length > COMPILE.MAX_SYNCTEX_BYTES) return { rejection: 'too_large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    return { rejection: 'malformed' };
  }
  try {
    return { map: Buffer.from(JSON.stringify(rebuild(parsed, projectPaths)), 'utf8') };
  } catch (e) {
    if (e instanceof Reject) return { rejection: e.reason };
    throw e;
  }
}

function rebuild(parsed: unknown, projectPaths: ReadonlySet<string>): SynctexMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Reject('malformed');
  const o = parsed as Record<string, unknown>;
  if (o['v'] !== 1 || !Array.isArray(o['files']) || !Array.isArray(o['pages'])) throw new Reject('malformed');
  if (o['files'].length > COMPILE.SYNCTEX_MAX_FILES || o['pages'].length > COMPILE.SYNCTEX_MAX_PAGES) throw new Reject('out_of_bounds');
  const { files, remap } = remapFiles(o['files'], projectPaths);
  const budget = { numbers: 0 };
  const pages = o['pages'].map((raw) => pageOf(raw, remap, budget));
  if (!files.length) throw new Reject('empty');
  return { v: 1, files, pages };
}

/** Índice del sandbox → índice en el mapa limpio (-1: archivo descartado con sus registros). */
function remapFiles(raw: readonly unknown[], projectPaths: ReadonlySet<string>): { files: string[]; remap: number[] } {
  const files: string[] = [];
  const remap = raw.map((entry) => {
    const path = pathOf(entry, projectPaths);
    if (path === null) return -1;
    const at = files.indexOf(path);
    if (at !== -1) return at;
    files.push(path);
    return files.length - 1;
  });
  if (raw.length && !files.length) throw new Reject('path');
  return { files, remap };
}

function pageOf(raw: unknown, remap: readonly number[], budget: { numbers: number }): SynctexPage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Reject('malformed');
  const { b, r } = raw as Record<string, unknown>;
  if (!Array.isArray(b) || !Array.isArray(r) || b.length % BOX !== 0 || r.length % RUN !== 0) throw new Reject('malformed');
  budget.numbers += b.length + r.length;
  if (budget.numbers > COMPILE.SYNCTEX_MAX_NUMBERS) throw new Reject('out_of_bounds');
  const fileOf = (f: unknown) => {
    if (!isInt(f) || f < 0 || f >= remap.length) throw new Reject('out_of_bounds');
    return remap[f] ?? -1;
  };
  const boxes: number[] = [];
  for (let i = 0; i < b.length; i += BOX) {
    const [f, l, x, y, w, h] = b.slice(i, i + BOX) as unknown[];
    const file = fileOf(f);
    if (!line(l) || !coord(x) || !coord(y) || !extent(w) || !extent(h)) throw new Reject('out_of_bounds');
    if (file !== -1) boxes.push(file, l, x, y, w, h);
  }
  const runs: number[] = [];
  for (let i = 0; i < r.length; i += RUN) {
    const [f, l, x1, x2, y] = r.slice(i, i + RUN) as unknown[];
    const file = fileOf(f);
    if (!line(l) || !coord(x1) || !coord(x2) || x2 < x1 || !coord(y)) throw new Reject('out_of_bounds');
    if (file !== -1) runs.push(file, l, x1, x2, y);
  }
  return { b: boxes, r: runs };
}
