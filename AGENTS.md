# AGENTS.md — SecurTex (raíz del repositorio)

> Instrucciones para cualquier asistente de IA (Codex, Claude Code, Cursor, Copilot, Gemini…) y para las personas que trabajen aquí.
> Cada carpeta tiene además su propio `AGENTS.md` con reglas específicas, y **esas reglas son obligatorias**:
> [`backend/AGENTS.md`](backend/AGENTS.md) · [`frontend/AGENTS.md`](frontend/AGENTS.md) · [`docs/AGENTS.md`](docs/AGENTS.md).
> Lee primero este archivo y después el de la carpeta que vayas a tocar.

---

## 1. Qué es

SecurTex es un editor LaTeX colaborativo al estilo de Overleaf, construido con la seguridad como requisito principal:

- **Colaboración en tiempo real cifrada:** Yjs sobre WebSocket, con cifrado de extremo a extremo.
- **Compilación real en un sandbox:** sin red y de solo lectura.
- **PDF firmado con Ed25519.**
- **Todos los datos de la base cifrados:** por columnas, con índices ciegos.

Es el proyecto final de *Seguridad de Software* (Universidad Técnica de Ambato). Todo se escribe en **español**: interfaz, documentación y commits. Los identificadores del código van en **inglés**.

---

## 2. Dónde está cada cosa

```
securetex/
├── docker-compose.yml      Toda la pila: postgres, migrate, compiler, api, web, mailpit
├── .env.example            Variables de la pila (cp .env.example .env); el .env NUNCA se versiona
├── infra/postgres/         Creación de los roles de PostgreSQL de mínimo privilegio
│
├── backend/                Workspace pnpm con dos aplicaciones
│   ├── apps/api/           API NestJS + Fastify (servicio «api» y «migrate»)
│   │   ├── src/domain/          Objetos de valor, errores, constantes. Sin dependencias
│   │   ├── src/application/     Casos de uso por área: auth, projects, files, collab, compile, admin…
│   │   ├── src/infrastructure/  db (Prisma), security (criptografía), mail, compiler (orquestador)
│   │   ├── src/presentation/    http (controladores REST) y ws (colaboración)
│   │   ├── prisma/              schema.prisma y migraciones SQL (RLS forzada)
│   │   └── test/                unit/ (vitest) y security/ (casos de abuso contra la pila levantada)
│   ├── apps/compiler/      Sandbox de LaTeX (servicio «compiler»): worker.mjs + texmf endurecido
│   ├── contracts/          openapi.json generado desde el código (contrato de la API)
│   └── Docs/               Documentación técnica del backend
│
├── frontend/               Aplicación Next.js 15 (servicio «web»)
│   ├── app/                Rutas (App Router): (auth), (app)/proyectos, proyecto/[id] (editor), ajustes, admin
│   ├── src/features/       Módulos por dominio: editor, projects, auth, settings, admin, templates
│   ├── src/shared/         api (cliente generado), crypto (C1/C2/C5), ui (sistema de diseño), i18n, security
│   ├── contracts/          Copia del contrato del backend (pnpm api:sync)
│   └── Docs/               Documentación del frontend y prototipo de 50 pantallas (Docs/mockups/index.html)
│
└── docs/                   Documentación del proyecto (MkDocs): requisitos, arquitectura, seguridad, ADR
    └── docs/               Los documentos 01 a 17 y adr/
```

Rutas que se buscan a menudo:

| Busco… | Está en |
|---|---|
| Un endpoint REST | `backend/apps/api/src/presentation/http/*.controller.ts` |
| La lógica de un endpoint | `backend/apps/api/src/application/<área>/` |
| Primitivas criptográficas del servidor (C2, C3, C3c, C4, C4b) | `backend/apps/api/src/infrastructure/security/` |
| Criptografía del navegador (C1, C2, C5) | `frontend/src/shared/crypto/` |
| Colaboración (servidor / cliente) | `backend/apps/api/src/application/collab/` · `frontend/src/features/editor/collab.ts` |
| Compilación (orquestador / sandbox) | `backend/apps/api/src/application/compile/` · `backend/apps/compiler/worker.mjs` |
| Tablas, RLS y migraciones | `backend/apps/api/prisma/` |
| El editor (CodeMirror, visor PDF, SyncTeX) | `frontend/src/features/editor/` |
| Textos de la interfaz | `frontend/src/shared/i18n/es/` |
| Constantes y límites | `backend/apps/api/src/domain/constants.ts` |

---

## 3. Arrancar y comprobar

```bash
cp .env.example .env               # rellena los secretos (cada uno trae el comando que lo genera)
docker compose up --build -d       # http://localhost:3000 · correos en http://localhost:8025
```

Comandos que existen hoy (los `AGENTS.md` de cada carpeta mencionan además herramientas previstas que aún no están configuradas):

| Dónde | Comando | Qué hace |
|---|---|---|
| `backend/` | `pnpm install && pnpm test` | Pruebas unitarias (vitest) |
| `backend/apps/api/` | `pnpm typecheck` | TypeScript estricto |
| `backend/apps/api/` | `node --test test/security/<archivo>.test.mjs` | Casos de abuso contra la pila levantada; mejor de archivo en archivo |
| `backend/` | `pnpm contracts:generate` | Regenera `contracts/openapi.json` |
| `frontend/` | `pnpm install && pnpm typecheck` | Genera los tipos del contrato y comprueba TypeScript |
| `frontend/` | `pnpm api:sync` | Copia el contrato del backend y regenera los tipos (nunca se escriben a mano) |
| raíz | `docker compose up -d --build api web` | Reconstruye y reinicia tras un cambio |

Antes de dar un cambio por terminado: compila (`typecheck`), pasan las pruebas de lo que tocaste y lo has visto funcionar en la aplicación levantada.

---

## 4. Reglas comunes a todo el repositorio

1. **Seguridad primero.** SecurTex ejecuta LaTeX de usuarios, es decir, código hostil. Si dudas de si algo compromete la seguridad, asume que sí y pregunta. Las prohibiciones absolutas de `backend/AGENTS.md §1` y `frontend/AGENTS.md §1` no tienen excepciones.
2. **Secretos:** nunca en el código, en las pruebas, en los registros ni en git. Solo en el `.env` local. `.env.example` lleva los nombres, nunca valores reales.
3. **Un cambio de API toca los dos lados en el mismo PR:** `pnpm contracts:generate` en `backend/` y `pnpm api:sync` en `frontend/`.
4. **Commits en español, modulares**, con prefijo: `feat`, `fix`, `sec`, `a11y`, `perf`, `refactor`, `test`, `docs`, `chore`, y el área entre paréntesis (`feat(editor): …`, `sec(compilador): …`).
5. **Ramas:** `main` es la versión estable y `develop` la de integración. El trabajo se hace en ramas `feat/`, `fix/`, `sec/`, `a11y/`, `docs/` o `chore/` que salen de `develop` y vuelven a ella; también se puede subir directamente a `develop`. **Nunca se hace *push* a `main`**: a `main` solo llega `develop` por *pull request*. El hook se activa con `git config core.hooksPath .githooks`.
6. **No inventes valores.** Si falta un dato (un límite, una versión), márcalo como `⚠️ POR DEFINIR`.
7. **Fuera del alcance de esta entrega** (no los implementes sin que se pida): chat, comentarios, control de cambios, modo confidencial, importar desde .zip o GitHub.

---

## 5. Estado real frente a la arquitectura objetivo

La documentación (`docs/` y los `Docs/` de cada carpeta) describe la **arquitectura objetivo**. Lo implementado es una versión más compacta:

| Documentado como objetivo | Implementado hoy |
|---|---|
| Microservicios (`auth-service`, `compile-orchestrator`…) | Una sola API modular (`backend/apps/api`) + el sandbox (`backend/apps/compiler`) |
| `packages/security` | `backend/apps/api/src/infrastructure/security/` |
| gVisor (`runsc`) | `runc` endurecido (sin red, solo lectura, sin capacidades); `runsc` con `COMPILER_RUNTIME=runsc` donde exista |
| Vault, Redis, MinIO, Keycloak | Claves maestras en el `.env`, archivos cifrados en PostgreSQL, autenticación propia + OIDC |
| ClamAV para las subidas | Validación por firma binaria (PNG, JPG, PDF); sin antivirus (riesgo residual documentado) |

Si una regla de un `AGENTS.md` nombra una ruta o una herramienta que no existe, aplica la intención de la regla en su equivalente real de esta tabla.
