#!/usr/bin/env python3
"""Una clave de control por servidor; no instala software ni imprime secretos."""
import base64
import json
import os
from pathlib import Path
import shlex
import stat
import subprocess
import tempfile

root = Path.home() / 'securetex'
env = root / '.env'
assert not env.is_symlink() and stat.S_IMODE(env.stat().st_mode) == 0o600
content = env.read_text()
assert 'SANDBOX_SSH_KEY_B64=' not in content, 'El control del sandbox ya está configurado.'
network = json.loads(subprocess.check_output(['docker', 'network', 'inspect', 'securetex-edge']))[0]
assert network['Labels']['dev.securetex.app'] == 'securetex'
subnet = network['IPAM']['Config'][0]['Subnet']
host_key = Path('/etc/ssh/ssh_host_ed25519_key.pub').read_text().split()
assert host_key[0] == 'ssh-ed25519'
hosts = 'securetex-host ' + ' '.join(host_key[:2])
os.umask(0o077)
with tempfile.TemporaryDirectory(prefix='securetex-sandbox-', dir='/dev/shm') as temporary:
    key = Path(temporary) / 'key'
    subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(key), '-C', 'securetex-sandbox'], check=True)
    encoded = base64.b64encode(key.read_bytes()).decode('ascii')
    public = key.with_suffix('.pub').read_text().strip()
    command = f'{root}/infra/sandbox-job.sh'
    entry = f'from="{subnet}",restrict,command="{command}" {public}\n'
    authorized = Path.home() / '.ssh/authorized_keys'
    assert not authorized.is_symlink()
    with authorized.open('a') as file:
        file.write('\n' + entry)
    authorized.chmod(0o600)
    with env.open('a') as file:
        file.write('\nSANDBOX_SSH_KEY_B64=' + shlex.quote(encoded) + '\n')
        file.write('SANDBOX_KNOWN_HOSTS=' + shlex.quote(hosts) + '\n')
print('Control del sandbox creado: clave restringida al comando y red de SecureTex; .env 600.')
