import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { failedResult, publish, readRegular, UUID } from './mailbox.mjs';

test('El buzón rechaza enlaces, directorios, exceso y sobrescritura', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'securetex-mailbox-'));
  try {
    const source = join(dir, 'source');
    await writeFile(source, 'documento de demostración');
    assert.equal((await readRegular(source, 100)).toString(), 'documento de demostración');
    await assert.rejects(readRegular(source, 1));
    await mkdir(join(dir, 'directory'));
    await assert.rejects(readRegular(join(dir, 'directory'), 100));
    await symlink(source, join(dir, 'link'));
    await assert.rejects(readRegular(join(dir, 'link'), 100));
    await assert.rejects(readRegular(join(dir, 'missing'), 100));
    await publish(join(dir, 'result'), Buffer.from('PDF'));
    assert.equal(await readFile(join(dir, 'result'), 'utf8'), 'PDF');
    await writeFile(join(dir, 'result.tmp'), 'ocupado');
    await assert.rejects(publish(join(dir, 'result'), Buffer.from('otro')));
    assert.equal(await readFile(join(dir, 'result'), 'utf8'), 'PDF');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('El resultado de fallo usa el protocolo de la API y no contiene contenido', () => {
  const frame = failedResult();
  const header = JSON.parse(frame.subarray(4).toString());
  assert.equal(frame.readUInt32BE(), frame.length - 4);
  assert.deepEqual(header, { status: 'failed', runs: 0, durationMs: 0, log: '', pdfBytes: 0, synctexBytes: 0 });
});

test('Identificadores y rutas de control son UUID completos', () => {
  assert.equal(UUID.test('4c387bde-f9ad-4927-8ca1-430a9381c220'), true);
  for (const value of ['../x', '123', 'A'.repeat(36), '4c387bde-f9ad-4927-8ca1-430a9381c220/../x', 'x\n']) {
    assert.equal(UUID.test(value), false);
  }
});
