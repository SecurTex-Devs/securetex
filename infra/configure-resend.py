#!/usr/bin/env python3
"""Carga SMTP interactiva. No envía correos ni abre el registro público."""
import fcntl
import getpass
import os
from pathlib import Path
import shlex
import smtplib
import ssl
import stat
import sys

if not sys.stdin.isatty():
    raise SystemExit('Ejecutar en una terminal SSH interactiva.')
root = Path.home() / 'securetex'
env = root / '.env'
info = env.lstat()
if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
    raise SystemExit('El .env debe ser un archivo regular con permisos 600.')
key = getpass.getpass('API key de Resend (Sending access para securetex.dayle.dev; no se muestra): ')
if not key.startswith('re_') or not 16 <= len(key) <= 4096 or any(c in key for c in '\r\n\0'):
    raise SystemExit('Clave vacía o formato no admitido. No se ha cambiado nada.')
try:
    with smtplib.SMTP_SSL('smtp.resend.com', 465, timeout=10, context=ssl.create_default_context()) as smtp:
        smtp.login('resend', key)
except (OSError, smtplib.SMTPException):
    raise SystemExit('No se pudo autenticar por SMTP TLS. No se ha cambiado nada; revisa permisos y conectividad.') from None
updates = {
    'SMTP_HOST': 'smtp.resend.com', 'SMTP_PORT': '465', 'SMTP_USER': 'resend',
    'SMTP_PASSWORD': key, 'SMTP_SECURE': 'true', 'MAIL_FROM': 'SecureTex <no-reply@securetex.dayle.dev>',
}
with (root / 'deploy.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    lines = [line for line in env.read_text().splitlines() if line.split('=', 1)[0] not in updates]
    lines.extend(name + '=' + shlex.quote(value) for name, value in updates.items())
    temporary = root / '.env.smtp-next'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write('\n'.join(lines) + '\n')
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, env)
    finally:
        temporary.unlink(missing_ok=True)
print('SMTP TLS autenticado y guardado en .env con permisos 600. No se han enviado correos ni abierto el registro.')
