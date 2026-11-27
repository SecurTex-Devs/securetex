#!/usr/bin/env python3
"""Un diagnóstico solicitado por el operador, sin guardar el destinatario."""
from email.message import EmailMessage
import getpass
from pathlib import Path
import re
import shlex
import smtplib
import ssl
import sys

if not sys.stdin.isatty():
    raise SystemExit('Ejecutar en una terminal SSH interactiva.')
names = {'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_SECURE', 'MAIL_FROM'}
config = {}
for line in (Path.home() / 'securetex/.env').read_text().splitlines():
    name, separator, value = line.partition('=')
    if separator and name in names:
        parts = shlex.split(value)
        if len(parts) == 1:
            config[name] = parts[0]
if not names.issubset(config) or config['SMTP_SECURE'] != 'true':
    raise SystemExit('Primero configura SMTP TLS con configure-resend.py.')
recipient = getpass.getpass('Tu correo para recibir la prueba (no se muestra ni se guarda): ').strip()
if len(recipient) > 254 or not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', recipient):
    raise SystemExit('Correo no válido.')
message = EmailMessage()
message['From'] = config['MAIL_FROM']
message['To'] = recipient
message['Subject'] = 'SecureTex · prueba de correo'
message.set_content('El correo de SecureTex está preparado. Esta prueba comprueba la entrega antes de abrir el registro.\n\nAplicación: https://securetex.dayle.dev\n')
try:
    with smtplib.SMTP_SSL(config['SMTP_HOST'], int(config['SMTP_PORT']), timeout=10, context=ssl.create_default_context()) as smtp:
        smtp.login(config['SMTP_USER'], config['SMTP_PASSWORD'])
        rejected = smtp.send_message(message)
        if rejected:
            raise smtplib.SMTPException()
except (OSError, smtplib.SMTPException):
    raise SystemExit('El envío SMTP no se completó. Revisa Resend; no se ha cambiado la aplicación.') from None
print('El servidor SMTP aceptó la prueba. Confirma su recepción en tu bandeja o correo no deseado.')
