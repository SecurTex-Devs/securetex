# SecurTex · levanta todo el sistema (base de datos, API, sandbox de LaTeX,
# web y bandeja de correo) con Docker. Solo necesita Docker; Node es opcional.
#
#   .\iniciar.ps1           construye y arranca
#   .\iniciar.ps1 -Parar    detiene los contenedores (los datos se conservan)
#
# Si PowerShell no deja ejecutar scripts:
#   powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
param([switch]$Parar)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if ($Parar) {
  docker compose down
  exit $LASTEXITCODE
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker no está en marcha. Abre Docker Desktop y vuelve a ejecutar este script.' -ForegroundColor Red
  exit 1
}

# 1) Secretos locales en .env: se crean la primera vez y después solo se añaden
#    las claves nuevas (cambiarlas invalidaría los datos cifrados ya guardados).
if (Get-Command node -ErrorAction SilentlyContinue) {
  node infra/generate-env.mjs --add-missing
} else {
  docker run --rm -v "${PWD}:/w" -w /w node:22-bookworm-slim node infra/generate-env.mjs --add-missing
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2) Construir y arrancar.
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$demo = (Select-String -Path .env -Pattern '^SEED_DEMO_PASSWORD=(.*)$').Matches[0].Groups[1].Value
Write-Host ''
Write-Host 'SecurTex está en marcha.' -ForegroundColor Green
Write-Host ''
Write-Host '  Aplicación   http://localhost:3000'
Write-Host '  Correos      http://localhost:8025   (verificación de cuenta, recuperación de contraseña)'
Write-Host '  API          http://localhost:4000/api/docs'
Write-Host ''
Write-Host '  Cuentas de demostración (solo local): ana.torres@securtex.test (administradora),'
Write-Host '  maria.rodriguez@securtex.test, jorge.cardenas@securtex.test, luis.perez@securtex.test'
Write-Host "  Contraseña: $demo"
Write-Host ''
Write-Host '  Detener: .\iniciar.ps1 -Parar'
