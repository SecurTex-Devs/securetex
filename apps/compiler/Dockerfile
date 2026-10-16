# syntax=docker/dockerfile:1
# Sandbox de compilación de SecurTex (Zona 4). Se construye desde la raíz:
#   docker build -f apps/compiler/Dockerfile .
#
# TeX Live de Debian con solo lo que usan las plantillas (sin texlive-full):
# pdflatex, xelatex, lualatex, bibtex, babel en español, beamer, hyperref,
# listings, booktabs, geometry, amsmath, fuentes Latin Modern y cm-super
# (Type 1: nunca hace falta generar fuentes de mapa de bits con mktexpk).
# No hay compiladores, ni curl, ni wget, ni intérpretes aparte de Node (el
# trabajador) y Lua (dentro de LuaTeX, sin shell-escape).
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      texlive-latex-base texlive-latex-recommended texlive-pictures \
      texlive-fonts-recommended texlive-lang-spanish \
      texlive-xetex texlive-luatex lmodern fonts-lmodern fontconfig cm-super \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man /usr/share/texlive/texmf-dist/doc

# Endurecimiento en texmf.cnf (AGENTS.md §3.3). El trabajador además fija los
# mismos valores en el entorno de cada proceso, que kpathsea antepone a
# texmf.cnf: aunque alguien cambie este archivo, no se relaja nada.
#   shell_escape=f   \write18 y \input|"…" deshabilitados
#   openin_any=p     ni rutas absolutas, ni «..», ni archivos ocultos al leer
#   openout_any=p    lo mismo al escribir
COPY apps/compiler/texmf-securtex.cnf /tmp/texmf-securtex.cnf
RUN cat /tmp/texmf-securtex.cnf >> /etc/texmf/web2c/texmf.cnf \
 && rm /tmp/texmf-securtex.cnf \
 # La construcción falla si la configuración efectiva no es la esperada.
 && test "$(kpsewhich -var-value shell_escape)" = "f" \
 && test "$(kpsewhich -var-value openin_any)" = "p" \
 && test "$(kpsewhich -var-value openout_any)" = "p"

# Cachés precalculadas en tiempo de construcción (como root, en
# /var/lib/texmf): la base de nombres de luaotfload y la de fontconfig. En
# ejecución son de solo lectura; cada trabajo escribe en su propia caché
# efímera, que se borra con él.
COPY apps/compiler/warmup.tex /tmp/warmup/warmup.tex
RUN fc-cache -f \
 && cd /tmp/warmup \
 && lualatex -no-shell-escape -interaction=nonstopmode warmup.tex >/dev/null \
 && xelatex -no-shell-escape -interaction=nonstopmode warmup.tex >/dev/null \
 && cd / && rm -rf /tmp/warmup \
 && test -d /var/lib/texmf/luatex-cache/generic/names

COPY --chown=root:root apps/compiler/worker.mjs /opt/compiler/worker.mjs

# Nunca como root: el usuario `node` (uid 1000) no tiene sudo ni capacidades.
USER node
WORKDIR /work
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD ["node", "-e", "const s=require('fs').statSync('/tmp/compiler-alive');process.exit(Date.now()-s.mtimeMs<15000?0:1)"]
CMD ["node", "--disallow-code-generation-from-strings", "/opt/compiler/worker.mjs"]
