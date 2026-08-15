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
| **Funcionalidades inventariadas** | 222, clasificadas en 5 niveles de prioridad |
| **Requisitos especificados** | 143 funcionales · 44 no funcionales · 75 de seguridad |
| **Amenazas modeladas (STRIDE)** | 61 |
| **Capas de cifrado** | 5, con 6 familias criptográficas distintas |
| **Casos de uso detallados** | 13 principales + 7 casos de abuso |
| **Pantallas prototipadas** | 50 |
| **Repositorios** | 3 independientes bajo una misma organización |
| **Calendario** | **10 semanas · 5 sprints** |

> ⚠️ **El alcance está acotado.** Las 222 funcionalidades están **especificadas**, pero no todas se construyen: el calendario real es de 10 semanas. Qué entra, qué es negociable y qué queda fuera está decidido en **[16-Priorizacion-y-Alcance.md](16-Priorizacion-y-Alcance.md)**, que es el documento que gobierna la ejecución.

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
| 14 | [**Criptografía multicapa**](14-Criptografia-Multicapa.md) | Cinco capas de cifrado con algoritmos distintos, de `Ctrl+S` al descifrado en el navegador |

### Documentación específica de cada repositorio

| # | Documento | Repositorio |
|---|---|---|
| 09 | [Interfaces y mockups](09-Interfaces-y-Mockups.md) | → `texguard-frontend` |
| 10 | [API y endpoints](10-API-y-Endpoints.md) | → `texguard-backend` |

### Ejecución

| # | Documento | Contenido |
|---|---|---|
| 16 | [**Priorización y alcance**](16-Priorizacion-y-Alcance.md) | ⭐ Las 222 funcionalidades clasificadas en 5 niveles y el plan real de **10 semanas** |
| 11 | [Plan de proyecto](11-Plan-de-Proyecto.md) | Roles, ceremonias, riesgos, Definición de Terminado, entregables |
| 12 | [DevSecOps y testing](12-DevSecOps-y-Testing.md) | Pipeline, controles automáticos, estrategia de pruebas |
| 13 | [Infraestructura y despliegue](13-Infraestructura-y-Despliegue.md) | Entornos, IaC, operación, copias de seguridad |
| 15 | [Glosario](15-Glosario.md) | Términos y acrónimos |

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
| [ADR-0010](adr/ADR-0010-criptografia-multicapa-y-modo-e2ee.md) | Criptografía multicapa y modo de cifrado extremo a extremo |

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
| **Nuevo en el equipo** | **16** → 01 → 03 → 05 |
| **Vas a decidir el alcance** | **16** completo, con la hoja de decisión del §21 |
| **Desarrollador de backend** | 16 → 03 → 04 → 06 → 14 → `texguard-backend/AGENTS.md` |
| **Desarrollador de frontend** | 16 → 03 → 09 → 14 → `texguard-frontend/AGENTS.md` |
| **Responsable de seguridad** | 05 completo → **14** → 12 → 07 (casos de abuso) |
| **Docente / evaluador** | 01 → 02 → 05 → 14 → 16 |
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

Desarrollo completo en [05-Seguridad.md](05-Seguridad.md) y, para el bloque criptográfico, en [14-Criptografia-Multicapa.md](14-Criptografia-Multicapa.md).
