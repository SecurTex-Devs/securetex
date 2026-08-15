# ADR-0009 · Tres repositorios independientes con documentación central

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Equipo completo
- **Afecta a:** Organización del código, permisos, flujo de trabajo, entrega

## Contexto

El equipo quiere frontend y backend **separados**, cada uno con su propio historial, su propio CI y sus propios permisos. A la vez, necesita una documentación **única, profesional y accesible** para todos los miembros y para el docente, sin duplicarla ni mantenerla en dos sitios.

## Alternativas

| Opción | Repos independientes | Documentación única | Documentación junto al código |
|---|---|---|---|
| Monorepo único | ❌ | ✅ | ✅ |
| Dos repos con documentación duplicada | ✅ | ❌ (se contradicen) | ✅ |
| Dos repos + Notion / Confluence | ✅ | ✅ | ❌ (se desactualiza) |
| **Tres repos: docs, backend, frontend** | ✅ | ✅ | ✅ |

## Decisión

Una **organización de GitHub** con tres repositorios independientes:

| Repositorio | Contenido |
|---|---|
| `texguard-docs` | Documentación común: análisis, requisitos, arquitectura, seguridad, datos, casos de uso, UML, plan, DevSecOps, infraestructura, ADR |
| `texguard-backend` | Código del backend + su documentación específica (API y endpoints, estándares de backend) |
| `texguard-frontend` | Código del frontend + su documentación específica (interfaces, mockups, sistema de diseño, accesibilidad) |

Más:

- Un **GitHub Project (v2) a nivel de organización** que agrupa los *issues* de los tres repositorios en un único tablero, con campos de sprint, módulo, requisito y riesgo de seguridad. Esto es el "proyecto grande con subproyectos".
- Un sitio de documentación generado con **MkDocs Material** y publicado automáticamente desde `texguard-docs`.
- Un repositorio `.github` con el perfil de la organización como portada.

## Reglas

1. **Un documento vive en un solo repositorio.** Los demás lo enlazan; nunca lo copian.
2. La documentación específica de un repositorio se actualiza **en el mismo PR** que el código que describe.
3. La documentación común se revisa por *pull request*, igual que el código.
4. Un *workflow* semanal verifica que los enlaces entre repositorios sigan vivos.

## Por qué no Notion

Notion es cómodo para escribir, pero **desacopla la documentación del código**: nadie la actualiza en el PR, no hay revisión por pares ni control de versiones real, y los diagramas Mermaid tienen soporte limitado. Se recomienda para actas de reunión y coordinación diaria, **nunca como fuente de verdad de la especificación**.

## Consecuencias

**Positivas** — Repositorios independientes con permisos y CI propios; documentación única y revisable; visión unificada del trabajo en un solo tablero; la entrega académica se hace desde un sitio ordenado.

**Negativas** — Tres repositorios que clonar y mantener; los enlaces entre repositorios pueden romperse (mitigado con verificación automática); un cambio que afecte a los tres exige coordinar tres PR.

## Relacionadas

- [00-Publicacion-de-la-Documentacion.md](../00-Publicacion-de-la-Documentacion.md)
