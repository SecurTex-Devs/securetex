#!/usr/bin/env bash
# Único comando admitido por la clave de GitHub; sin shell ni reenvíos.
set -Eeuo pipefail
umask 077
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  echo 'Solo se admite: deploy <SHA de 40 caracteres>.' >&2
  exit 2
fi
sha=${BASH_REMATCH[1]}
IFS= read -r -t 15 registry_user
IFS= read -r -t 15 registry_token
[[ $registry_user =~ ^[A-Za-z0-9_-]{1,100}$ && $registry_token =~ ^[A-Za-z0-9_]{20,255}$ ]] || exit 2
# Credencial de GITHUB_TOKEN efímera: no se guarda en el .env ni en ~/.docker.
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d /dev/shm/securetex-registry.XXXXXXXX)
trap 'rm -f "$DOCKER_CONFIG/config.json"; rmdir "$DOCKER_CONFIG"' EXIT
printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin >/dev/null 2>&1
unset registry_token
"$HOME/securetex/deploy.sh" "$sha"
