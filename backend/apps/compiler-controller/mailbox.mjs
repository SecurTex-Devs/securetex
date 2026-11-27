import { constants } from 'node:fs';
import { open, rename, writeFile } from 'node:fs/promises';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_REQUEST = 72 * 1024 * 1024;
export const MAX_RESULT = 22 * 1024 * 1024;

/** Solo bytes regulares acotados: una salida hostil nunca puede seguir enlaces. */
export async function readRegular(path, maximum) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maximum) throw new Error('Archivo de compilación rechazado');
    const data = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await file.read(data, offset, data.length - offset, offset);
      if (bytesRead === 0) throw new Error('Archivo incompleto');
      offset += bytesRead;
    }
    return data;
  } finally { await file.close(); }
}

export function failedResult() {
  const header = Buffer.from(JSON.stringify({ status: 'failed', runs: 0, durationMs: 0, log: '', pdfBytes: 0, synctexBytes: 0 }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header]);
}

export async function publish(path, data) {
  await writeFile(`${path}.tmp`, data, { mode: 0o600, flag: 'wx' });
  await rename(`${path}.tmp`, path);
}
