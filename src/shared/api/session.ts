'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './client';

export const authKeys = {
  me: ['me'] as const,
  providers: ['auth', 'providers'] as const,
};

/** Perfil de la sesión actual. Con `silent401` no redirige (páginas públicas). */
export function useMe({ silent401 = false }: { readonly silent401?: boolean } = {}) {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => unwrap(api.GET('/api/v1/me')),
    staleTime: 60_000,
    meta: { silent401 },
  });
}

/**
 * Cerrar sesión limpia también la caché de consultas y el almacenamiento
 * local del documento: nada de un usuario queda para el siguiente en un
 * equipo compartido (Docs/02 §4).
 */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/logout')),
    onSettled: async () => {
      qc.clear();
      try {
        const dbs = await indexedDB.databases();
        await Promise.all(dbs.map((d) => (d.name ? new Promise((r) => { const req = indexedDB.deleteDatabase(d.name ?? ''); req.onsuccess = r; req.onerror = r; }) : null)));
      } catch {
        /* navegadores sin indexedDB.databases(): no hay nada que limpiar */
      }
      window.location.assign('/entrar');
    },
  });
}

export interface EditorPrefs {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly wrap: boolean;
  readonly lineNumbers: boolean;
  readonly autocomplete: boolean;
  readonly autoclose: boolean;
  /** 'jetbrains' | 'system'. */
  readonly font: string;
  /** Idioma del corrector del navegador: 'es' | 'en' | 'off'. */
  readonly spell: string;
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = { fontSize: 14, lineHeight: 1.75, wrap: true, lineNumbers: true, autocomplete: true, autoclose: true, font: 'jetbrains', spell: 'es' };

/** Todas las preferencias guardadas (cifradas en el servidor), tal cual. */
export function useRawPreferences() {
  return useQuery({ queryKey: ['me', 'preferences'], queryFn: () => unwrap(api.GET('/api/v1/me/preferences')), staleTime: 60_000 });
}

/** Guarda un cambio parcial sin perder las demás preferencias. */
export function useSavePreferencesPatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => {
      const current = (qc.getQueryData<{ prefs: Record<string, unknown> }>(['me', 'preferences'])?.prefs ?? {});
      return unwrap(api.PUT('/api/v1/me/preferences', { body: { prefs: { ...current, ...patch } } }));
    },
    onSuccess: (data) => qc.setQueryData(['me', 'preferences'], data),
  });
}

/** Preferencias del editor guardadas en la cuenta (F-021). Misma clave que en Ajustes. */
export function useEditorPrefs(): EditorPrefs {
  const { data } = useQuery({ queryKey: ['me', 'preferences'], queryFn: () => unwrap(api.GET('/api/v1/me/preferences')), staleTime: 60_000 });
  const raw = (data?.prefs ?? {}) as Partial<EditorPrefs>;
  return { ...DEFAULT_EDITOR_PREFS, ...raw };
}
