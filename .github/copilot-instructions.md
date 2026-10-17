# Instrucciones para GitHub Copilot

Este repositorio reúne sus instrucciones para asistentes de IA en archivos `AGENTS.md`, y son obligatorias:

- [`AGENTS.md`](../AGENTS.md) en la raíz: qué es SecurTex, dónde está cada cosa, cómo se arranca y las reglas comunes.
- [`backend/AGENTS.md`](../backend/AGENTS.md), [`frontend/AGENTS.md`](../frontend/AGENTS.md) y [`docs/AGENTS.md`](../docs/AGENTS.md): las reglas de cada parte.

Resumen de lo imprescindible:

- Todo en español (interfaz, documentación, commits); los identificadores del código, en inglés.
- SecurTex compila LaTeX de usuarios, es decir, código hostil. Nunca habilites `shell-escape`, nunca concatenes SQL ni pases argumentos por un shell, y nunca descifres antes de verificar el MAC.
- En el frontend: nada de `dangerouslySetInnerHTML` sin DOMPurify, ningún token en `localStorage` ni en la URL, y ningún texto escrito directamente en un componente (todo va en i18n).
- Los tipos de la API se generan del contrato (`pnpm api:sync`); nunca se escriben a mano.
- Ningún secreto en el código ni en git; solo en el `.env` local.
