// Control de ciclo de vida; nunca interpreta JSON ni ejecuta TeX.
import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, rm, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { UUID, MAX_REQUEST, MAX_RESULT, readRegular, failedResult, publish } from './mailbox.mjs';

const dir = '/jobs';
const sha = process.env.COMPILER_REVISION;
if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error('Revisión inválida');
if (!process.env.SANDBOX_SSH_KEY_B64 || !process.env.SANDBOX_KNOWN_HOSTS) throw new Error('Falta configurar el control del sandbox');
await writeFile('/tmp/control-key', Buffer.from(process.env.SANDBOX_SSH_KEY_B64, 'base64'), { flag: 'wx', mode: 0o600 });
await writeFile('/tmp/control-hosts', process.env.SANDBOX_KNOWN_HOSTS + '\n', { flag: 'wx', mode: 0o600 });
delete process.env.SANDBOX_SSH_KEY_B64;
delete process.env.SANDBOX_KNOWN_HOSTS;

function launch(id) {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', ['-T', '-i', '/tmp/control-key', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
      '-o', 'UserKnownHostsFile=/tmp/control-hosts', '-o', 'HostKeyAlias=securetex-host', '-o', 'ConnectTimeout=5',
      '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2', 'ubuntu@securetex-host', `sandbox-job ${sha} ${id}`],
    { stdio: ['ignore', 'ignore', 'ignore'], env: { PATH: '/usr/bin:/bin' } });
    // El host también impone un plazo y limpia al desconectar: no depende del cliente.
    const timer = setTimeout(() => child.kill('SIGTERM'), 45_000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Sandbox no disponible')); });
  });
}

async function handle(id) {
  const claimed = join(dir, `${id}.claimed`);
  const privateDir = join(dir, `.sandbox-${id}`);
  try {
    await rename(join(dir, `${id}.req.json`), claimed);
  } catch { return; }
  let outcome = failedResult();
  try {
    await mkdir(privateDir, { mode: 0o700 });
    const request = await readRegular(claimed, MAX_REQUEST);
    await publish(join(privateDir, `${id}.req.json`), request);
    request.fill(0);
    await rm(claimed, { force: true });
    await launch(id);
    // SSH solo termina con éxito cuando el contenedor ya se ha destruido.
    outcome = await readRegular(join(privateDir, `${id}.res`), MAX_RESULT);
  } catch {
    process.stderr.write('No se pudo completar un sandbox de compilación.\n');
  } finally {
    await rm(privateDir, { recursive: true, force: true });
    await rm(claimed, { force: true });
  }
  await publish(join(dir, `${id}.res`), outcome).catch(() => {});
}

// Dos entregas simultáneas como máximo; el host admite un solo TeX global.
const active = new Set();
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopping = true; });
await writeFile('/tmp/controller-alive', '');
// Reinicio tras una caída: no quedan procesos TeX (el host los mata por plazo).
for (const name of await readdir(dir)) {
  if (/^\.sandbox-[0-9a-f-]{36}$/.test(name)) await rm(join(dir, name), { recursive: true, force: true });
}
while (!stopping || active.size) {
  await utimes('/tmp/controller-alive', new Date(), new Date());
  if (!stopping) for (const name of await readdir(dir)) {
    const id = name.endsWith('.req.json') ? name.slice(0, -9) : '';
    if (!UUID.test(id) || active.has(id) || active.size >= 2) continue;
    active.add(id);
    void handle(id).finally(() => active.delete(id));
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
}
