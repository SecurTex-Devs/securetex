'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from './client';
import type { components } from './generated';
import type { InvitableRole } from './types';

type Schemas = components['schemas'];
export type ProjectFilter = 'all' | 'owned' | 'shared' | 'archived' | 'trash';
export type ProjectSort = 'name' | '-name' | 'lastActivity' | '-lastActivity';
export interface ProjectListParams {
  readonly filter: ProjectFilter;
  readonly sort: ProjectSort;
  readonly q?: string;
  readonly tag?: string;
}

/**
 * Claves jerárquicas (Docs/05 §3): invalidar ['projects'] refresca listas y
 * detalles; nunca se invalida la caché entera sin argumentos.
 */
export const projectKeys = {
  all: ['projects'] as const,
  list: (p: ProjectListParams) => ['projects', 'list', p] as const,
  detail: (id: string) => ['projects', id] as const,
  members: (id: string) => ['projects', id, 'members'] as const,
  tags: ['tags'] as const,
  invitations: ['invitations'] as const,
};

export function useProjects(params: ProjectListParams) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () => unwrap(api.GET('/api/v1/projects', { params: { query: { filter: params.filter, sort: params.sort, ...(params.q ? { q: params.q } : {}), ...(params.tag ? { tag: params.tag } : {}) } } })),
    placeholderData: keepPreviousData,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => unwrap(api.GET('/api/v1/projects/{projectId}', { params: { path: { projectId: id } } })),
    retry: false,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: projectKeys.all });
}

export function useCreateProject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Schemas['CreateProjectDto']) => unwrap(api.POST('/api/v1/projects', { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Schemas['UpdateProjectDto']) => unwrap(api.PATCH('/api/v1/projects/{projectId}', { params: { path: { projectId: id } }, body })),
    onSuccess: invalidate,
  });
}

export type LifecycleAction = 'archive' | 'unarchive' | 'trash' | 'restore';

export function useProjectLifecycle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: LifecycleAction }) => {
      const params = { params: { path: { projectId: id } } };
      switch (action) {
        case 'archive': return unwrap(api.POST('/api/v1/projects/{projectId}/archive', params));
        case 'unarchive': return unwrap(api.POST('/api/v1/projects/{projectId}/unarchive', params));
        case 'trash': return unwrap(api.POST('/api/v1/projects/{projectId}/trash', params));
        case 'restore': return unwrap(api.POST('/api/v1/projects/{projectId}/restore', params));
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/projects/{projectId}', { params: { path: { projectId: id } } })),
    onSuccess: invalidate,
  });
}

export function useLeaveProject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.POST('/api/v1/projects/{projectId}/leave', { params: { path: { projectId: id } } })),
    onSuccess: invalidate,
  });
}

// ─────────────────────────── Etiquetas ───────────────────────────

export function useTags() {
  return useQuery({ queryKey: projectKeys.tags, queryFn: () => unwrap(api.GET('/api/v1/tags')) });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['CreateTagDto']) => unwrap(api.POST('/api/v1/tags', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.tags }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/tags/{tagId}', { params: { path: { tagId: id } } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: projectKeys.tags });
      await qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useSetProjectTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tagIds }: { id: string; tagIds: string[] }) =>
      unwrap(api.PUT('/api/v1/projects/{projectId}/tags', { params: { path: { projectId: id } }, body: { tagIds } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: projectKeys.all });
      await qc.invalidateQueries({ queryKey: projectKeys.tags });
    },
  });
}

// ─────────────────────────── Invitaciones y colaboradores ───────────────────────────

export function useReceivedInvitations(enabled = true) {
  return useQuery({ queryKey: projectKeys.invitations, queryFn: () => unwrap(api.GET('/api/v1/invitations')), enabled });
}

export function useRespondInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => {
      const params = { params: { path: { invitationId: id } } };
      return accept
        ? unwrap(api.POST('/api/v1/invitations/{invitationId}/accept', params))
        : unwrap(api.POST('/api/v1/invitations/{invitationId}/decline', params));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: projectKeys.invitations });
      await qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useMembers(id: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.members(id),
    queryFn: () => unwrap(api.GET('/api/v1/projects/{projectId}/members', { params: { path: { projectId: id } } })),
    enabled,
  });
}

function useMembersInvalidate(id: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: projectKeys.detail(id) });
}

export function useInviteMember(id: string) {
  const invalidate = useMembersInvalidate(id);
  return useMutation({
    mutationFn: (body: { email: string; role: InvitableRole }) => unwrap(api.POST('/api/v1/projects/{projectId}/invitations', { params: { path: { projectId: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useRevokeInvitation(id: string) {
  const invalidate = useMembersInvalidate(id);
  return useMutation({
    mutationFn: (invitationId: string) => unwrap(api.DELETE('/api/v1/projects/{projectId}/invitations/{invitationId}', { params: { path: { projectId: id, invitationId } } })),
    onSuccess: invalidate,
  });
}

export function useChangeRole(id: string) {
  const invalidate = useMembersInvalidate(id);
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: InvitableRole }) =>
      unwrap(api.PATCH('/api/v1/projects/{projectId}/members/{userId}', { params: { path: { projectId: id, userId } }, body: { role } })),
    onSuccess: invalidate,
  });
}

export function useRevokeMember(id: string) {
  const invalidate = useMembersInvalidate(id);
  return useMutation({
    mutationFn: (userId: string) => unwrap(api.DELETE('/api/v1/projects/{projectId}/members/{userId}', { params: { path: { projectId: id, userId } } })),
    onSuccess: invalidate,
  });
}
