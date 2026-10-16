'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import type { components } from '@/shared/api/generated';
import { authKeys } from '@/shared/api/session';

type Schemas = components['schemas'];

export const accountKeys = {
  sessions: ['me', 'sessions'] as const,
  identities: ['me', 'identities'] as const,
  activity: ['me', 'activity'] as const,
  preferences: ['me', 'preferences'] as const,
  impact: ['me', 'deletion-impact'] as const,
};

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['UpdateProfileDto']) => unwrap(api.PATCH('/api/v1/me', { body })),
    onSuccess: (data) => qc.setQueryData(authKeys.me, data),
  });
}

export function useSessions() {
  return useQuery({ queryKey: accountKeys.sessions, queryFn: () => unwrap(api.GET('/api/v1/me/sessions')) });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => unwrap(api.DELETE('/api/v1/me/sessions/{sessionId}', { params: { path: { sessionId } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

export function useLogoutOthers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/logout-others')),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

export function useActivity() {
  return useQuery({ queryKey: accountKeys.activity, queryFn: () => unwrap(api.GET('/api/v1/me/activity')) });
}

export function useIdentities() {
  return useQuery({ queryKey: accountKeys.identities, queryFn: () => unwrap(api.GET('/api/v1/me/identities')) });
}

export function useReauth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['ReauthDto']) => unwrap(api.POST('/api/v1/auth/reauth', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (newPassword: string) => unwrap(api.POST('/api/v1/auth/password/change', { body: { newPassword } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: authKeys.me });
      await qc.invalidateQueries({ queryKey: accountKeys.sessions });
    },
  });
}

export function useTotpSetup() {
  return useMutation({ mutationFn: () => unwrap(api.POST('/api/v1/auth/mfa/totp/setup')) });
}

export function useTotpConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => unwrap(api.POST('/api/v1/auth/mfa/totp/confirm', { body: { code } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function useRegenerateCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/mfa/recovery-codes')),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function useDisableMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/auth/mfa')),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function usePreferences() {
  return useQuery({ queryKey: accountKeys.preferences, queryFn: () => unwrap(api.GET('/api/v1/me/preferences')) });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Record<string, unknown>) => unwrap(api.PUT('/api/v1/me/preferences', { body: { prefs } })),
    onSuccess: (data) => qc.setQueryData(accountKeys.preferences, data),
  });
}

export function useDeletionImpact() {
  return useQuery({ queryKey: accountKeys.impact, queryFn: () => unwrap(api.GET('/api/v1/me/deletion-impact')) });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirmation: string) => unwrap(api.DELETE('/api/v1/me', { body: { confirmation } })),
    onSuccess: () => { qc.clear(); window.location.assign('/'); },
  });
}

/**
 * Portabilidad (RF-011): perfil, etiquetas y proyectos con sus archivos ya
 * descifrados por el servidor, en JSON. Se genera en el navegador a partir
 * de la API: nada se almacena en un servidor intermedio.
 */
export async function exportMyData() {
  const profile = await unwrap(api.GET('/api/v1/me'));
  const tags = await unwrap(api.GET('/api/v1/tags'));
  const projects = [];
  for (const filter of ['all', 'archived'] as const) {
    const list = await unwrap(api.GET('/api/v1/projects', { params: { query: { filter, sort: 'name' } } }));
    for (const p of list.items) {
      const files = await unwrap(api.GET('/api/v1/projects/{projectId}/files/contents', { params: { path: { projectId: p.id } } }));
      projects.push({
        id: p.id, name: p.name, role: p.role, compiler: p.compiler, mainFile: p.mainFile, archived: p.archived,
        files: files.map((f) => ({ path: f.path, version: f.version, updatedAt: f.updatedAt, content: f.content })),
      });
    }
  }
  return { format: 'securtex-export/v1', exportedAt: new Date().toISOString(), profile, tags, projects };
}
