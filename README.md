# texguard-backend

Backend de **TeXGuard**, editor LaTeX colaborativo seguro: API REST, servicios de dominio, colaboración en tiempo real y orquestador de compilación aislada.

> Proyecto final de la asignatura *Seguridad de Software* · Universidad Técnica de Ambato
> **Estado: planificación aprobada, implementación pendiente (Sprint 0).**

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
| [`texguard-docs`](https://github.com/SecurTex-Devs/securtex-docs) | Requisitos, arquitectura general, modelo de amenazas, datos, plan de proyecto |

---

## Stack

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

Justificación completa en [`texguard-docs` · 04-Stack-Tecnologico](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/04-Stack-Tecnologico.md).

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

## Puesta en marcha

```bash
git clone https://github.com/SecurTex-Devs/securtex-backend.git
cd texguard-backend
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
