#!/usr/bin/env bash
# SecurTex · levanta todo el sistema (base de datos, API, sandbox de LaTeX,
# web y bandeja de correo) con Docker. Solo necesita Docker; Node es opcional.
#
#   ./iniciar.sh            construye y arranca
#   ./iniciar.sh --parar    detiene los contenedores (los datos se conservan)
set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" = "--parar" ]; then
  docker compose down
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker no está en marcha. Abre Docker Desktop (o inicia el servicio) y vuelve a ejecutar este script." >&2
  exit 1
fi

# 1) Secretos locales en .env: se crean la primera vez y después solo se añaden
#    las claves nuevas (cambiarlas invalidaría los datos cifrados ya guardados).
if command -v node >/dev/null 2>&1; then
  node infra/generate-env.mjs --add-missing
else
  docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/w" -w /w node:22-bookworm-slim node infra/generate-env.mjs --add-missing
fi

# 2) Construir y arrancar.
docker compose up --build -d

demo=$(grep -E '^SEED_DEMO_PASSWORD=' .env | cut -d= -f2-)
cat <<EOF

SecurTex está en marcha.

  Aplicación   http://localhost:3000
  Correos      http://localhost:8025   (verificación de cuenta, recuperación de contraseña)
  API          http://localhost:4000/api/docs

  Cuentas de demostración (solo local): ana.torres@securtex.test (administradora),
  maria.rodriguez@securtex.test, jorge.cardenas@securtex.test, luis.perez@securtex.test
  Contraseña: ${demo}

  Detener: ./iniciar.sh --parar
EOF
