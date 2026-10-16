'use client';

import type { PDFDocumentLoadingTask, PDFWorker } from 'pdfjs-dist';

type PdfJs = typeof import('pdfjs-dist');

let loaded: Promise<{ pdfjs: PdfJs; worker: PDFWorker }> | null = null;

/**
 * PDF.js se carga bajo demanda (solo en el cliente) y su análisis del PDF
 * corre en un Worker propio del mismo origen (CSP `worker-src 'self'`): un
 * PDF malicioso que explotara el analizador no comparte hilo con la página
 * ni con las claves de sesión en memoria.
 *
 * El PDFWorker es único y se pasa explícitamente a cada documento: con
 * `GlobalWorkerOptions.workerPort` todos los documentos comparten el mismo
 * PDFWorker y destruir el anterior (recompilación en curso) cerraba su canal,
 * con lo que el PDF nuevo fallaba al abrirse.
 */
function load(): Promise<{ pdfjs: PdfJs; worker: PDFWorker }> {
  loaded ??= import('pdfjs-dist').then((pdfjs) => {
    const port = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
    // fromPort: el constructor está mal tipado en pdfjs-dist 4.10 (port?: null).
    const worker: PDFWorker = pdfjs.PDFWorker.fromPort({ port });
    return { pdfjs, worker };
  }).catch((e: unknown) => { loaded = null; throw e; });
  return loaded;
}

export async function loadPdfJs(): Promise<PdfJs> {
  return (await load()).pdfjs;
}

/**
 * Apertura endurecida (sec(pdf), AGENTS.md §3.4):
 *  · isEvalSupported: false → nunca `new Function` para las fuentes (CVE-2024-4367; la CSP tampoco lo permite).
 *  · enableXfa: false       → sin formularios XFA.
 *  · Sin capa de anotaciones ni gestor de scripting: el JavaScript embebido
 *    en el PDF no se carga jamás (equivale a enableScripting: false del visor).
 *  · disableAutoFetch/disableStream: los bytes ya están en memoria y verificados.
 */
export async function openPdf(data: Uint8Array): Promise<PDFDocumentLoadingTask> {
  const { pdfjs, worker } = await load();
  return pdfjs.getDocument({
    worker,
    // Copia: PDF.js transfiere el búfer al Worker y dejaría vacío el original (que se usa para descargar).
    data: data.slice(),
    isEvalSupported: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    disableFontFace: false,
    useSystemFonts: false,
    stopAtErrors: false,
  });
}

export async function annotationModeDisabled(): Promise<number> {
  return (await loadPdfJs()).AnnotationMode.DISABLE;
}

/** Descarga del PDF ya verificado. El enlace es un blob: creado aquí, nunca una URL de terceros. */
export function downloadPdf(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
