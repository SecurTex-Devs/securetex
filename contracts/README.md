# contracts/

Contratos de las interfaces del backend. **Se generan desde el código** y se versionan aquí para que todo cambio de API sea visible y revisable en el *pull request*.

| Artefacto | Qué describe | Cómo se genera |
|---|---|---|
| `openapi.json` | API REST pública | `pnpm contracts:generate` desde los decoradores de NestJS |
| `asyncapi.yaml` | Canal WebSocket de colaboración y eventos | `pnpm contracts:generate` |
| `proto/` | Comunicación interna entre servicios (gRPC) | Escrito a mano; es la fuente de verdad de esa interfaz |
| `bruno/` | Colecciones de peticiones ejecutables por módulo | Mantenidas junto a cada endpoint |
| `CHANGELOG.md` | Cambios por versión, marcando los incompatibles | Manual |

> **No edites `openapi.json` ni `asyncapi.yaml` a mano.** El CI compara el contrato generado con el versionado: si difieren, el *merge* se bloquea.

Detalle completo en [`../Docs/01-API-y-Documentacion-de-Endpoints.md`](../Docs/01-API-y-Documentacion-de-Endpoints.md).
