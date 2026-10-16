import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ProjectFile, ProjectFileVersion } from '@prisma/client';
import { NotFoundError } from '../../domain/errors';
import type { SafeFilePath } from '../../domain/values';
import type { AppTx } from '../../infrastructure/db/databases';
import { FileCrypto } from '../../infrastructure/security/envelope';
import { FIELD, FieldCipher } from '../../infrastructure/security/field-cipher';

/** Estado CRDT de la sala y su época (linaje). */
export interface CollabState {
  readonly epoch: string;
  readonly update: Uint8Array;
}

/** UUIDv7 generado en la aplicación: el id del archivo forma parte de la AAD antes de insertar. */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const ts = BigInt(Date.now());
  for (let i = 0; i < 6; i += 1) bytes[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Lectura y escritura de archivos cifrados dentro de una transacción con
 * contexto de usuario (RLS). Nunca guarda texto plano: todo pasa por FileCrypto.
 */
@Injectable()
export class EncryptedFileStore {
  constructor(
    private readonly crypto: FileCrypto,
    private readonly cipher: FieldCipher,
  ) {}

  /** Índice ciego de una ruta, ligado al proyecto: la misma ruta en dos proyectos no se puede correlacionar. */
  pathIndex(projectId: string, path: string): string {
    return this.cipher.index(`path:${projectId}`, path);
  }

  encryptPath(path: string): string {
    return this.cipher.encrypt(path, FIELD.filePath);
  }

  decryptPath(stored: string): string {
    return this.cipher.decrypt(stored, FIELD.filePath);
  }

  async createProjectKey(tx: AppTx, projectId: string): Promise<void> {
    await tx.projectKey.create({ data: { projectId, wrappedKek: this.crypto.newProjectKey() } });
  }

  async wrappedKek(tx: AppTx, projectId: string): Promise<Uint8Array> {
    const key = await tx.projectKey.findUnique({ where: { projectId }, select: { wrappedKek: true } });
    // Sin clave no hay contenido legible: el proyecto se destruyó o no es accesible.
    if (!key) throw new NotFoundError();
    return key.wrappedKek;
  }

  /** `size` permite registrar los bytes reales de un binario guardado en base64. */
  async insert(tx: AppTx, projectId: string, actorId: string, path: SafeFilePath, content: string, size = Buffer.byteLength(content, 'utf8')): Promise<ProjectFile> {
    const kek = await this.wrappedKek(tx, projectId);
    const id = uuidv7();
    const sealed = this.crypto.seal(kek, { projectId, fileId: id, version: 1 }, content);
    return tx.projectFile.create({
      data: {
        id, projectId, path: this.encryptPath(path.toString()), pathIndex: this.pathIndex(projectId, path.toString()), kind: path.extension, size,
        version: 1, ...sealed, createdBy: actorId, updatedBy: actorId,
      },
    });
  }

  /** Cada escritura usa una DEK y un nonce nuevos, y sube la versión (que forma parte de la AAD). */
  async rewrite(tx: AppTx, file: ProjectFile, actorId: string, content: string): Promise<ProjectFile> {
    const kek = await this.wrappedKek(tx, file.projectId);
    const version = file.version + 1;
    const sealed = this.crypto.seal(kek, { projectId: file.projectId, fileId: file.id, version }, content);
    return tx.projectFile.update({
      where: { id: file.id },
      data: { ...sealed, version, size: Buffer.byteLength(content, 'utf8'), updatedBy: actorId },
    });
  }

  /**
   * Estado Yjs de la sala, cifrado con la KEK del proyecto. Se guarda en base64
   * dentro del mismo esquema que los archivos (C3 + C4); la AAD usa el id del
   * proyecto, que nunca coincide con el de un archivo.
   */
  async loadCollabState(tx: AppTx, projectId: string): Promise<CollabState | null> {
    const row = await tx.projectCollabState.findUnique({ where: { projectId } });
    if (!row) return null;
    const kek = await this.wrappedKek(tx, projectId);
    const parsed = JSON.parse(this.crypto.open(kek, { projectId, fileId: projectId, version: row.version }, row)) as { e: string; s: string };
    return { epoch: parsed.e, update: Buffer.from(parsed.s, 'base64') };
  }

  async saveCollabState(tx: AppTx, projectId: string, actorId: string, state: CollabState): Promise<void> {
    const kek = await this.wrappedKek(tx, projectId);
    const current = await tx.projectCollabState.findUnique({ where: { projectId }, select: { version: true } });
    const version = (current?.version ?? 0) + 1;
    const sealed = this.crypto.seal(kek, { projectId, fileId: projectId, version }, JSON.stringify({ e: state.epoch, s: Buffer.from(state.update).toString('base64') }));
    await tx.projectCollabState.upsert({
      where: { projectId },
      create: { projectId, version, ...sealed, updatedBy: actorId },
      update: { version, ...sealed, updatedBy: actorId },
    });
  }

  /** Instantánea del historial: cifrada con su propia DEK; la AAD usa el id de la versión. */
  async snapshot(tx: AppTx, projectId: string, fileId: string, path: string, actorId: string, content: string): Promise<void> {
    const kek = await this.wrappedKek(tx, projectId);
    const id = uuidv7();
    const sealed = this.crypto.seal(kek, { projectId, fileId: id, version: 1 }, content);
    await tx.projectFileVersion.create({
      data: { id, projectId, fileId, path: this.encryptPath(path), size: Buffer.byteLength(content, 'utf8'), ...sealed, createdBy: actorId },
    });
  }

  async readVersion(tx: AppTx, row: ProjectFileVersion): Promise<string> {
    const kek = await this.wrappedKek(tx, row.projectId);
    return this.crypto.open(kek, { projectId: row.projectId, fileId: row.id, version: 1 }, row);
  }

  async read(tx: AppTx, file: ProjectFile): Promise<string> {
    const kek = await this.wrappedKek(tx, file.projectId);
    return this.crypto.open(kek, { projectId: file.projectId, fileId: file.id, version: file.version }, file);
  }
}
