# ADR-0004 · Yjs (CRDT) frente a transformación operacional

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Líder técnico
- **Afecta a:** `collab-service`, editor del frontend, modelo de datos de documentos

## Contexto

La edición simultánea sin pérdida de cambios es el corazón del producto. Overleaf usa históricamente **transformación operacional** (OT, derivada de ShareJS). La alternativa moderna son los **CRDT**.

La decisión no es solo de corrección funcional: determina **qué puede hacer un cliente malicioso** con el estado compartido.

## Alternativas

| Criterio | OT (ShareDB) | **CRDT (Yjs)** |
|---|---|---|
| Corrección | Depende de que el servidor ordene y transforme correctamente; las funciones de transformación son notoriamente difíciles de acertar | Convergencia demostrada; operaciones conmutativas e idempotentes |
| **Superficie de ataque** | Un cliente puede enviar operaciones con versiones falseadas y desincronizar a los demás | Una actualización maliciosa solo puede añadir contenido que la autorización ya permite; **no puede corromper el estado de otros** |
| Trabajo sin conexión | Complejo | Nativo |
| Memoria | Menor | Metadatos adicionales (mitigados por la codificación binaria de Yjs) |
| Ecosistema | Maduro pero con menor actividad | Muy activo; integración directa con CodeMirror 6 |
| Escalado horizontal | Requiere un ordenador central por documento | Cualquier nodo puede aceptar actualizaciones; fan-out por Redis |

## Decisión

**Yjs** como CRDT, con **Hocuspocus** como servidor y `y-codemirror.next` en el editor. Persistencia mediante actualizaciones binarias compactadas periódicamente en *snapshots*.

El argumento decisivo es de seguridad: con CRDT, **ningún mensaje del cliente puede romper el documento de los demás**. El peor caso de un cliente hostil es insertar texto que ya tenía derecho a insertar, lo cual es un problema de autorización (resuelto en otra capa), no de integridad del estado.

## Consecuencias

**Positivas**
- Convergencia garantizada; se puede verificar con pruebas basadas en propiedades.
- Edición sin conexión con `y-indexeddb`: el usuario sigue escribiendo aunque se caiga la red.
- Los anclajes de comentarios y cambios rastreados usan **posiciones relativas**, que sobreviven a ediciones concurrentes del texto circundante.

**Negativas**
- Mayor consumo de memoria por documento; se mitiga compactando y descargando salas inactivas.
- El historial de versiones no se obtiene "gratis" del CRDT: requiere *snapshots* explícitos (implementados en `history-service`).
- Menor familiaridad del equipo; se compensa con la documentación y las pruebas de convergencia.

## Verificación

`load/crdt-convergence.spec.ts`: 10 clientes concurrentes, 5 000 operaciones aleatorias, comprobación de que todos los estados finales son idénticos byte a byte.

## Relacionadas

- [03-Arquitectura.md §5.2](../03-Arquitectura.md)
- [07-Casos-de-Uso.md · CU-25](../07-Casos-de-Uso.md)
</content>
</invoke>
