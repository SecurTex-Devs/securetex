#!/usr/bin/env bash
# Crea los roles de aplicación con LOGIN. Se ejecuta una sola vez, al crear el
# volumen de PostgreSQL. Las contraseñas llegan por variables de entorno y
# nunca se escriben en el repositorio.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v identity_pw="$DB_IDENTITY_PASSWORD" \
  -v app_pw="$DB_APP_PASSWORD" \
  -v audit_pw="$DB_AUDIT_PASSWORD" <<'SQL'
CREATE ROLE securtex_identity LOGIN PASSWORD :'identity_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE securtex_app      LOGIN PASSWORD :'app_pw'      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE securtex_audit    LOGIN PASSWORD :'audit_pw'    NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
SQL
