'use client';

import { create } from 'zustand';
import { humanWait, isApiError } from '@/shared/api/errors';
import { getT } from '@/shared/i18n';
import { IntegrityFailure } from '@/shared/crypto/transport';
import { compileApi, filesApi, type FileMeta, type ServerFinding } from './api';
import type { ServerCompile } from './lib/compile-frame';
import { syncForward, type SyncMap, type SyncTarget } from './lib/synctex';
import { CollabClient, type CollabStatus } from './collab';
import { diagnose, type Diagnostic } from './lib/diagnostics';
import { buildDocument, paginate, type Block, type DocumentModel, type Src } from './lib/latex-blocks';

/**
 * Estado de INTERFAZ del editor. El contenido vive en el documento Yjs de la
 * colaboración (AGENTS.md §2.1); `files` es solo su proyección por ruta para
 * la vista previa y el análisis, recalculada cuando el documento cambia.
 */

export type ViewMode = 'code' | 'split' | 'pdf';
export type CompileStatus = 'idle' | 'analyzing' | 'running' | 'success' | 'failed' | 'blocked';
/** Compilación real en el sandbox del servidor, independiente de la vista previa rápida. */
export type PdfStatus = 'idle' | 'running' | 'done' | 'failed';
/** `pdf`: el PDF real y firmado. `quick`: la vista previa compuesta en el navegador. */
export type PreviewMode = 'pdf' | 'quick';
export type SaveState = 'saved' | 'saving' | 'offline';
export type FileKind = 'tex' | 'bib' | 'cls' | 'sty' | 'bst' | 'txt' | 'png' | 'jpg' | 'jpeg' | 'pdf';
export type SidePanel = 'history' | null;

/** Imágenes y PDF: no se editan como texto ni entran en la colaboración en vivo. */
export const isBinaryKind = (kind: FileKind) => kind === 'png' || kind === 'jpg' || kind === 'jpeg' || kind === 'pdf';
export type SecurityFinding = ServerFinding;

export interface FileEntry {
  readonly id: string;
  readonly path: string;
  readonly kind: FileKind;
  readonly size: number;
  readonly version: number;
}

export interface CompileResult {
  readonly model: DocumentModel;
  readonly pages: readonly (readonly Block[])[];
  readonly diagnostics: readonly Diagnostic[];
  readonly findings: readonly SecurityFinding[];
  readonly durationMs: number;
  readonly finishedAt: number;
}

interface EditorState {
  projectId: string | null;
  collab: CollabClient | null;
  connection: CollabStatus;
  synced: boolean;
  readOnly: boolean;
  files: Record<string, string>;
  entries: Record<string, FileEntry>;
  saveState: SaveState;
  mainFile: string;
  activeFile: string;
  openTabs: string[];
  view: ViewMode;
  panel: SidePanel;
  status: CompileStatus;
  compileError: string | null;
  result: CompileResult | null;
  autoCompile: boolean;
  logOpen: boolean;
  cursor: { line: number; col: number };
  jump: { file: string; line: number; at: number } | null;
  highlight: Src | null;
  /** Resultado del último análisis del servidor: solo con 'ok' se pide la compilación real. */
  analysis: 'ok' | 'blocked' | 'error' | null;
  pdfStatus: PdfStatus;
  pdfError: string | null;
  /** PDF verificado con Ed25519 (C4b); null si la última compilación no produjo uno. */
  pdf: Uint8Array | null;
  server: ServerCompile | null;
  /** Mapa SyncTeX del PDF mostrado (firma verificada); null si la compilación no lo trajo. */
  synctex: SyncMap | null;
  /** SyncTeX directo sobre el PDF real: página y rectángulos que resaltar. */
  pdfTarget: (SyncTarget & { readonly at: number }) | null;
  previewMode: PreviewMode;
  /** Último aviso del servidor (cuota, acceso) para mostrarlo una vez. */
  notice: { code: string; message: string; at: number } | null;
  start: (projectId: string, url: string, entries: readonly FileMeta[], mainFile: string, readOnly: boolean) => void;
  stop: () => void;
  refreshTree: () => Promise<void>;
  flush: () => void;
  createFile: (path: string, content?: string) => Promise<void>;
  uploadFile: (path: string, bytes: Uint8Array) => Promise<void>;
  togglePanel: (p: Exclude<SidePanel, null>) => void;
  renameFile: (from: string, to: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  setMain: (path: string) => Promise<void>;
  open: (path: string) => void;
  closeTab: (path: string) => void;
  setView: (v: ViewMode) => void;
  setCursor: (line: number, col: number) => void;
  jumpTo: (file: string, line: number) => void;
  setHighlight: (src: Src | null) => void;
  /** «Ver en el PDF» desde el cursor. false si no hay PDF real con mapa (se usa la vista rápida). */
  syncToPdf: (file: string, line: number) => boolean;
  setAutoCompile: (v: boolean) => void;
  setLogOpen: (v: boolean) => void;
  compile: () => Promise<void>;
  compilePdf: () => Promise<void>;
  /** Botón «Compilar» y Ctrl+Enter: análisis + vista rápida y, si nada bloquea, compilación real. */
  build: () => Promise<void>;
  setPreviewMode: (m: PreviewMode) => void;
}

const KINDS: readonly FileKind[] = ['tex', 'bib', 'cls', 'sty', 'bst', 'txt', 'png', 'jpg', 'jpeg', 'pdf'];
const toEntry = (m: FileMeta): FileEntry => ({
  id: m.id, path: m.path, size: m.size, version: m.version,
  kind: (KINDS as readonly string[]).includes(m.kind) ? (m.kind as FileKind) : 'txt',
});
const byPath = (list: readonly FileMeta[]) => Object.fromEntries(list.map((m) => [m.path, toEntry(m)]));

/**
 * Proyección ruta → texto del documento Yjs. Si ningún texto cambió devuelve
 * `prev` tal cual: la autocompilación se programa por la identidad de `files`,
 * y un objeto nuevo con el mismo contenido la relanzaría sin fin (y gastaría
 * la cuota de análisis del servidor).
 */
function project(collab: CollabClient, entries: Record<string, FileEntry>, prev: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of Object.values(entries)) if (!isBinaryKind(e.kind)) out[e.path] = collab.text(e.id).toString();
  const keys = Object.keys(out);
  const same = keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === out[k]);
  return same ? prev : out;
}

let projectionTimer: number | null = null;
/** Argumentos del último `start`, para reconstruir el cliente si la sala cambia de época. */
let lastStart: Parameters<EditorState['start']> | null = null;

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  collab: null,
  connection: 'connecting',
  synced: false,
  readOnly: false,
  files: {},
  entries: {},
  saveState: 'saved',
  mainFile: 'main.tex',
  activeFile: 'main.tex',
  openTabs: ['main.tex'],
  view: 'split',
  panel: null,
  status: 'idle',
  compileError: null,
  result: null,
  // Como en Overleaf: vista previa viva al dejar de escribir (F-121).
  autoCompile: true,
  logOpen: false,
  cursor: { line: 1, col: 1 },
  jump: null,
  highlight: null,
  notice: null,
  analysis: null,
  pdfStatus: 'idle',
  pdfError: null,
  pdf: null,
  server: null,
  synctex: null,
  pdfTarget: null,
  previewMode: 'pdf',

  start: (projectId, url, list, mainFile, readOnly) => {
    get().stop();
    lastStart = [projectId, url, list, mainFile, readOnly];
    const entries = byPath(list);
    const main = mainFile in entries ? mainFile : (list.find((f) => f.path.endsWith('.tex'))?.path ?? mainFile);
    const collab = new CollabClient(projectId, url, {
      onStatus: (connection) => set((s) => ({ connection, saveState: connection === 'offline' ? 'offline' : s.saveState === 'offline' ? 'saving' : s.saveState })),
      onPending: (pending) => set((s) => ({ saveState: s.connection === 'offline' ? 'offline' : pending ? 'saving' : 'saved' })),
      onTree: () => void get().refreshTree(),
      onAccess: (ro) => set({ readOnly: ro }),
      onError: (code, message) => set({ notice: { code, message, at: Date.now() } }),
      onReset: () => {
        // Se conserva lo escrito que el servidor no confirmó y se aplica sobre la sala nueva.
        const s = get();
        const pending = s.saveState !== 'saved' ? project(collab, s.entries, {}) : {};
        const args = lastStart;
        if (!args) return;
        get().start(...args);
        const fresh = get().collab;
        if (!fresh || Object.keys(pending).length === 0) return;
        const apply = () => {
          for (const e of Object.values(get().entries)) {
            const mine = pending[e.path];
            const text = fresh.text(e.id);
            if (mine !== undefined && text.toString() !== mine) fresh.doc.transact(() => { text.delete(0, text.length); text.insert(0, mine); });
          }
        };
        const wait = window.setInterval(() => { if (get().synced) { window.clearInterval(wait); apply(); } }, 100);
      },
      onSynced: () => set((s) => ({ synced: true, files: project(collab, s.entries, s.files) })),
    });
    // La proyección se recalcula con un pequeño retardo: escribir no debe recorrer el proyecto en cada tecla.
    collab.doc.on('update', () => {
      if (projectionTimer !== null) window.clearTimeout(projectionTimer);
      projectionTimer = window.setTimeout(() => {
        const s = get();
        if (s.collab === collab) set({ files: project(collab, s.entries, s.files) });
      }, 120);
    });
    set({
      projectId, collab, entries, readOnly, synced: false, connection: 'connecting', saveState: 'saved', files: {},
      mainFile: main, activeFile: main, openTabs: [main], status: 'idle', compileError: null, result: null, highlight: null, notice: null,
      analysis: null, pdfStatus: 'idle', pdfError: null, pdf: null, server: null, synctex: null, pdfTarget: null, previewMode: 'pdf',
    });
    collab.connect();
  },

  stop: () => {
    get().collab?.destroy();
    pdfAgain = false;
    set({ collab: null, projectId: null });
  },

  refreshTree: async () => {
    const { projectId, collab } = get();
    if (!projectId || !collab) return;
    const entries = byPath(await filesApi.list(projectId));
    set((s) => {
      const tabs = s.openTabs.filter((t) => t in entries);
      const next = tabs.length ? tabs : [s.mainFile];
      return {
        entries,
        files: project(collab, entries, s.files),
        openTabs: next,
        activeFile: s.activeFile in entries ? s.activeFile : (next[next.length - 1] ?? s.mainFile),
      };
    });
  },

  flush: () => get().collab?.flush(),

  uploadFile: async (path, bytes) => {
    const { projectId } = get();
    if (!projectId) return;
    await filesApi.upload(projectId, path, bytes);
    await get().refreshTree();
  },

  togglePanel: (p) => set((s) => ({ panel: s.panel === p ? null : p })),

  createFile: async (path, content = '') => {
    const { projectId } = get();
    if (!projectId) return;
    // El contenido inicial viaja sellado (C1 + C2); el servidor lo añade a la sala y avisa a todos.
    const meta = await filesApi.create(projectId, path, content);
    await get().refreshTree();
    get().open(meta.path);
  },

  renameFile: async (from, to) => {
    const { projectId, entries } = get();
    const entry = entries[from];
    if (!projectId || !entry) return;
    const meta = await filesApi.rename(projectId, entry.id, to);
    set((s) => ({
      openTabs: s.openTabs.map((t) => (t === from ? meta.path : t)),
      activeFile: s.activeFile === from ? meta.path : s.activeFile,
    }));
    await get().refreshTree();
  },

  deleteFile: async (path) => {
    const { projectId, entries } = get();
    const entry = entries[path];
    if (!projectId || !entry) return;
    await filesApi.remove(projectId, entry.id);
    await get().refreshTree();
  },

  setMain: async (path) => {
    const { projectId } = get();
    if (!projectId) return;
    await filesApi.setMain(projectId, path);
    set({ mainFile: path });
  },

  open: (path) => set((s) => ({ activeFile: path, openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path] })),
  closeTab: (path) => set((s) => {
    const tabs = s.openTabs.filter((t) => t !== path);
    const next = tabs.length ? tabs : [s.mainFile];
    return { openTabs: next, activeFile: s.activeFile === path ? (next[next.length - 1] ?? s.mainFile) : s.activeFile };
  }),
  setView: (view) => set({ view }),
  setCursor: (line, col) => set({ cursor: { line, col } }),
  jumpTo: (file, line) => set((s) => ({ jump: { file, line, at: Date.now() }, activeFile: file, openTabs: s.openTabs.includes(file) ? s.openTabs : [...s.openTabs, file] })),
  setHighlight: (highlight) => set({ highlight }),
  syncToPdf: (file, line) => {
    const { previewMode, pdf, synctex } = get();
    if (previewMode !== 'pdf' || !pdf || !synctex) return false;
    const target = syncForward(synctex, file, line);
    if (!target) return false;
    set({ pdfTarget: { ...target, at: Date.now() } });
    return true;
  },
  setAutoCompile: (autoCompile) => set({ autoCompile }),
  setLogOpen: (logOpen) => set({ logOpen }),
  setPreviewMode: (previewMode) => set({ previewMode }),

  build: async () => {
    await get().compile();
    // Si había un análisis en vuelo (autocompilación), se espera a su veredicto.
    for (let i = 0; i < 100 && (get().status === 'analyzing' || get().status === 'running'); i += 1) await new Promise((r) => setTimeout(r, 50));
    // Lo que el análisis bloquea no llega al servidor de compilación; sin análisis, tampoco.
    if (get().analysis === 'ok') await get().compilePdf();
  },

  /**
   * Compilación real en el sandbox. Mientras dura (hasta 30 s), la vista
   * previa rápida del navegador sigue disponible como respaldo.
   */
  compilePdf: async () => {
    const { projectId, pdfStatus } = get();
    if (!projectId) return;
    // El servidor admite una compilación a la vez por persona: lo pedido mientras
    // tanto se compila al terminar, con el contenido de ese momento.
    if (pdfStatus === 'running') { pdfAgain = true; return; }
    set({ pdfStatus: 'running', pdfError: null });
    try {
      const { header, pdf, synctex } = await compileApi.run(projectId);
      if (get().projectId !== projectId) return;
      const failed = !pdf;
      set((s) => ({
        server: header,
        pdf: pdf ?? s.pdf,
        // El mapa va siempre con su PDF: si no llegó PDF nuevo, se conserva el par anterior.
        synctex: pdf ? synctex : s.synctex,
        pdfTarget: pdf ? null : s.pdfTarget,
        pdfStatus: failed ? 'failed' : 'done',
        pdfError: failed ? pdfFailure(header.status) : null,
        // Sin PDF nuevo, se vuelve a la vista rápida; con errores, se abre el registro real.
        previewMode: failed && !s.pdf ? 'quick' : s.previewMode,
        logOpen: header.status !== 'success' ? true : s.logOpen,
      }));
    } catch (e) {
      if (get().projectId !== projectId) return;
      set({ pdfStatus: 'failed', pdfError: pdfErrorMessage(e) });
      // Un 422 es una carrera con un colaborador: el análisis vuelve a mostrar el bloqueo.
      if (isApiError(e) && e.status === 422) void get().compile();
    } finally {
      if (pdfAgain && get().projectId === projectId) { pdfAgain = false; void get().build(); }
    }
  },

  /**
   * 1) El SERVIDOR guarda lo que hay en la sala y analiza el proyecto (P-47):
   * si hay algo bloqueante, nunca se genera la vista. 2) La vista previa
   * tipográfica se compone en el navegador.
   */
  compile: async () => {
    const { status, projectId, collab } = get();
    if (!projectId || !collab || status === 'analyzing' || status === 'running') return;
    const started = performance.now();
    set({ status: 'analyzing', compileError: null });
    let findings: SecurityFinding[];
    try {
      findings = (await filesApi.analyze(projectId)).findings;
    } catch (e) {
      set({ status: 'failed', analysis: 'error', compileError: isApiError(e) ? e.message : null });
      return;
    }
    if (findings.some((f) => f.severity === 'blocking')) {
      set({ status: 'blocked', analysis: 'blocked', result: { ...emptyResult(get().result), findings, durationMs: performance.now() - started, finishedAt: Date.now() } });
      return;
    }
    set({ status: 'running', analysis: 'ok' });
    const { mainFile, entries, files: prev } = get();
    const files = project(collab, entries, prev);
    const diagnostics = diagnose(mainFile, files);
    const model = buildDocument(mainFile, files);
    const hasErrors = diagnostics.some((d) => d.level === 'error');
    set({
      files,
      status: hasErrors ? 'failed' : 'success',
      result: { model, pages: paginate(model.blocks), diagnostics, findings, durationMs: performance.now() - started, finishedAt: Date.now() },
      logOpen: hasErrors ? true : get().logOpen,
    });
  },
}));

/** Una recompilación pedida mientras otra estaba en curso (Ctrl+S, autocompilación). */
let pdfAgain = false;

function emptyResult(previous: CompileResult | null): Omit<CompileResult, 'findings' | 'durationMs' | 'finishedAt'> {
  return previous ?? { model: { blocks: [], labels: new Map(), citations: new Map() }, pages: [], diagnostics: [] };
}

function pdfFailure(status: ServerCompile['status']): string {
  const t = getT('editor');
  if (status === 'timeout') return t('pdf.timeout');
  if (status === 'too_large') return t('pdf.tooLarge');
  if (status === 'rejected') return t('pdf.rejected');
  return t('pdf.noOutput');
}

function pdfErrorMessage(e: unknown): string {
  const t = getT('editor');
  // Firma Ed25519, Poly1305 o GCM inválidas: no se muestra nada que no sea auténtico.
  if (e instanceof IntegrityFailure) return t('pdf.integrity');
  if (isApiError(e) && e.kind === 'rate_limited') return t('pdf.busy', { wait: humanWait(e.retryAfterSeconds ?? 5) });
  if (isApiError(e)) return e.message;
  return t('pdf.unreachable');
}
