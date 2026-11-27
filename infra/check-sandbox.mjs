// Se ejecuta dentro del controlador candidato antes de cambiar el gateway.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';

let verified = false;
for (let attempt = 0; attempt < 8 && !verified; attempt++) {
  const id = randomUUID();
  const path = (suffix) => `/jobs/${id}.${suffix}`;
  try {
    const content = '\\documentclass{article}\\begin{document}SecureTex: prueba de salud.\\end{document}';
    await writeFile(path('req.tmp'), JSON.stringify({ engine: 'pdflatex', mainFile: 'main.tex', files: [{ path: 'main.tex', content, encoding: 'utf8' }] }), { mode: 0o600, flag: 'wx' });
    await rename(path('req.tmp'), path('req.json'));
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const frame = await readFile(path('res')).catch(() => null);
      if (frame) {
        const size = frame.readUInt32BE();
        const header = JSON.parse(frame.toString('utf8', 4, 4 + size));
        if (header.status === 'success') {
          assert.ok(header.pdfBytes > 1000);
          assert.equal(frame.toString('ascii', 4 + size, 9 + size), '%PDF-');
          verified = true;
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } finally {
    for (const suffix of ['req.tmp', 'req.json', 'claimed', 'res', 'res.tmp']) await rm(path(suffix), { force: true });
  }
  if (!verified) await new Promise((resolve) => setTimeout(resolve, 2000));
}
assert.ok(verified, 'La candidata no pudo completar un sandbox efímero');
console.log('Sandbox efímero: compilación y PDF válidos; contenedor destruido antes de entregar.');
