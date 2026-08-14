# ADR-0002 · gVisor para el aislamiento del compilador LaTeX

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Responsable de seguridad + Infraestructura
- **Afecta a:** `compile-orchestrator`, `texlive-runner`, namespace `compile`

## Contexto

LaTeX es Turing-completo, lee y escribe ficheros y —mediante `\write18` o `\directlua`— puede invocar procesos del sistema. Compilar el documento de un usuario **es ejecutar su código**. Un contenedor Docker estándar comparte el kernel del anfitrión: una vulnerabilidad del kernel convierte el escape del contenedor en compromiso del nodo.

Esta es la amenaza T-C01/T-C03, la de mayor severidad del sistema (riesgo inicial 25/25).

## Alternativas

| Opción | Aislamiento | Arranque | Complejidad | Veredicto |
|---|---|---|---|---|
| `chroot` / usuario sin privilegios | Muy débil | Inmediato | Baja | ❌ Insuficiente |
| Contenedor Docker estándar | Namespaces + cgroups; kernel compartido | ~200 ms | Baja | ❌ Un CVE del kernel basta |
| Contenedor + seccomp + sin capabilities | Mejor, pero kernel compartido | ~200 ms | Media | ⚠️ Plan B |
| **gVisor (`runsc`)** | Kernel de espacio de usuario en Go que intercepta las llamadas al sistema | ~300 ms | Media | ✅ **Elegida** |
| Firecracker (microVM) | Virtualización completa | ~1 s | Alta; requiere virtualización anidada | ⚠️ Producción de alto riesgo |
| Kata Containers | VM ligera | ~1 s | Alta | ⚠️ |

## Decisión

**gVisor como aislamiento por defecto**, dentro de una estrategia de nueve niveles: usuario no root, sin capabilities, raíz de solo lectura, `tmpfs` con `noexec`, **sin red**, seccomp restrictivo, kernel independiente, límites de recursos, contenedor efímero, más vigilancia con Falco.

Firecracker queda documentado como opción de despliegue para un entorno de producción de alto riesgo, sin cambios en el código: el `SandboxRunner` es una interfaz.

## Consecuencias

**Positivas**
- Una vulnerabilidad del kernel de Linux no es directamente explotable: el syscall lo atiende gVisor, no el kernel real.
- Compatible con Kubernetes mediante `RuntimeClass`, sin cambios en la aplicación.
- Coste de arranque asumible frente a un tiempo típico de compilación de varios segundos.

**Negativas**
- Penalización de rendimiento en E/S intensiva (~10–30 %), relevante porque TeX Live lee miles de ficheros pequeños. Se mitiga con caché de compilación y `tmpfs`.
- Algunas llamadas al sistema poco frecuentes no están implementadas; se validó que TeX Live completo funciona.
- Requiere nodos dedicados con `runsc` instalado.

## Verificación

El **ejercicio de escape del sandbox** se ejecuta al final de cada sprint contra el árbol de ataque de [05-Seguridad.md §5.3](../05-Seguridad.md). Todos los vectores deben fallar y quedar documentados.

## Relacionadas

- [ADR-0001](ADR-0001-microservicios-por-frontera-de-confianza.md)
- [ADR-0006](ADR-0006-rust-para-el-orquestador-de-compilacion.md)
</content>
</invoke>
