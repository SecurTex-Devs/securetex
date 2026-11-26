#!/usr/bin/env bash
# Se ejecuta manualmente después de aprobar la instalación; nunca desde el despliegue.
set -Eeuo pipefail

version=20261123.1
runtime=securetex-runsc
destination="/usr/local/lib/securetex-gvisor/$version"
checksum=930967c01eaa8c91a90903ba866070dd165c580d3197287747bb1444ee11dab7350db11d8f90bf00efb2cdcfb2318602d3f329c522c9e9436a86fe6a93c7b7fc
config=/etc/docker/daemon.json

if [[ "${1:---plan}" == --plan ]]; then
  printf '%s\n' \
    "Paquete oficial gVisor $version, ARM64, SHA-512 fijado." \
    "Instalar en $destination (propietario root)." \
    "Añadir únicamente runtimes.$runtime a $config; conservar el runtime predeterminado." \
    'Guardar copia de la configuración, validarla y recargar Docker con SIGHUP.' \
    'Comparar identificadores, fechas de arranque y reinicios de todos los contenedores existentes.' \
    'No instala Compose, no reinicia Docker y no despliega la aplicación.' \
    'Aplicación explícita: sudo bash infra/install-gvisor.sh --apply'
  exit 0
fi
[[ "${1:-}" == --apply && $# == 1 ]] || { echo 'Usa --plan o --apply.' >&2; exit 2; }
[[ $EUID == 0 && $(uname -m) == aarch64 ]] || { echo 'Requiere root en el servidor ARM64.' >&2; exit 1; }
for command in curl python3 tar bzip2 flock dockerd docker systemctl install sha512sum; do
  command -v "$command" >/dev/null || { echo "Falta $command; no se instalará automáticamente." >&2; exit 1; }
done
[[ ! -e "$destination" && ! -L "$config" ]] || { echo 'Destino existente o configuración enlazada: revisión manual necesaria.' >&2; exit 1; }
exec 9>/run/securetex-gvisor-install.lock
flock -n 9 || { echo 'Ya hay una instalación en curso.' >&2; exit 1; }
umask 077
stage=$(mktemp -d /run/securetex-gvisor.XXXXXX)
backup="/etc/docker/daemon.json.securetex-$(date -u +%Y%m%dT%H%M%SZ).bak"
changed=false

cleanup() {
  if [[ -n "${candidate:-}" ]]; then rm -f -- "$candidate"; fi
  case "$stage" in /run/securetex-gvisor.*) rm -rf -- "$stage" ;; esac
}
rollback() {
  local status=$?
  trap - ERR
  if $changed; then
    cp -p -- "$backup" "$config"
    systemctl reload docker || echo 'La recarga de la configuración anterior necesita revisión.' >&2
  fi
  echo "Instalación incompleta. No se ha reiniciado ningún contenedor. Revisa $destination y $backup." >&2
  exit "$status"
}
trap cleanup EXIT
trap rollback ERR

# Captura solo identidad y estado; nunca variables, argumentos ni secretos de otros servicios.
snapshot() {
  python3 - "$1" <<'PY'
import json, subprocess, sys
ids = subprocess.check_output(['docker', 'ps', '-q', '--no-trunc'], text=True).split()
rows = json.loads(subprocess.check_output(['docker', 'inspect', *ids], text=True)) if ids else []
state = {r['Id']: [r['State']['StartedAt'], r['RestartCount'], r['HostConfig']['PortBindings'],
                  {k: v['NetworkID'] for k, v in r['NetworkSettings']['Networks'].items()}] for r in rows}
with open(sys.argv[1], 'w') as f:
    json.dump(state, f, sort_keys=True)
PY
}
snapshot "$stage/before.json"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://github.com/google/gvisor/releases/download/release-$version/gvisor-aarch64.tar.bz2" -o "$stage/gvisor.tar.bz2"
printf '%s  %s\n' "$checksum" "$stage/gvisor.tar.bz2" | sha512sum -c -

python3 - "$stage/gvisor.tar.bz2" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], 'r:bz2') as archive:
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('El paquete contiene una ruta o tipo no permitido.')
PY
install -d -m 0755 "$destination"
tar -xjf "$stage/gvisor.tar.bz2" --no-same-owner --no-same-permissions -C "$destination"
chmod -R a+rX "$destination"
"$destination/runsc" --version

cp -p -- "$config" "$stage/original.json"
python3 - "$stage/original.json" "$stage/daemon.json" "$destination/runsc" <<'PY'
import json, pathlib, sys
source, target, binary = map(pathlib.Path, sys.argv[1:])
if not source.is_file():
    raise SystemExit('La configuración cambió desde la revisión: falta daemon.json.')
data = json.loads(source.read_text())
if not isinstance(data, dict) or not isinstance(data.get('runtimes', {}), dict):
    raise SystemExit('Configuración Docker no admitida.')
runtimes = data.setdefault('runtimes', {})
if 'securetex-runsc' in runtimes:
    raise SystemExit('El runtime ya existe: revisión manual necesaria.')
runtimes['securetex-runsc'] = {'path': str(binary), 'runtimeArgs': ['--platform=systrap', '--network=none']}
target.write_text(json.dumps(data, indent=2) + '\n')
PY
dockerd --validate --config-file "$stage/daemon.json"
[[ ! -e "$backup" ]]
cmp "$stage/original.json" "$config"
cp -p -- "$config" "$backup"
candidate=$(mktemp /etc/docker/.securetex-runtime.XXXXXX)
install -m "$(stat -c %a "$config")" -o root -g root "$stage/daemon.json" "$candidate"
changed=true
mv -- "$candidate" "$config"
systemctl reload docker

docker info --format '{{json .Runtimes}}' | python3 -c 'import json,sys; assert "securetex-runsc" in json.load(sys.stdin), "Docker no registró el runtime"'
snapshot "$stage/after.json"
cmp "$stage/before.json" "$stage/after.json"
echo "Runtime $runtime disponible. Contenedores existentes sin cambios de identidad, arranque o reinicios."
echo "Copia anterior: $backup. Falta probar el compilador ARM64 antes de publicar."
