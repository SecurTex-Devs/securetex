import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

// El manifiesto del servidor requiere revisión explícita antes de admitir otro esquema.
const [directory, manifest] = process.argv.slice(2);
if (!directory || !manifest) throw new Error('Uso: check-migrations.mjs <migrations> <manifest>');
const approved = JSON.parse(await readFile(manifest, 'utf8'));
const entries = (await readdir(directory, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
if (JSON.stringify(entries) !== JSON.stringify(Object.keys(approved).sort())) throw new Error('Migración nueva o eliminada: falta revisar compatibilidad de reversión y actualizar el manifiesto del servidor.');
for (const name of entries) {
  const sql = await readFile(`${directory}/${name}/migration.sql`, 'utf8');
  const hash = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
  if (approved[name] !== hash) throw new Error(`Migración modificada sin revisión: ${name}`);
}
console.log(`Migraciones revisadas e inmutables: ${entries.length}`);
