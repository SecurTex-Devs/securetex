#!/usr/bin/env bash
# Solo contenedores, redes, volúmenes e imágenes etiquetados como SecureTex.
set -Eeuo pipefail
umask 077
root="$HOME/securetex"
cd "$root"
[[ $# -ge 1 && $# -le 2 && $1 =~ ^[0-9a-f]{40}$ ]] || { echo 'Uso: deploy.sh <SHA de 40 caracteres> [--local-images]' >&2; exit 2; }
sha=$1
local_images=false
if [[ $# == 2 ]]; then [[ $2 == --local-images ]] || exit 2; local_images=true; fi
[[ $(stat -c %a .env) == 600 && ! -L .env ]] || { echo '.env debe ser un archivo con permisos 600.' >&2; exit 1; }
exec 9>deploy.lock
flock -n 9 || { echo 'Ya hay un despliegue de SecureTex en curso.' >&2; exit 1; }
set -a
source .env
set +a
label=dev.securetex.app
repository=ghcr.io/securtex-devs/securetex
postgres='postgres:17-bookworm@sha256:1eff563f6c868b9b433566e9f3cf6e5c79fbd3b95bf70ec7277d376cdbfc50d7'
nginx='nginx:stable-alpine@sha256:8eb04fe3b385090e9aa02961f77398ad09b6bf33ab07f6669a5bb7acce22c0d3'
cloudflared='cloudflare/cloudflared@sha256:55c7e3e8d89d5e8d20b75a82f3602cbf98e06db406e73e282073cfdc5a9a3af6'
api="$repository-api:$sha"
web="$repository-web:$sha"
compiler="$repository-compiler:$sha"
api_name="securetex-api-$sha"
web_name="securetex-web-$sha"
compiler_name="securetex-compiler-$sha"
job_volume="securetex-jobs-$sha"
common=(--label "$label=securetex" --log-opt max-size=10m --log-opt max-file=3 --cpu-shares 128)
harden=(--read-only --cap-drop ALL --security-opt no-new-privileges:true)
api_env=()
for name in NODE_ENV PORT APP_ORIGIN TRUST_PROXY COOKIE_SECURE REGISTRATION_ENABLED DEMO_ENABLED API_DOCS_ENABLED \
  DATABASE_URL_IDENTITY DATABASE_URL_APP DATABASE_URL_AUDIT JWT_PRIVATE_KEY MFA_ENCRYPTION_KEY FILES_MASTER_KEY \
  TRANSPORT_PRIVATE_KEY DATA_MASTER_KEY COMPILER_SIGNING_KEY COMPILE_JOBS_DIR COMPILE_TIMEOUT_MS \
  SMTP_HOST SMTP_PORT MAIL_FROM HIBP_ENABLED GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET MICROSOFT_TENANT; do
  api_env+=(-e "$name")
done
previous=$(cat current 2>/dev/null || true)
[[ -z "$previous" || $previous =~ ^[0-9a-f]{40}$ ]] || exit 1
step=preparación
switched=false
old_stopped=false
mkdir -p gateway/releases backups releases ops
chmod 755 gateway gateway/releases
python3 infra/check-neighbors.py --capture ops/neighbors-before-deploy.json

say() { step=$1; echo "[SecureTex] $step"; }
owned() { [[ $(docker inspect -f "{{index .Config.Labels \"$label\"}}" "$1" 2>/dev/null) == securetex ]]; }
remove() {
  if docker container inspect "$1" >/dev/null 2>&1; then
    owned "$1" || { echo "Nombre ocupado por un contenedor ajeno: $1" >&2; return 1; }
    if [[ $1 == securetex-api-* ]]; then docker stop --time 45 "$1" >/dev/null; fi
    docker rm -f "$1" >/dev/null
  fi
}
wait_health() {
  local i status
  for ((i=0;i<60;i++)); do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1")
    [[ $status == healthy ]] && return 0
    [[ $status == exited || $status == dead ]] && return 1
    sleep 2
  done
  echo "No superó la sonda de salud: $1" >&2
  return 1
}
check_api() {
  docker exec "$1" node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(async r=>{const h=await r.json();if(!r.ok||h.status!=='ok'||h.database!==true)process.exit(1)}).catch(()=>process.exit(1))"
}
config_for() {
  sed -e "s/__SHA__/$1/g" -e "s/__API__/securetex-api-$1/g" -e "s/__WEB__/securetex-web-$1/g" \
    infra/gateway.conf.template >"gateway/releases/$1.conf"
  chmod 644 "gateway/releases/$1.conf"
}
activate() {
  cp "gateway/releases/$1.conf" gateway/active.next
  chmod 644 gateway/active.next
  mv gateway/active.next gateway/active.conf
  docker exec securetex-gateway nginx -s reload -c /etc/securetex/active.conf
}
reset_worker() {
  remove securetex-demo-reset
  docker run -d --name securetex-demo-reset "${common[@]}" "${harden[@]}" --network securetex-app \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m --memory 192m --memory-swap 192m --cpus 0.1 --pids-limit 32 \
    --restart unless-stopped --no-healthcheck "${api_env[@]}" "$repository-api:$1" node dist/scripts/seed-demo.js --watch >/dev/null
}
rollback() {
  local status=$?
  trap - ERR
  echo "[SecureTex] ERROR en $step (código $status)." >&2
  if [[ -n "$previous" ]] && $switched && owned "$api_name"; then
    docker stop --time 45 "$api_name" >/dev/null || true
  fi
  if [[ -n "$previous" ]] && $old_stopped; then
    docker start "securetex-api-$previous" >/dev/null || true
    wait_health "securetex-api-$previous" || true
  fi
  if [[ -n "$previous" ]] && $switched; then
    activate "$previous" || echo 'Revisa el gateway de SecureTex.' >&2
    reset_worker "$previous" || true
    printf '%s\n' "$previous" >current.next
    mv current.next current
    if check_api "securetex-api-$previous"; then
      echo "[SecureTex] Reversión comprobada: API y base de datos disponibles ($previous)."
    else
      echo '[SecureTex] ERROR: la versión anterior necesita revisión.' >&2
    fi
  fi
  if [[ "$sha" != "$previous" ]]; then
    remove "$api_name" || true
    remove "$web_name" || true
    remove "$compiler_name" || true
  fi
  python3 infra/check-neighbors.py --check ops/neighbors-before-deploy.json || true
  exit "$status"
}
trap rollback ERR

say 'imágenes ARM64'
docker info --format '{{json .Runtimes}}' | python3 -c 'import json,sys; assert "securetex-runsc" in json.load(sys.stdin), "Falta gVisor"'
for image in "$api" "$web" "$compiler"; do
  if ! $local_images; then docker pull --platform linux/arm64 "$image" >/dev/null; fi
  [[ $(docker image inspect --format '{{.Architecture}}' "$image") == arm64 ]]
  if ! $local_images; then
    [[ $(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$sha" ]]
  fi
done
for image in "$postgres" "$nginx" "$cloudflared"; do docker pull --platform linux/arm64 "$image" >/dev/null; done
for network in securetex-app securetex-edge; do
  if docker network inspect "$network" >/dev/null 2>&1; then
    [[ $(docker network inspect -f "{{index .Labels \"$label\"}}" "$network") == securetex ]]
  elif [[ $network == securetex-app ]]; then
    docker network create --internal --label "$label=securetex" "$network" >/dev/null
  else
    docker network create --label "$label=securetex" "$network" >/dev/null
  fi
done
if ! docker volume inspect securetex-pgdata >/dev/null 2>&1; then
  docker volume create --label "$label=securetex" securetex-pgdata >/dev/null
fi
[[ $(docker volume inspect -f "{{index .Labels \"$label\"}}" securetex-pgdata) == securetex ]]

say 'base de datos'
if ! docker container inspect securetex-postgres >/dev/null 2>&1; then
  docker run --rm --network none "${common[@]}" --read-only --cap-drop ALL --cap-add CHOWN --cap-add FOWNER \
    --security-opt no-new-privileges:true --memory 64m --cpus 0.1 --pids-limit 16 \
    --mount type=volume,source=securetex-pgdata,target=/var/lib/postgresql/data --entrypoint sh "$postgres" \
    -c 'chmod 700 /var/lib/postgresql/data && chown postgres:postgres /var/lib/postgresql/data'
  docker run -d --name securetex-postgres "${common[@]}" "${harden[@]}" --user postgres:postgres --network securetex-app \
    --mount type=volume,source=securetex-pgdata,target=/var/lib/postgresql/data \
    --mount "type=bind,source=$root/infra/postgres/01-roles.sh,target=/docker-entrypoint-initdb.d/01-roles.sh,readonly" \
    --tmpfs /var/run/postgresql:rw,nosuid,nodev,noexec,mode=1777 --tmpfs /tmp:rw,nosuid,nodev,noexec,size=16m \
    -e POSTGRES_USER -e POSTGRES_DB -e POSTGRES_PASSWORD -e DB_IDENTITY_PASSWORD -e DB_APP_PASSWORD -e DB_AUDIT_PASSWORD \
    --memory 1g --memory-swap 1g --cpus 0.5 --pids-limit 128 --restart unless-stopped \
    --health-cmd 'pg_isready -h 127.0.0.1 -U securtex_owner -d securtex' --health-interval 3s --health-timeout 3s --health-retries 40 "$postgres" >/dev/null
else
  owned securetex-postgres
fi
wait_health securetex-postgres

say 'compatibilidad de migraciones para poder revertir'
docker run --rm -i "${common[@]}" "${harden[@]}" --network none --memory 128m --cpus 0.25 --pids-limit 32 \
  --mount "type=bind,source=$root/infra/migrations-approved.json,target=/approved.json,readonly" \
  "$api" node --input-type=module - /repo/apps/api/prisma/migrations /approved.json <infra/check-migrations.mjs

say 'copia y migraciones'
if [[ ! -s "backups/$sha.dump" ]]; then
  docker exec securetex-postgres pg_dump -U securtex_owner -d securtex --format custom --no-owner --no-acl >"backups/$sha.dump.next"
  mv "backups/$sha.dump.next" "backups/$sha.dump"
fi
docker run --rm --name "securetex-migrate-$sha" "${common[@]}" "${harden[@]}" --network securetex-app \
  --tmpfs /tmp:rw,nosuid,nodev,size=32m --memory 384m --memory-swap 384m --cpus 0.5 --pids-limit 64 \
  -e DATABASE_URL "$api" pnpm exec prisma migrate deploy

say 'candidata aislada'
if [[ $sha == "$previous" ]]; then echo 'La versión ya está activa.'; exit 0; fi
for name in "$api_name" "$web_name" "$compiler_name"; do remove "$name"; done
if ! docker volume inspect "$job_volume" >/dev/null 2>&1; then
  docker volume create --label "$label=securetex" --driver local --opt type=tmpfs --opt device=tmpfs \
    --opt o=size=128m,uid=1000,gid=1000,mode=0700,noexec,nosuid,nodev "$job_volume" >/dev/null
fi
[[ $(docker volume inspect -f "{{index .Labels \"$label\"}}" "$job_volume") == securetex ]]
docker run -d --name "$compiler_name" "${common[@]}" "${harden[@]}" --runtime securetex-runsc --network none --user 1000:1000 \
  --mount "type=volume,source=$job_volume,target=/jobs" --tmpfs /work:rw,noexec,nosuid,nodev,size=256m,mode=0700,uid=1000,gid=1000 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m,mode=1777 -e JOBS_DIR=/jobs -e WORK_DIR=/work \
  -e COMPILE_TIMEOUT_MS=30000 -e COMPILE_MAX_PDF_BYTES=16777216 -e COMPILE_CONCURRENCY=1 \
  --memory 1536m --memory-swap 1536m --cpus 1.5 --pids-limit 64 --ulimit core=0 --ulimit nofile=1024:1024 \
  --restart unless-stopped "$compiler" >/dev/null
wait_health "$compiler_name"
docker run -d --name "$api_name" "${common[@]}" "${harden[@]}" --network securetex-app \
  --mount "type=volume,source=$job_volume,target=/jobs" --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
  "${api_env[@]}" --memory 512m --memory-swap 512m --cpus 0.75 --pids-limit 128 --stop-timeout 45 --restart unless-stopped "$api" >/dev/null
wait_health "$api_name"
check_api "$api_name"
docker run --rm --name "securetex-seed-$sha" "${common[@]}" "${harden[@]}" --network securetex-app \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m "${api_env[@]}" --memory 192m --memory-swap 192m --cpus 0.25 --pids-limit 32 \
  "$api" node dist/scripts/seed-demo.js
docker run -d --name "$web_name" "${common[@]}" "${harden[@]}" --network securetex-app \
  -e "API_INTERNAL_URL=http://$api_name:4000" -e COLLAB_PUBLIC_PORT=443 \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=32m --tmpfs /app/.next/cache:rw,nosuid,nodev,size=32m,uid=1000,gid=1000 \
  --memory 384m --memory-swap 384m --cpus 0.5 --pids-limit 128 --restart unless-stopped "$web" >/dev/null
wait_health "$web_name"
say 'prueba funcional de la candidata'
smoke_flags=()
if [[ -z "$previous" ]]; then smoke_flags+=(--compile); fi
docker exec -i "$api_name" node --input-type=module - "${smoke_flags[@]}" <infra/smoke.mjs
config_for "$sha"

say 'cambio de versión'
if [[ -z "$previous" ]]; then remove securetex-gateway; fi
if docker container inspect securetex-gateway >/dev/null 2>&1; then
  owned securetex-gateway
  docker exec securetex-gateway nginx -t -c "/etc/securetex/releases/$sha.conf"
  if [[ -n "$previous" ]]; then
    owned "securetex-api-$previous"
    old_stopped=true
    docker stop --time 45 "securetex-api-$previous" >/dev/null
  fi
  switched=true
  activate "$sha"
else
  cp "gateway/releases/$sha.conf" gateway/active.conf
  chmod 644 gateway/active.conf
  docker run -d --name securetex-gateway "${common[@]}" "${harden[@]}" --user 101:101 --network securetex-app \
    --mount "type=bind,source=$root/gateway,target=/etc/securetex,readonly" --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777 \
    --memory 64m --memory-swap 64m --cpus 0.1 --pids-limit 32 --restart unless-stopped \
    --entrypoint nginx "$nginx" -c /etc/securetex/active.conf -g 'daemon off;' >/dev/null
  docker network connect securetex-edge securetex-gateway
fi
reset_worker "$sha"
say 'salud después del cambio'
check_api "$api_name"
docker exec "$web_name" node -e "(async()=>{for(let i=0;i<10;i++){try{const r=await fetch('http://securetex-gateway:8080/health',{signal:AbortSignal.timeout(3000)});const h=await r.json();if(r.ok&&h.status==='ok'&&h.database===true)return}catch{}await new Promise(r=>setTimeout(r,1000))}process.exit(1)})()"
docker exec "$web_name" node -e "fetch('http://securetex-gateway:8080/').then(async r=>{if(!r.ok||r.headers.get('x-securetex-revision')!=='$sha'||!(await r.text()).includes('Probar la demo'))process.exit(1)}).catch(()=>process.exit(1))"
say 'túnel propio'
if ! docker container inspect securetex-tunnel >/dev/null 2>&1; then
  docker run -d --name securetex-tunnel "${common[@]}" "${harden[@]}" --network securetex-edge -e TUNNEL_TOKEN \
    --memory 128m --memory-swap 128m --cpus 0.1 --pids-limit 64 --restart unless-stopped "$cloudflared" tunnel --no-autoupdate run >/dev/null
else
  owned securetex-tunnel
fi
printf '%s\n' "$sha" >current.next
python3 infra/check-neighbors.py --check ops/neighbors-before-deploy.json
mv current.next current
printf '%s\n' "$sha" >"releases/$sha"
# Tras confirmar salud, la limpieza es secundaria: un fallo no debe cortar la web.
trap - ERR
say 'conservación de tres versiones'
mapfile -t retained < <(find releases -maxdepth 1 -type f -printf '%T@ %f\n' | sort -rn | head -3 | cut -d' ' -f2)
for component in api web compiler; do
  while read -r tag; do
    [[ $tag =~ ^[0-9a-f]{40}$ ]] || continue
    [[ " ${retained[*]} " == *" $tag "* ]] && continue
    name="securetex-$component-$tag"
    if docker container inspect "$name" >/dev/null 2>&1; then
      remove "$name" || { echo "[SecureTex] No se pudo retirar $name." >&2; continue; }
    fi
    docker image rm "$repository-$component:$tag" >/dev/null || echo "[SecureTex] Imagen antigua pendiente: $component:$tag" >&2
  done < <(docker image ls "$repository-$component" --format '{{.Tag}}')
done
for marker in releases/*; do
  tag=${marker##*/}
  [[ $tag =~ ^[0-9a-f]{40}$ ]] || continue
  [[ " ${retained[*]} " == *" $tag "* ]] && continue
  if docker volume inspect "securetex-jobs-$tag" >/dev/null 2>&1; then
    [[ $(docker volume inspect -f "{{index .Labels \"$label\"}}" "securetex-jobs-$tag") == securetex ]] && \
      docker volume rm "securetex-jobs-$tag" >/dev/null || echo '[SecureTex] Volumen antiguo aún en uso.' >&2
  fi
  rm -f -- "$marker" "backups/$tag.dump" "gateway/releases/$tag.conf"
done
for name in $(docker ps -a --filter "label=$label=securetex" --format '{{.Names}}'); do
  if [[ $name =~ ^securetex-(api|web|compiler)-([0-9a-f]{40})$ && ${BASH_REMATCH[2]} != "$sha" ]]; then
    remove "$name" || echo "[SecureTex] Contenedor anterior pendiente: $name" >&2
  fi
done
echo "[SecureTex] Versión activa: $sha"
