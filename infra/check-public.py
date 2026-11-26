#!/usr/bin/env python3
"""Sonda HTTPS del dominio público, ejecutada dentro de la transacción de entrega."""
import json
import re
import sys
import time
import urllib.error
import urllib.request

expected = sys.argv[1]
if not re.fullmatch(r'[0-9a-f]{40}', expected):
    sys.exit('SHA no admitido para la sonda pública.')


def get(path):
    request = urllib.request.Request('https://securetex.dayle.dev' + path, headers={
        'User-Agent': 'SecureTex-Deploy/1.0', 'Cache-Control': 'no-cache',
    })
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status != 200 or response.headers.get('X-SecureTex-Revision') != expected:
            raise ValueError('Estado o revisión inesperados.')
        return response.read().decode('utf-8')


last_error = 'sin respuesta'
for attempt in range(15):
    try:
        health = json.loads(get('/health'))
        if health.get('status') != 'ok' or health.get('database') is not True:
            raise ValueError('Base de datos no disponible.')
        if 'Probar la demo' not in get('/'):
            raise ValueError('Portada no disponible.')
        print('API, base, landing y revisión comprobadas por HTTPS público: ' + expected)
        sys.exit(0)
    except (OSError, ValueError) as error:
        last_error = 'HTTP ' + str(error.code) if isinstance(error, urllib.error.HTTPError) else type(error).__name__
        time.sleep(2)
sys.exit('Falló la sonda HTTPS pública después de 15 intentos: ' + last_error)
