# SecurTex

Editor LaTeX colaborativo y seguro, al estilo de Overleaf: edición en tiempo real cifrada de extremo a extremo, compilación real en un sandbox sin red, PDF firmado y todos los datos de la base cifrados.

> Proyecto final de la asignatura *Seguridad de Software* · Universidad Técnica de Ambato

---

## Arrancar todo con un solo comando

**Requisito único:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (o Docker Engine con Compose v2) en marcha. Node.js es opcional.

```powershell
# Windows (PowerShell)
git clone https://github.com/SecurTex-Devs/securetex.git
cd securetex
.\iniciar.ps1
```

```bash
# Linux / macOS
git clone https://github.com/SecurTex-Devs/securetex.git
cd securetex
./iniciar.sh
```

El script genera la primera vez un `.env` con secretos aleatorios, que nunca se versiona. Después construye las imágenes y levanta los seis servicios. La primera vez tarda varios minutos, porque descarga TeX Live para el sandbox; las siguientes es casi inmediato.

| Qué | Dónde |
|---|---|
| Aplicación | http://localhost:3000 |
| Correos enviados (verificación, recuperación) | http://localhost:8025 |
| API (Swagger, solo en desarrollo) | http://localhost:4000/api/docs |

**Cuentas de demostración** (solo local): `ana.torres@securtex.test` (administradora), `maria.rodriguez@securtex.test`, `jorge.cardenas@securtex.test` y `luis.perez@securtex.test`. Las cuatro comparten la contraseña que el script muestra al terminar, que es `SEED_DEMO_PASSWORD` en el `.env`.

| Tarea | Comando |
|---|---|
| Detener (los datos se conservan) | `.\iniciar.ps1 -Parar` · `./iniciar.sh --parar` |
| Ver los registros | `docker compose logs -f api web` |
| Empezar de cero (borra la base) | `docker compose down -v` |
| A mano, sin el script | `node infra/generate-env.mjs` y luego `docker compose up --build -d` |

> **No borres ni regeneres el `.env`** si quieres conservar tus proyectos: sus claves cifran los datos guardados. Con otras claves, lo guardado no se puede descifrar.

### Usarlo desde otros equipos de la red local

En el `.env`, pon `PUBLISH_HOST=0.0.0.0` y `APP_ORIGIN=http://<IP-de-este-equipo>:3000,http://localhost:3000`. Después ejecuta `docker compose up -d` y permite en el cortafuegos los puertos 3000 y 4000. Los detalles están en [backend/README.md](backend/README.md#estado-de-esta-entrega).

### Inicio de sesión con Google o Microsoft (opcional)

Es gratis. Basta con registrar la aplicación en cada proveedor y copiar el ID y el secreto al `.env`. Los pasos están en [backend/README.md](backend/README.md).

---

## Qué hay en el repositorio

| Carpeta | Contenido |
|---|---|
| [`backend/`](backend/) | API REST (NestJS + Fastify), colaboración Yjs cifrada, orquestador y sandbox de compilación LaTeX, PostgreSQL con RLS |
| [`frontend/`](frontend/) | Aplicación web (Next.js 15): editor CodeMirror, visor PDF, sistema de diseño y el prototipo de las 50 pantallas |
| [`docs/`](docs/) | Análisis, requisitos, arquitectura, seguridad, criptografía multicapa, modelo de datos, UML, plan y ADR (MkDocs) |
| `docker-compose.yml` | Toda la pila: `postgres`, `migrate`, `compiler`, `api`, `web` y `mailpit` |
| `infra/` | Generador de secretos locales y el script de roles de PostgreSQL |

Los tres proyectos venían de repositorios separados y conservan todo su historial de git.

| Si eres… | Abre |
|---|---|
| Nuevo en el proyecto | [`docs/docs/index.md`](docs/docs/index.md) |
| Docente o evaluador | [`docs/docs/index.md`](docs/docs/index.md) → documentos 01, 02, 05, 14 y 16 |
| Quieres ver el diseño sin instalar nada | [`frontend/Docs/mockups/index.html`](frontend/Docs/mockups/index.html) |
| Vas a trabajar en el backend | [`backend/AGENTS.md`](backend/AGENTS.md) |
| Vas a trabajar en el frontend | [`frontend/AGENTS.md`](frontend/AGENTS.md) |

---

## Desarrollo

```bash
# Pruebas del backend
cd backend && pnpm install && pnpm test
# Suite de seguridad (casos de abuso) contra la pila levantada
cd backend/apps/api && node --test test/security/<archivo>.test.mjs

# Tras cambiar endpoints: regenerar el contrato y los tipos del frontend
cd backend && pnpm contracts:generate
cd frontend && pnpm api:sync
```

Ramas `feat/`, `fix/`, `sec/`, `a11y/`, `docs/` y `chore/`. A `main` solo se llega por *pull request*. El hook local que bloquea el *push* directo a `main` se activa una vez con:

```bash
git config core.hooksPath .githooks
```

Los commits se escriben en español y son modulares (`feat(editor): …`, `fix(api): …`, `sec(compilador): …`).
