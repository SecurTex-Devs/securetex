'use client';

import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark' | 'system';

/**
 * Preferencia de tema: dato de interfaz, no sensible, por eso puede vivir en
 * localStorage (Docs/02-Seguridad-en-el-Cliente.md §5). Nunca tokens aquí.
 */
const STORAGE_KEY = 'stx-theme';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'system' && systemPrefersDark());
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
}

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeState {
  readonly choice: ThemeChoice;
  setChoice: (c: ThemeChoice) => void;
  hydrate: () => void;
}

export const useTheme = create<ThemeState>((set) => ({
  choice: 'system',
  setChoice: (choice) => {
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* almacenamiento no disponible: se aplica solo a esta sesión */
    }
    applyTheme(choice);
    set({ choice });
  },
  hydrate: () => set({ choice: readStored() }),
}));
