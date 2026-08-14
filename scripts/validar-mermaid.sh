#!/usr/bin/env bash
# Extrae todos los bloques ```mermaid de los .md y comprueba que compilan.
# Falla el pipeline si alguno tiene sintaxis inválida.
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

total=0
fallidos=0

while IFS= read -r -d '' archivo; do
  n=0
  bloque=""
  dentro=0
  while IFS= read -r linea; do
    if [[ "$linea" == '```mermaid' ]]; then
      dentro=1; bloque=""; continue
    fi
    if [[ $dentro -eq 1 && "$linea" == '```' ]]; then
      dentro=0; n=$((n+1)); total=$((total+1))
      salida="$TMP/$(basename "$archivo" .md)-$n.mmd"
      printf '%s' "$bloque" > "$salida"
      if ! mmdc -i "$salida" -o "$salida.svg" >/dev/null 2>&1; then
        echo "❌ Diagrama inválido: $archivo (bloque $n)"
        fallidos=$((fallidos+1))
      fi
      continue
    fi
    [[ $dentro -eq 1 ]] && bloque+="$linea"$'\n'
  done < "$archivo"
done < <(find docs -name '*.md' -print0)

echo "Diagramas verificados: $total · fallidos: $fallidos"
[[ $fallidos -eq 0 ]]
</content>
</invoke>
