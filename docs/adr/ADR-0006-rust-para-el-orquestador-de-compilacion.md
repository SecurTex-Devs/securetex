# ADR-0006 · Rust en los componentes que procesan entrada hostil

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Líder técnico + Responsable de seguridad
- **Afecta a:** `compile-orchestrator`, `url-fetcher`

## Contexto

El resto del backend está en TypeScript (NestJS), lo que da coherencia y permite compartir tipos con el frontend. Introducir un segundo lenguaje tiene un coste real: formación, herramientas, CI, mantenimiento.

Sin embargo, dos componentes son cualitativamente distintos:

1. **`compile-orchestrator`** — manipula rutas de fichero derivadas de entrada del usuario, lanza y supervisa procesos hostiles, aplica límites de recursos y **parsea la salida de un programa que el atacante controla** (el `.log` de LaTeX).
2. **`url-fetcher`** — descarga contenido desde URLs suministradas por el usuario; debe controlar la resolución DNS y el socket con precisión para evitar *DNS rebinding* y condiciones de carrera TOCTOU.

## Alternativas

| Opción | Seguridad de memoria | Control de bajo nivel | Coste para el equipo |
|---|---|---|---|
| TypeScript / Node | Sí (GC), pero sin control fino de procesos ni rlimits | Limitado | Nulo |
| Go | Sí (GC); carreras de datos posibles | Bueno | Bajo |
| C / C++ | **No** | Total | Prohibido por CO-05 |
| **Rust** | Sí, verificada en compilación; sin carreras de datos | Total | Medio |

## Decisión

**Rust (edición 2024) exclusivamente en esos dos componentes.** No se reescribe el backend.

Bibliotecas: `axum`, `tokio`, `serde`, `rustls` (TLS sin OpenSSL), `secrecy` (zeroización de secretos en memoria), `nix` (rlimits).

## Justificación

- El parseo de la salida del compilador es exactamente el patrón que históricamente ha producido desbordamientos y *use-after-free*. En Rust esa clase de fallo no compila.
- `tokio` permite supervisar cientos de procesos con temporizadores y cancelación precisa, algo que en Node exige artesanía frágil.
- RAII garantiza que el volumen temporal y el contenedor se destruyen aunque haya un error a mitad de camino.
- El uso está **acotado**: dos binarios con una interfaz clara (gRPC y HTTP), especificados antes de escribirlos.

## Consecuencias

**Positivas** — Se eliminan por construcción clases enteras de vulnerabilidad en el punto de mayor exposición del sistema.

**Negativas** — Curva de aprendizaje (riesgo R-03 del plan de proyecto); dos cadenas de herramientas en el CI; menos gente del equipo puede tocar esos componentes.

**Mitigación** — Sesión de formación en el sprint 4, antes del sprint 5 (compilación); especificación detallada previa; revisión obligatoria de esos componentes por dos personas.

## Relacionadas

- [ADR-0002](ADR-0002-sandbox-de-compilacion-con-gvisor.md)
- [04-Stack-Tecnologico.md §4.2](../04-Stack-Tecnologico.md)
</content>
</invoke>
