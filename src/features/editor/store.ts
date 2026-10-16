'use client';

import { create } from 'zustand';
import { isApiError } from '@/shared/api/errors';
import { filesApi, type FileMeta, type FileWithContent, type ServerFinding } from './api';
import { diagnose, type Diagnostic } from './lib/diagnostics';
import { buildDocument, paginate, type Block, type DocumentModel, type Src } from './lib/latex-blocks';

/**
 * Estado del editor. La fuente de verdad del contenido es el servidor (archivos
 * cifrados en reposo); aquí vive la copia de trabajo y qué falta por guardar.
 */

export type ViewMode = 'code' | 'split' | 'pdf';
export type CompileStatus = 'idle' | 'analyzing' | 'running' | 'success' | 'failed' | 'blocked';
/** `conflict`: otra pestaña o persona guardó antes (409); no se pisa nada sin preguntar. */
export type SaveState = 'saved' | 'saving' | 'offline' | 'conflict' | 'error';
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
  readOnly: boolean;
  files: Record<string, string>;
  entries: Record<string, FileEntry>;
  /** Rutas con cambios aún no confirmados por el servidor. */
  unsaved: Record<string, true>;
  saveState: SaveState;
  conflictPath: string | null;
  /** Sube cuando el contenido se reemplaza desde fuera del editor de código. */
  revision: number;
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
  init: (projectId: string, files: readonly FileWithContent[], mainFile: string, readOnly: boolean) => void;
  setFile: (path: string, content: string) => void;
  flush: () => Promise<void>;
  resolveConflict: (keep: 'mine' | 'theirs') => Promise<void>;
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

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function moveKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  if (!(from in record)) return record;
  const { [from]: value, ...rest } = record;
  return { ...rest, [to]: value as T };
}

/** Un único guardado en curso: dos PUT simultáneos del mismo archivo chocarían por versión. */
let flushing: Promise<void> | null = null;

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  readOnly: false,
  files: {},
  entries: {},
  unsaved: {},
  saveState: 'saved',
  conflictPath: null,
  revision: 0,
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

  init: (projectId, list, mainFile, readOnly) => {
    const files: Record<string, string> = {};
    const entries: Record<string, FileEntry> = {};
    for (const f of list) {
      files[f.path] = f.content;
      entries[f.path] = toEntry(f);
    }
    const main = mainFile in files ? mainFile : (list.find((f) => f.path.endsWith('.tex'))?.path ?? mainFile);
    set((s) => ({
      projectId, readOnly, files, entries, unsaved: {}, saveState: 'saved', conflictPath: null, revision: s.revision + 1,
      mainFile: main, activeFile: main, openTabs: [main], status: 'idle', compileError: null, result: null, highlight: null,
    }));
  },

  setFile: (path, content) => {
    if (get().readOnly || get().files[path] === content) return;
    set((s) => ({ files: { ...s.files, [path]: content }, unsaved: { ...s.unsaved, [path]: true }, saveState: s.saveState === 'conflict' ? 'conflict' : 'saving' }));
  },

  flush: async () => {
    if (flushing) await flushing;
    if (flushing) return flushing;
    const run = async () => {
      for (;;) {
        const { projectId, unsaved, files, entries, conflictPath } = get();
        if (!projectId || conflictPath) return;
        const path = Object.keys(unsaved)[0];
        if (path === undefined) {
          set({ saveState: 'saved' });
          return;
        }
        const entry = entries[path];
        if (!entry) {
          set((s) => ({ unsaved: without(s.unsaved, path) }));
          continue;
        }
        const content = files[path] ?? '';
        set({ saveState: 'saving' });
        try {
          const meta = await filesApi.write(projectId, entry.id, { content, baseVersion: entry.version });
          set((s) => {
            // Si se siguió escribiendo durante el guardado, queda pendiente para la siguiente vuelta.
            const current = s.entries[path];
            return {
              entries: current?.id === meta.id ? { ...s.entries, [path]: { ...current, version: meta.version, size: meta.size } } : s.entries,
              unsaved: s.files[path] === content ? without(s.unsaved, path) : s.unsaved,
            };
          });
        } catch (e) {
          if (isApiError(e) && e.code === 'version_conflict') set({ saveState: 'conflict', conflictPath: path });
          else set({ saveState: isApiError(e) && e.kind === 'network' ? 'offline' : 'error' });
          return;
        }
      }
    };
    flushing = run().finally(() => { flushing = null; });
    return flushing;
  },

  resolveConflict: async (keep) => {
    const { projectId, conflictPath, entries } = get();
    const entry = conflictPath ? entries[conflictPath] : undefined;
    if (!projectId || !conflictPath || !entry) return;
    const server = await filesApi.one(projectId, entry.id);
    if (keep === 'theirs') {
      set((s) => ({
        files: { ...s.files, [conflictPath]: server.content },
        entries: { ...s.entries, [conflictPath]: toEntry(server) },
        unsaved: without(s.unsaved, conflictPath),
        conflictPath: null, saveState: 'saved', revision: s.revision + 1,
      }));
      return;
    }
    // «Conservar la mía»: se reescribe sobre la versión que ahora tiene el servidor.
    set((s) => ({ entries: { ...s.entries, [conflictPath]: toEntry(server) }, conflictPath: null }));
    await get().flush();
  },

  createFile: async (path, content = '') => {
    const { projectId } = get();
    if (!projectId) return;
    const meta = await filesApi.create(projectId, { path, content });
    set((s) => ({
      files: { ...s.files, [meta.path]: content },
      entries: { ...s.entries, [meta.path]: toEntry(meta) },
      activeFile: meta.path,
      openTabs: s.openTabs.includes(meta.path) ? s.openTabs : [...s.openTabs, meta.path],
    }));
  },

  renameFile: async (from, to) => {
    const { projectId, entries } = get();
    const entry = entries[from];
    if (!projectId || !entry) return;
    await get().flush();
    const meta = await filesApi.rename(projectId, entry.id, to);
    set((s) => ({
      files: moveKey(s.files, from, meta.path),
      entries: { ...without(s.entries, from), [meta.path]: { ...entry, path: meta.path, kind: toEntry(meta).kind } },
      unsaved: moveKey(s.unsaved, from, meta.path),
      openTabs: s.openTabs.map((t) => (t === from ? meta.path : t)),
      activeFile: s.activeFile === from ? meta.path : s.activeFile,
    }));
  },

  deleteFile: async (path) => {
    const { projectId, entries } = get();
    const entry = entries[path];
    if (!projectId || !entry) return;
    await filesApi.remove(projectId, entry.id);
    set((s) => {
      const tabs = s.openTabs.filter((t) => t !== path);
      const next = tabs.length ? tabs : [s.mainFile];
      return {
        files: without(s.files, path),
        entries: without(s.entries, path),
        unsaved: without(s.unsaved, path),
        openTabs: next,
        activeFile: s.activeFile === path ? (next[next.length - 1] ?? s.mainFile) : s.activeFile,
      };
    });
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
   * 1) Se guarda lo pendiente. 2) El SERVIDOR analiza los archivos guardados y
   * decide (P-47): si hay algo bloqueante, nunca se llega a generar la vista.
   * 3) La vista previa tipográfica se genera en el navegador.
   */
  compile: async () => {
    const { status, projectId } = get();
    if (!projectId || status === 'analyzing' || status === 'running') return;
    const started = performance.now();
    set({ status: 'analyzing', compileError: null });
    await get().flush();
    let findings: SecurityFinding[];
    try {
      const analysis = await filesApi.analyze(projectId);
      findings = analysis.findings;
    } catch (e) {
      set({ status: 'failed', compileError: isApiError(e) ? e.message : null });
      return;
    }
    if (findings.some((f) => f.severity === 'blocking')) {
      set({ status: 'blocked', result: { ...emptyResult(get().result), findings, durationMs: performance.now() - started, finishedAt: Date.now() } });
      return;
    }
    set({ status: 'running' });
    const { files, mainFile } = get();
    const diagnostics = diagnose(mainFile, files);
    const model = buildDocument(mainFile, files);
    const hasErrors = diagnostics.some((d) => d.level === 'error');
    set({
      status: hasErrors ? 'failed' : 'success',
      result: { model, pages: paginate(model.blocks), diagnostics, findings, durationMs: performance.now() - started, finishedAt: Date.now() },
      logOpen: hasErrors ? true : get().logOpen,
    });
  },
}));

function emptyResult(previous: CompileResult | null): Omit<CompileResult, 'findings' | 'durationMs' | 'finishedAt'> {
  return previous ?? { model: { blocks: [], labels: new Map(), citations: new Map() }, pages: [], diagnostics: [] };
}
