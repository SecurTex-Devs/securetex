# TeXGuard

**Editor LaTeX colaborativo seguro** — Documentación de planificación del proyecto

> Proyecto final de la asignatura **Seguridad de Software** · Universidad Técnica de Ambato · 8.º semestre
> Estado: **propuesta en revisión** · Versión 1.0

---

## Qué es TeXGuard

Una plataforma web de edición colaborativa de documentos LaTeX **funcionalmente equivalente a Overleaf**, construida desde cero aplicando seguridad por diseño en cada capa.

El punto de partida técnico es incómodo y por eso interesante: **LaTeX es un lenguaje Turing-completo con acceso al sistema de ficheros**. Cualquier plataforma de este tipo es, en el fondo, un servicio que ejecuta código arbitrario enviado por usuarios anónimos. Toda la arquitectura se organiza alrededor de ese hecho.

| | |
|---|---|
| **Funcionalidades inventariadas** | 222 |
| **Requisitos especificados** | 143 funcionales · 44 no funcionales · 64 de seguridad |
| **Amenazas modeladas (STRIDE)** | 61 |
| **Casos de uso detallados** | 13 principales + 7 casos de abuso |
| **Repositorios** | 3 independientes bajo una misma organización |

---

## Índice de la documentación

### Fundamentos

| # | Documento | Contenido |
|---|---|---|
| 00 | [Publicación de la documentación](00-Publicacion-de-la-Documentacion.md) | Cómo se organizan los repositorios y dónde vive cada documento |
| 01 | [Análisis funcional de Overleaf](01-Analisis-Funcional-Overleaf.md) | Inventario exhaustivo de las 222 funcionalidades a replicar |
| 02 | [Especificación de requisitos](02-Requisitos.md) | ERS completa según ISO/IEC/IEEE 29148 |

### Diseño

| # | Documento | Contenido |
|---|---|---|
| 03 | [Arquitectura](03-Arquitectura.md) | Modelo C4, fronteras de confianza, vistas 4+1 |
| 04 | [Stack tecnológico](04-Stack-Tecnologico.md) | Cada tecnología y por qué es la opción más segura |
| 05 | [**Seguridad**](05-Seguridad.md) | Modelo de amenazas STRIDE, controles, criptografía, respuesta a incidentes |
| 06 | [Modelo de datos](06-Modelo-de-Datos.md) | Entidad-relación, diccionario, Row Level Security |
| 07 | [Casos de uso y de abuso](07-Casos-de-Uso.md) | UML de casos de uso y modelado del atacante |
| 08 | [Diagramas UML](08-Diagramas-UML.md) | Clases, secuencia, actividad, estados, componentes, despliegue |

### Documentación específica de cada repositorio

| # | Documento | Repositorio |
|---|---|---|
| 09 | [Interfaces y mockups](09-Interfaces-y-Mockups.md) | → `texguard-frontend` |
| 10 | [API y endpoints](10-API-y-Endpoints.md) | → `texguard-backend` |

### Ejecución

| # | Documento | Contenido |
|---|---|---|
| 11 | [Plan de proyecto](11-Plan-de-Proyecto.md) | Sprints, roles, cronograma, riesgos, entregables |
| 12 | [DevSecOps y testing](12-DevSecOps-y-Testing.md) | Pipeline, controles automáticos, estrategia de pruebas |
| 13 | [Infraestructura y despliegue](13-Infraestructura-y-Despliegue.md) | Entornos, IaC, operación, copias de seguridad |
| 14 | [Glosario](14-Glosario.md) | Términos y acrónimos |

### Decisiones

| Registro | Decisión |
|---|---|
| [ADR-0001](adr/ADR-0001-microservicios-por-frontera-de-confianza.md) | Microservicios delimitados por frontera de confianza |
| [ADR-0002](adr/ADR-0002-sandbox-de-compilacion-con-gvisor.md) | gVisor para aislar el compilador LaTeX |
| [ADR-0003](adr/ADR-0003-keycloak-como-proveedor-de-identidad.md) | Keycloak en lugar de implementar OAuth/OIDC |
| [ADR-0004](adr/ADR-0004-crdt-yjs-frente-a-ot.md) | Yjs (CRDT) frente a transformación operacional |
| [ADR-0005](adr/ADR-0005-cifrado-sobre-envolvente-con-vault.md) | Envelope encryption con HashiCorp Vault |
| [ADR-0006](adr/ADR-0006-rust-para-el-orquestador-de-compilacion.md) | Rust en los componentes que procesan entrada hostil |
| [ADR-0007](adr/ADR-0007-postgresql-con-row-level-security.md) | RLS como segunda barrera de autorización |
| [ADR-0008](adr/ADR-0008-documentacion-de-api-code-first.md) | Documentación de API *code-first* verificada por contrato |
| [ADR-0009](adr/ADR-0009-tres-repositorios-y-documentacion-central.md) | Tres repositorios independientes con documentación central |

---

## Mapa de repositorios

| Repositorio | Qué contiene | Tecnología principal |
|---|---|---|
| **texguard-docs** *(este)* | Documentación común, ADR, plan de proyecto | Markdown + Mermaid + MkDocs |
| **texguard-backend** | API REST, servicios, orquestador de compilación, sandbox | NestJS · Rust · PostgreSQL · Keycloak |
| **texguard-frontend** | SPA, editor, visor PDF, sistema de diseño | Next.js · React · CodeMirror 6 · Yjs |

---

## Por dónde empezar

| Si eres… | Lee en este orden |
|---|---|
| **Nuevo en el equipo** | 01 → 02 → 03 → 05 |
| **Desarrollador de backend** | 03 → 04 → 06 → 05 → `texguard-backend/AGENTS.md` |
| **Desarrollador de frontend** | 03 → 09 → `texguard-frontend/Docs/` → `texguard-frontend/AGENTS.md` |
| **Responsable de seguridad** | 05 completo → 12 → 07 (casos de abuso) |
| **Docente / evaluador** | 01 → 02 → 05 → 11 |
| **Agente de IA** | El `AGENTS.md` del repositorio en el que vayas a trabajar, primero |

---

## Los cinco riesgos que definen el diseño

| # | Amenaza | Control principal | Riesgo residual |
|---|---|---|---|
| 1 | Escape del sandbox → ejecución de código en el servidor | gVisor + sin red + sin privilegios + efímero | Bajo |
| 2 | Lectura de ficheros del servidor vía `\input` | `openin_any=p` + análisis estático previo | Bajo |
| 3 | Acceso a proyectos ajenos (IDOR) | Autorización en el dominio **+ Row Level Security** | Bajo |
| 4 | Secuestro de cuenta | Passkeys + TOTP + Argon2id + detección de reutilización de tokens | Bajo |
| 5 | SSRF al importar desde una URL | Proxy dedicado con lista blanca y resolución DNS controlada | Bajo |

Desarrollo completo en [05-Seguridad.md](05-Seguridad.md).
</content>
</invoke>
