'use client';

import { api, unwrap } from '@/shared/api/client';
import type { components } from '@/shared/api/generated';

type Schemas = components['schemas'];
export type FileMeta = Schemas['FileMetaDto'];
export type FileWithContent = Schemas['FileWithContentDto'];
export type Analysis = Schemas['AnalysisDto'];
export type ServerFinding = Schemas['SecurityFindingDto'];

/**
 * Archivos del proyecto en el servidor. Se guardan cifrados (C3) y el servidor
 * verifica su HMAC antes de descifrarlos (C4); aquí solo viajan por HTTPS.
 */
const path = (projectId: string) => ({ params: { path: { projectId } } });
const filePath = (projectId: string, fileId: string) => ({ params: { path: { projectId, fileId } } });

export const filesApi = {
  all: (projectId: string) => unwrap(api.GET('/api/v1/projects/{projectId}/files/contents', path(projectId))),
  one: (projectId: string, fileId: string) => unwrap(api.GET('/api/v1/projects/{projectId}/files/{fileId}', filePath(projectId, fileId))),
  create: (projectId: string, body: Schemas['CreateFileDto']) => unwrap(api.POST('/api/v1/projects/{projectId}/files', { ...path(projectId), body })),
  write: (projectId: string, fileId: string, body: Schemas['WriteFileDto']) =>
    unwrap(api.PUT('/api/v1/projects/{projectId}/files/{fileId}/content', { ...filePath(projectId, fileId), body })),
  rename: (projectId: string, fileId: string, newPath: string) =>
    unwrap(api.PATCH('/api/v1/projects/{projectId}/files/{fileId}', { ...filePath(projectId, fileId), body: { path: newPath } })),
  remove: (projectId: string, fileId: string) => unwrap(api.DELETE('/api/v1/projects/{projectId}/files/{fileId}', filePath(projectId, fileId))),
  setMain: (projectId: string, mainFile: string) => unwrap(api.PATCH('/api/v1/projects/{projectId}', { ...path(projectId), body: { mainFile } })),
  analyze: (projectId: string) => unwrap(api.POST('/api/v1/projects/{projectId}/compile/analyze', path(projectId))),
};
