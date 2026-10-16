import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ProjectFile } from '@prisma/client';
import { NotFoundError } from '../../domain/errors';
import type { SafeFilePath } from '../../domain/values';
import type { AppTx } from '../../infrastructure/db/databases';
import { FileCrypto } from '../../infrastructure/security/envelope';
import { FIELD, FieldCipher } from '../../infrastructure/security/field-cipher';

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

  async insert(tx: AppTx, projectId: string, actorId: string, path: SafeFilePath, content: string): Promise<ProjectFile> {
    const kek = await this.wrappedKek(tx, projectId);
    const id = uuidv7();
    const sealed = this.crypto.seal(kek, { projectId, fileId: id, version: 1 }, content);
    return tx.projectFile.create({
      data: {
        id, projectId, path: this.encryptPath(path.toString()), pathIndex: this.pathIndex(projectId, path.toString()), kind: path.extension, size: Buffer.byteLength(content, 'utf8'),
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

  async read(tx: AppTx, file: ProjectFile): Promise<string> {
    const kek = await this.wrappedKek(tx, file.projectId);
    return this.crypto.open(kek, { projectId: file.projectId, fileId: file.id, version: file.version }, file);
  }
}
