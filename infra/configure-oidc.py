#!/usr/bin/env python3
"""Configuración interactiva por SSH: secretos sin eco, historia ni archivos locales."""
import getpass
import os
from pathlib import Path
import re
import shlex
import stat
import sys

if len(sys.argv) != 2 or sys.argv[1] not in ('google', 'microsoft') or not sys.stdin.isatty():
    raise SystemExit('Uso en una terminal SSH: configure-oidc.py google|microsoft')
provider = sys.argv[1]
root = Path.home() / 'securetex'
env = root / '.env'
if env.is_symlink() or stat.S_IMODE(env.stat().st_mode) != 0o600:
    raise SystemExit('El .env debe ser un archivo regular con permisos 600.')
client_id = input('Application (client) ID: ').strip()
pattern = r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}' if provider == 'microsoft' else r'[A-Za-z0-9._-]+\.apps\.googleusercontent\.com'
if not re.fullmatch(pattern, client_id):
    raise SystemExit('El ID no tiene el formato esperado. No se ha cambiado nada.')
secret = getpass.getpass('VALOR del secreto (no Secret ID; al pegar no se muestra): ')
if not 16 <= len(secret) <= 4096 or any(c in secret for c in '\r\n\0'):
    raise SystemExit('Secreto vacío o formato no admitido. No se ha cambiado nada.')
updates = {provider.upper() + '_CLIENT_ID': client_id, provider.upper() + '_CLIENT_SECRET': secret}
if provider == 'microsoft':
    updates['MICROSOFT_TENANT'] = 'common'
# Se toma el bloqueo de despliegue después de la entrada interactiva.
import fcntl
with (root / 'deploy.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    lines = [line for line in env.read_text().splitlines() if line.split('=', 1)[0] not in updates]
    lines.extend(name + '=' + shlex.quote(value) for name, value in updates.items())
    temporary = root / '.env.oidc-next'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write('\n'.join(lines) + '\n')
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, env)
    finally:
        temporary.unlink(missing_ok=True)
print('Proveedor guardado en el .env del servidor con permisos 600. No se ha reiniciado ningún servicio ni abierto el registro.')
