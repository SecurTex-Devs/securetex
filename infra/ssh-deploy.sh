#!/usr/bin/env bash
# Único comando admitido por la clave de GitHub; sin shell ni reenvíos.
set -Eeuo pipefail
umask 077
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  echo 'Solo se admite: deploy <SHA de 40 caracteres>.' >&2
  exit 2
fi
sha=${BASH_REMATCH[1]}
IFS= read -r -t 15 -n 101 registry_user
IFS= read -r -t 15 -n 16385 registry_token
[[ $registry_user =~ ^[A-Za-z0-9_-]{1,100}$ ]] || { echo '[SecureTex] Usuario de GHCR no admitido.' >&2; exit 2; }
# GitHub puede cambiar el formato de GITHUB_TOKEN; Docker comprueba su validez.
(( ${#registry_token} >= 20 && ${#registry_token} <= 16384 )) || { echo '[SecureTex] Credencial de GHCR vacía o demasiado larga.' >&2; exit 2; }
# Credencial de GITHUB_TOKEN efímera: no se guarda en el .env ni en ~/.docker.
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d /dev/shm/securetex-registry.XXXXXXXX)
trap 'rm -f "$DOCKER_CONFIG/config.json"; rmdir "$DOCKER_CONFIG"' EXIT
echo '[SecureTex] Autenticación efímera en GHCR.'
if ! printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin >/dev/null 2>&1; then
  echo '[SecureTex] GHCR rechazó la credencial; revisa packages:read y el acceso del repositorio al paquete.' >&2
  exit 1
fi
unset registry_token
"$HOME/securetex/deploy.sh" "$sha"
