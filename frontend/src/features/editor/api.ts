'use client';

import { api, unwrap } from '@/shared/api/client';
import type { components } from '@/shared/api/generated';
import { verifyArtifact, verifySynctex } from '@/shared/crypto/artifact';
import { envelopeContext, fetchSealed, openBytesFromServer, replyKeyPair, sealBytesForServer, sealForServer } from '@/shared/crypto/transport';
import { parseCompileFrame, type ServerCompile } from './lib/compile-frame';
import { parseSyncMap, type SyncMap } from './lib/synctex';

type Schemas = components['schemas'];
export type FileMeta = Schemas['FileMetaDto'];
export type Analysis = Schemas['AnalysisDto'];
export type ServerFinding = Schemas['SecurityFindingDto'];

/**
 * Metadatos y operaciones de archivo por REST. El CONTENIDO viaja por la
 * colaboración en tiempo real; cuando sale por REST (crear un archivo), va en
 * un sobre C1 + C2.
 */
const path = (projectId: string) => ({ params: { path: { projectId } } });
const filePath = (projectId: string, fileId: string) => ({ params: { path: { projectId, fileId } } });

export const filesApi = {
  list: (projectId: string) => unwrap(api.GET('/api/v1/projects/{projectId}/files', path(projectId))),
  create: async (projectId: string, newPath: string, content: string) =>
    unwrap(api.POST('/api/v1/projects/{projectId}/files', {
      ...path(projectId),
      body: { path: newPath, envelope: await sealForServer(content, envelopeContext(projectId, 'file:create')) },
    })),
  rename: (projectId: string, fileId: string, newPath: string) =>
    unwrap(api.PATCH('/api/v1/projects/{projectId}/files/{fileId}', { ...filePath(projectId, fileId), body: { path: newPath } })),
  remove: (projectId: string, fileId: string) => unwrap(api.DELETE('/api/v1/projects/{projectId}/files/{fileId}', filePath(projectId, fileId))),
  setMain: (projectId: string, mainFile: string) => unwrap(api.PATCH('/api/v1/projects/{projectId}', { ...path(projectId), body: { mainFile } })),
  analyze: (projectId: string) => unwrap(api.POST('/api/v1/projects/{projectId}/compile/analyze', path(projectId))),
  /** Imagen o PDF: los bytes viajan sellados (C1 + C2); el servidor comprueba el tipo real. */
  upload: async (projectId: string, newPath: string, bytes: Uint8Array) =>
    unwrap(api.POST('/api/v1/projects/{projectId}/files/upload', {
      ...path(projectId),
      body: { path: newPath, envelope: await sealBytesForServer(bytes, envelopeContext(projectId, 'file:upload')) },
    })),
  /** Un archivo completo, sellado y verificado (C5). En los binarios, `content` va en base64. */
  read: (projectId: string, fileId: string) =>
    fetchSealed<FileMeta & { content: string }>(`/api/v1/projects/${projectId}/files/${fileId}`, envelopeContext(projectId, `file:${fileId}`)),
  versions: (projectId: string, fileId: string) => unwrap(api.GET('/api/v1/projects/{projectId}/files/{fileId}/versions', filePath(projectId, fileId))),
  version: (projectId: string, fileId: string, versionId: string) =>
    fetchSealed<string>(`/api/v1/projects/${projectId}/files/${fileId}/versions/${versionId}`, envelopeContext(projectId, `version:${versionId}`), 'text'),
  restore: (projectId: string, fileId: string, versionId: string) =>
    unwrap(api.POST('/api/v1/projects/{projectId}/files/{fileId}/versions/{versionId}/restore', { params: { path: { projectId, fileId, versionId } } })),
};

export type FileVersion = Schemas['FileVersionDto'];

export interface CompiledPdf {
  readonly header: ServerCompile;
  /** Solo existe si superó la verificación Ed25519 (C4b). */
  readonly pdf: Uint8Array | null;
  /** Mapa SyncTeX del PDF, con su firma Ed25519 ya verificada; null si no vino. */
  readonly synctex: SyncMap | null;
}

export const compileApi = {
  /**
   * Compilación real en el sandbox del servidor. La respuesta llega sellada
   * para una clave efímera (C2), se abre verificando Poly1305 y GCM (C5) y el
   * PDF se verifica con Ed25519 (C4b) antes de devolverlo: si algo falla se
   * lanza `IntegrityFailure` y nada llega a PDF.js.
   */
  run: async (projectId: string): Promise<CompiledPdf> => {
    const keys = replyKeyPair();
    const { envelope } = await unwrap(api.POST('/api/v1/projects/{projectId}/compile', { params: { path: { projectId }, header: { 'X-SecurTex-Reply-Key': keys.header } } }));
    const { header, pdf, synctex } = parseCompileFrame(openBytesFromServer(envelope, keys, envelopeContext(projectId, 'compile:pdf')));
    if (pdf.length === 0) return { header, pdf: null, synctex: null };
    await verifyArtifact(pdf, header.compilationId, header.signature);
    if (synctex.length === 0) return { header, pdf, synctex: null };
    // Un mapa que no verifica es una manipulación: se rechaza la respuesta entera, como con el PDF.
    await verifySynctex(synctex, pdf, header.compilationId, header.synctexSignature);
    return { header, pdf, synctex: parseSyncMap(synctex) };
  },
};
