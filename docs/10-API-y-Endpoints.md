# 10 — API y Endpoints

> Este documento **vive en el repositorio del backend**, porque el contrato se genera desde el código y debe cambiar en el mismo *pull request* que la implementación.

---

## Dónde está

| Documento | Ubicación |
|---|---|
| Estrategia de documentación de la API, comparación de herramientas y catálogo completo de endpoints | [`texguard-backend/Docs/01-API-y-Documentacion-de-Endpoints.md`](https://github.com/texguard/texguard-backend/blob/main/Docs/01-API-y-Documentacion-de-Endpoints.md) |
| Contrato OpenAPI 3.1 generado | `texguard-backend/contracts/openapi.json` |
| Contrato AsyncAPI 3.0 (WebSockets y eventos) | `texguard-backend/contracts/asyncapi.yaml` |
| Contratos gRPC internos | `texguard-backend/contracts/proto/` |
| Colecciones de peticiones ejecutables | `texguard-backend/contracts/bruno/` |

---

## Resumen de la decisión

**No es "Swagger o algo mejor": es OpenAPI + AsyncAPI + Protobuf**, porque un sistema con REST, WebSockets y comunicación interna entre servicios no se describe con una sola especificación.

| Interfaz | Especificación | Renderizado |
|---|---|---|
| API REST pública | **OpenAPI 3.1** (generado desde el código NestJS) | Scalar · Swagger UI · Redocly |
| Colaboración en tiempo real y eventos | **AsyncAPI 3.0** | AsyncAPI Studio |
| Comunicación interna entre servicios | **Protobuf / gRPC** | `protoc-gen-doc` (no publicado) |

El contrato se **genera** desde el código, se **versiona** en git, se **valida** con Spectral y se **prueba** contra la implementación con Schemathesis. Si el código y la documentación divergen, el CI falla.

> ⚠️ La documentación de la API **no se sirve en producción**: un esquema completo es un mapa para un atacante.

---

## Superficie de la API

| Área | Endpoints | Documento |
|---|---|---|
| Autenticación y cuenta | 28 | §5.1 |
| Proyectos y compartición | 22 | §5.2 |
| Archivos | 10 | §5.3 |
| Compilación y SyncTeX | 7 | §5.4 |
| Revisión, historial y bibliografía | 12 | §5.5 |
| Plantillas, integraciones y administración | 14 | §5.6 |
| **Total** | **~93 endpoints REST** + 1 canal WebSocket + 6 servicios gRPC internos | |
