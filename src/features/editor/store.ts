'use client';

import { create } from 'zustand';
import { isApiError } from '@/shared/api/errors';
import { filesApi, type FileMeta, type ServerFinding } from './api';
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
export type SaveState = 'saved' | 'saving' | 'offline';
export type FileKind = 'tex' | 'bib' | 'cls' | 'sty' | 'bst' | 'txt';
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
  status: CompileStatus;
  compileError: string | null;
  result: CompileResult | null;
  autoCompile: boolean;
  logOpen: boolean;
  cursor: { line: number; col: number };
  jump: { file: string; line: number; at: number } | null;
  highlight: Src | null;
  /** Último aviso del servidor (cuota, acceso) para mostrarlo una vez. */
  notice: { code: string; message: string; at: number } | null;
  start: (projectId: string, url: string, entries: readonly FileMeta[], mainFile: string, readOnly: boolean) => void;
  stop: () => void;
  refreshTree: () => Promise<void>;
  flush: () => void;
  createFile: (path: string, content?: string) => Promise<void>;
  renameFile: (from: string, to: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  setMain: (path: string) => Promise<void>;
  open: (path: string) => void;
  closeTab: (path: string) => void;
  setView: (v: ViewMode) => void;
  setCursor: (line: number, col: number) => void;
  jumpTo: (file: string, line: number) => void;
  setHighlight: (src: Src | null) => void;
  setAutoCompile: (v: boolean) => void;
  setLogOpen: (v: boolean) => void;
  compile: () => Promise<void>;
}

const KINDS: readonly FileKind[] = ['tex', 'bib', 'cls', 'sty', 'bst', 'txt'];
const toEntry = (m: FileMeta): FileEntry => ({
  id: m.id, path: m.path, size: m.size, version: m.version,
  kind: (KINDS as readonly string[]).includes(m.kind) ? (m.kind as FileKind) : 'txt',
});
const byPath = (list: readonly FileMeta[]) => Object.fromEntries(list.map((m) => [m.path, toEntry(m)]));

/** Proyección ruta → texto del documento Yjs. */
function project(collab: CollabClient, entries: Record<string, FileEntry>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of Object.values(entries)) out[e.path] = collab.text(e.id).toString();
  return out;
}

let projectionTimer: number | null = null;

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

  start: (projectId, url, list, mainFile, readOnly) => {
    get().stop();
    const entries = byPath(list);
    const main = mainFile in entries ? mainFile : (list.find((f) => f.path.endsWith('.tex'))?.path ?? mainFile);
    const collab = new CollabClient(projectId, url, {
      onStatus: (connection) => set((s) => ({ connection, saveState: connection === 'offline' ? 'offline' : s.saveState === 'offline' ? 'saving' : s.saveState })),
      onPending: (pending) => set((s) => ({ saveState: s.connection === 'offline' ? 'offline' : pending ? 'saving' : 'saved' })),
      onTree: () => void get().refreshTree(),
      onAccess: (ro) => set({ readOnly: ro }),
      onError: (code, message) => set({ notice: { code, message, at: Date.now() } }),
      onSynced: () => set((s) => ({ synced: true, files: project(collab, s.entries) })),
    });
    // La proyección se recalcula con un pequeño retardo: escribir no debe recorrer el proyecto en cada tecla.
    collab.doc.on('update', () => {
      if (projectionTimer !== null) window.clearTimeout(projectionTimer);
      projectionTimer = window.setTimeout(() => {
        const s = get();
        if (s.collab === collab) set({ files: project(collab, s.entries) });
      }, 120);
    });
    set({
      projectId, collab, entries, readOnly, synced: false, connection: 'connecting', saveState: 'saved', files: {},
      mainFile: main, activeFile: main, openTabs: [main], status: 'idle', compileError: null, result: null, highlight: null, notice: null,
    });
    collab.connect();
  },

  stop: () => {
    get().collab?.destroy();
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
        files: project(collab, entries),
        openTabs: next,
        activeFile: s.activeFile in entries ? s.activeFile : (next[next.length - 1] ?? s.mainFile),
      };
    });
  },

  flush: () => get().collab?.flush(),

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
  setAutoCompile: (autoCompile) => set({ autoCompile }),
  setLogOpen: (logOpen) => set({ logOpen }),

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
      set({ status: 'failed', compileError: isApiError(e) ? e.message : null });
      return;
    }
    if (findings.some((f) => f.severity === 'blocking')) {
      set({ status: 'blocked', result: { ...emptyResult(get().result), findings, durationMs: performance.now() - started, finishedAt: Date.now() } });
      return;
    }
    set({ status: 'running' });
    const { mainFile, entries } = get();
    const files = project(collab, entries);
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

function emptyResult(previous: CompileResult | null): Omit<CompileResult, 'findings' | 'durationMs' | 'finishedAt'> {
  return previous ?? { model: { blocks: [], labels: new Map(), citations: new Map() }, pages: [], diagnostics: [] };
}
