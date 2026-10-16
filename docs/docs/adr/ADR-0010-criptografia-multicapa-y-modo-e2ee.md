# ADR-0010 · Criptografía multicapa y modo de cifrado extremo a extremo

- **Estado:** Aceptada — **amplía** a [ADR-0005](ADR-0005-cifrado-sobre-envolvente-con-vault.md)
- **Fecha:** 2026-08-14
- **Decide:** Responsable de seguridad + Líder técnico
- **Afecta a:** Frontend, `file-service`, `compile-orchestrator`, modelo de datos, modo confidencial

## Contexto

ADR-0005 estableció el cifrado en reposo con envelope encryption y **descartó explícitamente** el cifrado extremo a extremo por ser incompatible con compilar en el servidor.

Dos cosas han cambiado:

1. Se exige aplicar **varios algoritmos de cifrado distintos** en puntos diferenciados del recorrido del dato: al guardar en el cliente, al enviar, en la base de datos, al recuperar y al descifrar de vuelta.
2. Existen motores TeX portados a **WebAssembly** que permiten compilar en el navegador, lo que elimina la incompatibilidad que motivó el descarte del E2EE.

## Alternativas

| Opción | Algoritmos distintos | Protege ante volcado | Protege ante servidor comprometido | Permite compilar en servidor |
|---|---|---|---|---|
| Solo TLS + cifrado de disco | 1 | ❌ | ❌ | ✅ |
| Solo ADR-0005 (envelope en reposo) | 1 familia | ✅ | ❌ | ✅ |
| Cifrar varias veces con AES en cada salto | 1 familia repetida | ✅ | ❌ | ✅ |
| **Cinco capas con algoritmos distintos + dos modos** | 6 familias | ✅ | ✅ en modo Confidencial | ✅ en modo Estándar |

La tercera opción se descarta expresamente: **repetir el mismo algoritmo con la misma clave no aporta seguridad, aporta latencia**. Una capa solo se justifica si protege frente a una amenaza distinta.

## Decisión

Cinco capas, cada una con su algoritmo y su amenaza:

| Capa | Momento | Algoritmo | Amenaza que cubre |
|---|---|---|---|
| **C1** | `Ctrl+S`, compilación, autoguardado | **AES-256-GCM** (WebCrypto) | El contenido sale del navegador en claro |
| **C2** | Envío al backend | **X25519 + HKDF-SHA-256 + ChaCha20-Poly1305** | TLS termina en un intermediario (CDN, WAF, balanceador) |
| **C3** | Reposo | **AES-256-KW** (claves) + **AES-256-GCM** (datos) + **AES-256-CBC/HMAC** (columnas PII) | Volcado de base de datos o de copias |
| **C4** | Recuperación | **HMAC-SHA-256** (verificar antes de descifrar) + **Ed25519** (firma de artefactos) | Manipulación silenciosa del dato en reposo |
| **C5** | Descifrado en el navegador | **AES-256-GCM** con verificación de etiqueta y AAD | Cierra el ciclo; nada se muestra sin autenticar |

Y **dos modos por proyecto**:

- **Estándar** (por defecto): la DEK se envuelve también para el servicio de compilación. Todas las funcionalidades disponibles.
- **Confidencial (E2EE real)**: la DEK nunca se envuelve para el servidor; **la compilación ocurre en el navegador con un motor TeX en WebAssembly**. El operador no puede leer el contenido.

## Justificación de la elección de algoritmos

| Elección | Motivo |
|---|---|
| AES-256-GCM en C1 | Único AEAD nativo y universal en WebCrypto; acelerado por hardware |
| **ChaCha20-Poly1305 en C2**, no AES | Diseño matemáticamente independiente de AES (ARX frente a red SP): un avance criptoanalítico contra uno no afecta al otro. Además es constante en tiempo sin AES-NI |
| X25519 en lugar de RSA-4096 | Claves de 32 bytes, sin parámetros que se puedan elegir mal, y permite un par efímero por mensaje |
| Par efímero destruido tras cada envío | *Forward secrecy* a nivel de aplicación: comprometer hoy la clave del servicio no descifra los mensajes de ayer |
| AES-256-KW para envolver claves | Determinista y sin nonce: elimina el riesgo de reutilización de nonce al envolver cientos de miles de DEK |
| HMAC antes de descifrar | Descifrar primero y validar después ejecuta el descifrado sobre entrada del atacante |

## Consecuencias

**Positivas**

- Seis familias criptográficas distintas, cada una con una justificación concreta y verificable.
- Confidencialidad frente a intermediarios que terminan TLS, no solo frente al robo de disco.
- El modo Confidencial ofrece una garantía que ningún servicio comparable del mercado da: el operador **no puede** leer el documento.
- Se elimina una clase de error operativo al usar AES-KW para claves y AES-GCM para datos.

**Negativas**

- **La gestión de claves se vuelve la parte más compleja del sistema.** Se concentra en un único módulo con cobertura del 100 % y revisión obligatoria de dos personas.
- En modo Confidencial se pierden búsqueda en servidor, vista previa en la galería e integraciones externas.
- El motor WASM añade ~30 MB de descarga inicial en los proyectos que activan el modo.
- **En modo Confidencial, perder la contraseña y los códigos de recuperación significa pérdida irrecuperable del contenido.** La interfaz lo advierte con esas palabras antes de activarlo.
- Revocar a un colaborador obliga a rotar la DEK; el contenido que ya descargó no se puede «desleer». Riesgo residual aceptado y documentado.

**Neutras**

- Latencia añadida de 2–6 ms por operación, despreciable frente a los segundos de una compilación.

## Verificación

Por cada capa existe una prueba que altera un bit del criptograma, del nonce, de la etiqueta y del AAD, y comprueba que el sistema **rechaza el dato y registra el evento**. Un descifrado que funciona con un bit alterado es un fallo crítico. Requisitos `RS-070` a `RS-080`.

## Relacionadas

- [14-Criptografia-Multicapa.md](../14-Criptografia-Multicapa.md) — desarrollo completo
- [ADR-0005](ADR-0005-cifrado-sobre-envolvente-con-vault.md) — decisión que esta amplía
- [ADR-0002](ADR-0002-sandbox-de-compilacion-con-gvisor.md) — el sandbox sigue siendo necesario en modo Estándar
