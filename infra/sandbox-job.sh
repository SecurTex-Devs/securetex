#!/usr/bin/env bash
# Entrada exclusiva de la clave del controlador. Sin contenido ni rutas del usuario.
set -Eeuo pipefail
umask 077
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^sandbox-job\ ([0-9a-f]{40})\ ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$ ]]; then
  echo 'Comando de sandbox rechazado.' >&2
  exit 2
fi
sha=${BASH_REMATCH[1]}
id=${BASH_REMATCH[2]}
label=dev.securetex.app
image="ghcr.io/securtex-devs/securetex-compiler:$sha"
volume="securetex-jobs-$sha"
name="securetex-job-$sha-$id"
[[ $(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$sha" ]]
[[ $(docker image inspect -f "{{index .Config.Labels \"$label\"}}" "$image") == securetex ]]
[[ $(docker volume inspect -f "{{index .Labels \"$label\"}}" "$volume") == securetex ]]
# También se limita el tiempo de espera. No se acumulan compiladores en Oracle.
exec 8>"$HOME/securetex/compile.lock"
flock -w 3 8 || exit 75
cleanup() {
  if [[ $(docker inspect -f "{{index .Config.Labels \"$label\"}}" "$name" 2>/dev/null) == securetex ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
# Solo este subdirectorio entra en gVisor: ni buzón global ni clave de control.
docker run -d --name "$name" --label "$label=securetex" --label dev.securetex.job=true \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true --runtime securetex-runsc --network none --user 1000:1000 \
  --mount "type=volume,source=$volume,target=/jobs,volume-subpath=.sandbox-$id" \
  --tmpfs /work:rw,noexec,nosuid,nodev,size=256m,mode=0700,uid=1000,gid=1000 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m,mode=1777 \
  -e JOBS_DIR=/jobs -e WORK_DIR=/work -e COMPILE_TIMEOUT_MS=30000 -e COMPILE_MAX_PDF_BYTES=16777216 -e COMPILE_CONCURRENCY=1 \
  --memory 1536m --memory-swap 1536m --cpus 1.5 --cpu-shares 128 --pids-limit 64 --ulimit core=0 --ulimit nofile=1024:1024 \
  --log-driver none --no-healthcheck "$image" >/dev/null
# El protocolo funciona también al volver a las tres imágenes anteriores.
# Plazo independiente del trabajador: incluso un worker comprometido desaparece.
deadline=$((SECONDS+38))
while (( SECONDS < deadline )); do
  if docker exec "$name" node -e "const f=require('fs');try{const s=f.lstatSync('/jobs/$id.res');process.exit(s.isFile()?0:2)}catch{process.exit(1)}" >/dev/null 2>&1; then
    cleanup
    trap - EXIT
    exit 0
  fi
  [[ $(docker inspect -f '{{.State.Running}}' "$name") == true ]] || exit 1
  sleep 0.25
done
exit 124
