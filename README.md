# securtex-backend

Backend de **SecurTex**, editor LaTeX colaborativo seguro: API REST, servicios de dominio, colaboración en tiempo real y orquestador de compilación aislada.

> Proyecto final de la asignatura *Seguridad de Software* · Universidad Técnica de Ambato
> **Estado: primera entrega funcional.** Lo implementado y lo que queda fuera está en [Estado de esta entrega](#estado-de-esta-entrega); el resto del documento describe la arquitectura objetivo.

---

## Estado de esta entrega

### Arrancar todo con Docker

```bash
node infra/generate-env.mjs        # crea infra/.env con secretos aleatorios (gitignored)
docker compose -f infra/docker-compose.yml up --build -d
```

| Servicio | URL | Nota |
|---|---|---|
| Aplicación web | http://localhost:3000 | Imagen de `../securtex-frontend` |
| API + documentación | http://localhost:4000/api/docs | OpenAPI generado desde el código |
| Correo de pruebas (Mailpit) | http://localhost:8025 | Enlaces de verificación y recuperación |

El servicio `migrate` aplica las migraciones y siembra el escenario sintético: 4 usuarios `*@securtex.test` (Ana Torres es administradora) y 6 proyectos con sus archivos ya cifrados. La contraseña de esas cuentas es `SEED_DEMO_PASSWORD` de `infra/.env`. Es el único servicio con las credenciales del propietario de la base de datos; la API se conecta con tres roles de mínimo privilegio. Para empezar de cero: `docker compose -f infra/docker-compose.yml down -v`.

### Implementado

| Área | Qué hay |
|---|---|
| Identidad | Registro con verificación por correo, Argon2id + comprobación HIBP (k-anonimato), bloqueo por cuenta, recuperación de contraseña, OIDC (Google/Microsoft con PKCE, sin vincular por correo), TOTP con códigos de recuperación y antirreplay, reautenticación para acciones sensibles |
| Sesiones | JWT Ed25519 de 10 min en cookie, refresh opaco rotatorio con detección de reutilización (revoca la familia), CSRF por Origin + token sincronizado, sesiones visibles y revocables |
| Autorización | Guard global que deniega por defecto (`@Policy`), matriz de roles owner/editor/reviewer/viewer, 404 uniforme para no miembros y **Row Level Security forzada** en PostgreSQL |
| Proyectos | Crear (en blanco o desde plantilla), renombrar, archivar, papelera, borrado definitivo, invitaciones por correo, cambio de rol, revocación, etiquetas privadas |
| **Archivos cifrados (C3 + C4)** | Cada guardado se cifra con AES-256-GCM y una DEK nueva envuelta con la KEK del proyecto (AES-256-KW), AAD = `proyecto ‖ archivo ‖ versión`. El HMAC-SHA-256 se verifica en tiempo constante **antes** de descifrar; un fallo responde 409 `integrity_violation` y se audita como crítico. Borrar el proyecto destruye su clave |
| Edición | Árbol de archivos (crear, renombrar/mover, eliminar, documento principal) con rutas validadas (`SafeFilePath`: sin `..`, absolutas, ocultas ni extensiones fuera de lista), cuotas (1 MB por archivo, 20 MB y 200 archivos por proyecto) y autoguardado con concurrencia optimista (409 `version_conflict`) |
| Compilación segura | `POST /projects/:id/compile/analyze`: el servidor decide antes de compilar. Bloquea `\write18`, `\input{|…}`, lecturas fuera del proyecto, Lua y E/S directa; avisa de paquetes con shell-escape y `\catcode`. Los bloqueos se auditan |
| Plantillas | 5 plantillas del equipo (`blank`, `tesis-uta`, `articulo`, `informe-lab`, `presentacion`) generadas en el servidor y cifradas desde el primer byte |
| Administración | Listado de cuentas, suspender (cierra sus sesiones al instante) y reactivar; auditoría global con verificación de la cadena de hashes |
| Auditoría | Registro append-only encadenado por hash, escrito por un rol de base de datos que solo puede insertar |

### Fuera del alcance de esta entrega

Se retiraron de la interfaz y del backend porque su complejidad no cabe en esta fase: chat del proyecto, comentarios y control de cambios, historial de versiones, presencia y colaboración en tiempo real (Yjs), modo confidencial / cifrado en el navegador (C1, C2, C5), importación desde .zip o GitHub, subida de binarios (imágenes, PDF), tokens de aplicación, passkeys, SAML, métricas de servicio y moderación de plantillas. **La compilación real con TeX Live en un sandbox gVisor tampoco está**: la vista previa tipográfica se compone en el navegador, pero solo después de que el análisis del servidor no encuentre nada bloqueante.

### Pruebas

```bash
cd apps/api
npx vitest run                              # 73 unitarias: dominio, primitivas, cifrado (bit-flip, AAD, KEK ajena), rutas, analizador
node --test "test/security/*.test.mjs"     # 39 casos de abuso contra la pila en marcha (Docker arriba)
```

Los casos de abuso cubren acceso cruzado e IDOR, rol insuficiente, recorrido de rutas, conflictos de versión, cuotas, el bloqueo de `\write18`, reutilización de refresh tokens, CSRF, fuerza bruta y MFA.

---

## El problema que resuelve este repositorio

Compilar LaTeX **es ejecutar código arbitrario suministrado por un usuario anónimo**. LaTeX es Turing-completo, lee y escribe ficheros y puede invocar procesos del sistema. Toda la arquitectura de este backend existe para contener ese hecho.

---

## Documentación

| Documento | Contenido |
|---|---|
| [Docs/01-API-y-Documentacion-de-Endpoints.md](Docs/01-API-y-Documentacion-de-Endpoints.md) | Estrategia de documentación de la API y catálogo de los ~93 endpoints |
| [Docs/02-Arquitectura-del-Backend.md](Docs/02-Arquitectura-del-Backend.md) | Estructura del monorepo y arquitectura hexagonal |
| [Docs/03-Estandares-de-Codigo.md](Docs/03-Estandares-de-Codigo.md) | Reglas de escritura de código |
| [AGENTS.md](AGENTS.md) | **Instrucciones obligatorias para agentes de IA** |
| [`securtex-docs`](https://github.com/SecurTex-Devs/securtex-docs) | Requisitos, arquitectura general, modelo de amenazas, datos, plan de proyecto |

---

## Stack objetivo

| Capa | Tecnología | Motivo |
|---|---|---|
| Servicios de negocio | **NestJS 11 + Fastify** | Guards y validación estrictos obligatorios por diseño |
| Componentes de alto riesgo | **Rust + Axum** | Seguridad de memoria donde entra código hostil |
| Tiempo real | **Node 22 + Hocuspocus (Yjs)** | CRDT: un cliente malicioso no puede corromper el estado |
| Identidad | **Keycloak 26** | OIDC, SAML, Google, Microsoft, WebAuthn, sin reimplementar protocolos |
| Base de datos | **PostgreSQL 17 + Row Level Security** | Segunda barrera de autorización |
| Objetos | **MinIO + SSE-KMS** | Cifrado por defecto, autoalojable |
| Secretos y claves | **HashiCorp Vault** | Envelope encryption; la clave maestra nunca toca la aplicación |
| Compilación | **TeX Live full + gVisor** | Kernel independiente para código no confiable |

Justificación completa en [`securtex-docs` · 04-Stack-Tecnologico](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/04-Stack-Tecnologico.md).

---

## Documentación de la API

Tres especificaciones, una por tipo de interfaz:

| Interfaz | Especificación | Dónde se ve |
|---|---|---|
| REST público | **OpenAPI 3.1** generado desde el código | `/api/docs` (Scalar) · `/api/docs-classic` (Swagger UI) |
| Colaboración y eventos | **AsyncAPI 3.0** | `/api/asyncapi` |
| Entre servicios | **Protobuf / gRPC** | `contracts/proto/` (no publicado) |

```bash
pnpm contracts:generate   # Regenera los contratos desde el código
pnpm contracts:lint       # Spectral: reglas de estilo y de seguridad
pnpm contracts:test       # Schemathesis contra la implementación real
pnpm docs:serve           # http://localhost:3000/api/docs
```

> ⚠️ La documentación de la API **está deshabilitada en producción**: un esquema completo es un mapa para un atacante.

---

## Puesta en marcha (arquitectura objetivo)

```bash
git clone https://github.com/SecurTex-Devs/securtex-backend.git
cd securtex-backend
cp .env.example .env
pnpm install
pnpm dev
```

`pnpm dev` levanta con Docker Compose: PostgreSQL, Redis, MinIO, Vault (modo desarrollo), Keycloak con el realm preconfigurado, ClamAV, MailHog y el runner de TeX Live ligero, y siembra datos sintéticos.

**Requisitos:** Node 22 LTS, pnpm 9, Rust estable, Docker con Compose v2.

---

## Comandos

```bash
pnpm dev                  # Entorno completo
pnpm test                 # Unitarias e integración
pnpm test:security        # Suite de casos de abuso
pnpm test:e2e             # Playwright
pnpm lint                 # ESLint + reglas de seguridad
pnpm typecheck            # TypeScript strict
pnpm db:migrate           # Migraciones
pnpm db:seed              # Datos sintéticos
pnpm audit:deps           # Análisis de dependencias
```

Antes de abrir un PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:security`.

---

## Reglas innegociables

1. `shell-escape` está deshabilitado de forma permanente. No se activa por ningún motivo.
2. El código del usuario solo se ejecuta dentro del sandbox de gVisor, sin red.
3. Ningún endpoint existe sin `@Policy(...)`; el guard global deniega por defecto.
4. Toda tabla con datos de usuario tiene Row Level Security **forzada**.
5. Nunca se concatena SQL.
6. Ningún secreto entra en el repositorio.
7. Todo endpoint nuevo trae su prueba de acceso cruzado.

Desarrollo completo en [AGENTS.md](AGENTS.md) y [Docs/03-Estandares-de-Codigo.md](Docs/03-Estandares-de-Codigo.md).

---

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md). Ramas protegidas, commits firmados, una aprobación mínima, y revisión del responsable de seguridad para todo lo que toque autenticación, criptografía o el sandbox.

## Seguridad

¿Has encontrado una vulnerabilidad? [SECURITY.md](SECURITY.md). No abras un *issue* público.
