/** Subida de figuras: nombre seguro, tipo y tamaño comprobados antes de cifrar y enviar. */

export const UPLOAD_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf'] as const;
export const MAX_UPLOAD_BYTES = 5_000_000;
export const UPLOAD_ACCEPT = '.png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf';

/**
 * «Mi Figura (1).PNG» → «figuras/mi-figura-1.png». Solo letras, números, guiones
 * y puntos: el servidor lo vuelve a validar con SafeFilePath.
 */
export function uploadPath(fileName: string, folder: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) return null;
  const stem = fileName.slice(0, dot)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'figura';
  const dir = folder.replace(/^\/+|\/+$/g, '');
  return `${dir ? `${dir}/` : ''}${stem}.${ext}`;
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Tipo de contenido a partir de la extensión YA validada por el servidor (nunca del archivo del cliente). */
export function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'pdf') return 'application/pdf';
  return 'text/plain;charset=utf-8';
}

export function downloadBlob(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
