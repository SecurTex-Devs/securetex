#!/usr/bin/env python3
"""Comprueba que el despliegue no reinicie ni reconfigure contenedores ajenos."""
import json
from pathlib import Path
import subprocess
import sys


def snapshot():
    ids = subprocess.check_output(['docker', 'ps', '-aq', '--no-trunc'], text=True).split()
    if not ids:
        return {}
    containers = json.loads(subprocess.check_output(['docker', 'inspect', *ids], text=True))
    result = {}
    for item in containers:
        if (item['Config'].get('Labels') or {}).get('dev.securetex.app') == 'securetex':
            continue
        result[item['Id']] = {
            'name': item['Name'], 'started': item['State']['StartedAt'],
            'restarts': item['RestartCount'], 'ports': item['HostConfig']['PortBindings'],
            'networks': {name: value['NetworkID'] for name, value in item['NetworkSettings']['Networks'].items()},
        }
    return result


mode, filename = sys.argv[1:]
path = Path(filename)
current = snapshot()
if mode == '--capture':
    path.write_text(json.dumps(current))
    path.chmod(0o600)
elif mode == '--check':
    previous = json.loads(path.read_text())
    changed = [item['name'] for key, item in previous.items() if current.get(key) != item]
    if changed:
        print('ERROR: cambió el estado de contenedores ajenos: ' + ', '.join(changed), file=sys.stderr)
        sys.exit(1)
    print(f'Contenedores ajenos sin cambios: {len(previous)}')
else:
    sys.exit('Usa --capture o --check.')
