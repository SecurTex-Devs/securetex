# ADR-0005 · Cifrado sobre envolvente (envelope encryption) con HashiCorp Vault

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Responsable de seguridad
- **Afecta a:** `file-service`, `history-service`, modelo de datos, borrado de cuentas y proyectos

## Contexto

Los proyectos contienen tesis, artículos no publicados y datos de investigación. Un volcado de la base de datos o del almacén de objetos —por una vulnerabilidad, una copia mal protegida o un error de configuración— expondría todo el contenido en claro.

Además, el RGPD exige un borrado efectivo, y el borrado "real" de datos replicados y respaldados es notoriamente difícil de garantizar.

## Alternativas

| Opción | Protege ante volcado | Borrado efectivo | Complejidad |
|---|---|---|---|
| Sin cifrado en reposo | ❌ | ❌ | Ninguna |
| Cifrado de disco (LUKS / EBS) | ❌ (el disco está montado y descifrado) | ❌ | Baja |
| Cifrado a nivel de aplicación con una clave única global | ⚠️ (una clave para todo) | ❌ | Baja |
| **Envelope encryption con clave por proyecto** | ✅ | ✅ *crypto-shredding* | Media |
| Cifrado extremo a extremo en el cliente | ✅✅ | ✅ | **Incompatible** con compilar en servidor, buscar y colaborar |

## Decisión

Tres niveles de clave:

```
Clave maestra (Vault Transit, nunca sale de Vault)
   └── KEK por proyecto (almacenada envuelta)
         └── DEK por archivo (AES-256-GCM, almacenada envuelta)
               └── Contenido del archivo cifrado
```

- Algoritmo: **AES-256-GCM**, nonce aleatorio de 96 bits único por operación.
- Datos autenticados adicionales (AAD): `projectId ‖ fileId ‖ version` — impide reubicar un bloque cifrado en otro contexto.
- Rotación de la clave maestra cada 90 días: solo se recifran las KEK, no los archivos.

## Consecuencias

**Positivas**
- Un volcado de PostgreSQL o de MinIO **no revela el contenido de los documentos**.
- El borrado definitivo destruye la KEK del proyecto: los datos quedan irrecuperables al instante, incluso en copias de seguridad ya escritas.
- La rotación de claves es barata.

**Negativas**
- Vault se convierte en dependencia crítica: si Vault cae, no se pueden leer archivos. Se despliega en alta disponibilidad con *snapshots* cifrados y custodia repartida de las claves de *unseal*.
- **La pérdida irrecuperable de la clave maestra implica pérdida total de datos.** Riesgo aceptado y documentado en el plan de recuperación.
- Coste de latencia por operación criptográfica; se mitiga cacheando la KEK descifrada en memoria durante la vida de la petición, nunca más allá.

## No se elige cifrado extremo a extremo

Sería más fuerte, pero impide compilar en el servidor, buscar en el contenido, generar vistas previas y colaborar con el modelo actual. Se documenta como posible evolución para el "modo confidencial" (F-268) en una versión futura.

## Relacionadas

- [06-Modelo-de-Datos.md §3.3](../06-Modelo-de-Datos.md)
- [05-Seguridad.md §7.4](../05-Seguridad.md)
</content>
</invoke>
