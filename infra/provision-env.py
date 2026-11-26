#!/usr/bin/env python3
"""Secretos nuevos en el servidor; nunca imprime claves ni tokens."""
import base64
import json
import os
from pathlib import Path
import re
import secrets
import select
import stat
import sys

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, padding, rsa, x25519

root = Path.home() / 'securetex'
env_path = root / '.env'


def encoded(value):
    return base64.b64encode(value).decode('ascii')


def private_key(key):
    return encoded(key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))


def create():
    root.mkdir(mode=0o700, exist_ok=True)
    passwords = {name: secrets.token_hex(24) for name in ['POSTGRES_PASSWORD', 'DB_IDENTITY_PASSWORD', 'DB_APP_PASSWORD', 'DB_AUDIT_PASSWORD']}
    values = {
        **passwords, 'POSTGRES_USER': 'securtex_owner', 'POSTGRES_DB': 'securtex',
        'DATABASE_URL': 'postgresql://securtex_owner:' + passwords['POSTGRES_PASSWORD'] + '@securetex-postgres:5432/securtex',
        'NODE_ENV': 'production', 'APP_ORIGIN': 'https://securetex.dayle.dev', 'PORT': '4000',
        'TRUST_PROXY': 'loopback,uniquelocal', 'COOKIE_SECURE': 'true',
        'REGISTRATION_ENABLED': 'false', 'DEMO_ENABLED': 'true', 'API_DOCS_ENABLED': 'false',
        'JWT_PRIVATE_KEY': private_key(ed25519.Ed25519PrivateKey.generate()),
        'TRANSPORT_PRIVATE_KEY': private_key(x25519.X25519PrivateKey.generate()),
        'COMPILER_SIGNING_KEY': private_key(ed25519.Ed25519PrivateKey.generate()),
        'MFA_ENCRYPTION_KEY': encoded(secrets.token_bytes(32)), 'FILES_MASTER_KEY': encoded(secrets.token_bytes(32)),
        'DATA_MASTER_KEY': encoded(secrets.token_bytes(32)), 'COMPILE_JOBS_DIR': '/jobs', 'COMPILE_TIMEOUT_MS': '30000',
        'SMTP_HOST': '127.0.0.1', 'SMTP_PORT': '9', 'MAIL_FROM': 'noreply@example.com', 'HIBP_ENABLED': 'true',
    }
    for role in ['IDENTITY', 'APP', 'AUDIT']:
        values['DATABASE_URL_' + role] = 'postgresql://securtex_' + role.lower() + ':' + passwords['DB_' + role + '_PASSWORD'] + '@securetex-postgres:5432/securtex'
    fd = os.open(str(env_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(''.join(name + '=' + value + '\n' for name, value in values.items()))
    print('Entorno de producción creado con claves propias y permisos 600.')


def receive_tunnel():
    info = env_path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid():
        raise ValueError('Permisos o propietario de .env no admitidos.')
    if any(line.startswith('TUNNEL_TOKEN=') for line in env_path.read_text().splitlines()):
        raise ValueError('El token ya está configurado; no se sustituye automáticamente.')
    key = rsa.generate_private_key(public_exponent=65537, key_size=4096, backend=default_backend())
    public = key.public_key().public_numbers()
    url64 = lambda value: base64.urlsafe_b64encode(value.to_bytes((value.bit_length() + 7) // 8, 'big')).decode().rstrip('=')
    print(json.dumps({'kty': 'RSA', 'n': url64(public.n), 'e': url64(public.e), 'alg': 'RSA-OAEP-256', 'ext': True}), flush=True)
    if not select.select([sys.stdin], [], [], 300)[0]:
        raise ValueError('Caducó el canal de transferencia.')
    ciphertext = base64.b64decode(sys.stdin.readline(8192).strip(), validate=True)
    token = key.decrypt(ciphertext, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=b'securetex:tunnel')).decode('ascii')
    if not re.fullmatch(r'[A-Za-z0-9+/=_-]{40,4096}', token):
        raise ValueError('Formato de token no admitido.')
    with env_path.open('a') as output:
        output.write('TUNNEL_TOKEN=' + token + '\n')
    print('Token recibido y guardado en .env; clave de transporte descartada.', flush=True)


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--create']:
            create()
        elif sys.argv[1:] == ['--tunnel-token']:
            receive_tunnel()
        else:
            raise ValueError('Usa --create o --tunnel-token.')
    except Exception:
        print('No se pudo preparar el entorno; revisa su estado sin mostrar los valores.', file=sys.stderr)
        sys.exit(1)
