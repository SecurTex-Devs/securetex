# ADR-0008 · Documentación de API *code-first* verificada por contrato

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Backend + Líder técnico
- **Afecta a:** `texguard-backend`, generación del cliente del frontend

## Contexto

El equipo trabaja en dos repositorios independientes. El frontend necesita saber exactamente qué acepta y devuelve el backend. Además, el docente y los compañeros deben poder ver todos los endpoints sin leer el código.

El riesgo clásico es la **documentación que miente**: un `openapi.yaml` escrito a mano que se desactualiza en la segunda semana.

## Alternativas

| Opción | Riesgo principal |
|---|---|
| Documentación manual en Markdown | Se desactualiza siempre |
| Design-first (contrato a mano, código después) | El código se desvía sin que nadie lo note |
| **Code-first con verificación** | Se pierde parte del diseño previo — se compensa con el diseño en los casos de uso |

## Decisión

1. El contrato **se genera** desde los decoradores de NestJS y los DTO (que son a la vez validación y documentación).
2. El contrato generado **se versiona en git** (`contracts/openapi.json`).
3. El CI **falla** si el contrato generado difiere del versionado → todo cambio de API es visible y revisable en el PR.
4. Se valida con **Spectral** (reglas propias de seguridad) y se prueba contra la implementación con **Schemathesis**.
5. Se renderiza con **Scalar** (equipo), **Swagger UI** (familiaridad) y **Redocly** (portal público).
6. Lo que OpenAPI no cubre se documenta con **AsyncAPI 3.0** (WebSockets, eventos) y **Protobuf** (gRPC interno).

## Reglas de seguridad de la documentación

- **No se sirve en producción.** Un esquema completo es un mapa para el atacante.
- Los endpoints de administración van en un documento separado que no se publica.
- Toda operación debe declarar su `security` y sus respuestas `401`, `403` y `429`; Spectral lo verifica.
- Los ejemplos no contienen datos, tokens ni correos reales; Spectral lo verifica.
- Prohibidos los identificadores numéricos en rutas; Spectral lo verifica.

## Consecuencias

**Positivas** — La documentación no puede mentir sobre la forma de las peticiones; el cliente TypeScript del frontend se genera del contrato, eliminando la desincronización entre repositorios.

**Negativas** — Un paso más en el flujo de trabajo (`pnpm contracts:generate` antes del commit), automatizado con un *hook*; los decoradores hacen los controladores más verbosos.

## Relacionadas

- [`texguard-backend/Docs/01-API-y-Documentacion-de-Endpoints.md`](https://github.com/texguard/texguard-backend/blob/main/Docs/01-API-y-Documentacion-de-Endpoints.md)
- [10-API-y-Endpoints.md](../10-API-y-Endpoints.md)
