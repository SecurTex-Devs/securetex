# 03 — Estándares de Código

> **Repositorio:** `texguard-backend`
> Aplicable a personas y a agentes de IA por igual. Lo que aquí se prohíbe, el CI lo bloquea.
> **Versión:** 1.0

---

## 1. Filosofía

**Código limpio y código seguro no son dos objetivos: son el mismo.** La mayoría de las vulnerabilidades reales no vienen de un algoritmo criptográfico mal elegido, sino de una función demasiado larga en la que alguien olvidó una comprobación, de un tipo `string` que representaba tres cosas distintas, o de un `catch` vacío.

De ahí las tres reglas que gobiernan el resto:

1. **Lo inválido debe ser inconstruible.** Si un dato tiene reglas, encapsúlalas en un tipo.
2. **Lo peligroso debe ser incómodo.** SQL crudo, `exec`, `any` y `@ts-ignore` requieren justificación explícita.
3. **Lo olvidable debe fallar.** Olvidar la autorización devuelve 403; olvidar el contexto de base de datos devuelve cero filas.

---

## 2. TypeScript

### 2.1 Configuración obligatoria

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true
  }
}
```

### 2.2 Reglas de tipos

| Regla | Motivo |
|---|---|
| Prohibido `any`, explícito o implícito | Usa `unknown` y estrecha con un type guard |
| Prohibido `!` (non-null assertion) | Salvo inmediatamente después de una comprobación visible |
| Prohibido `@ts-ignore` | Usa `@ts-expect-error` con comentario justificativo |
| Tipos nominales para identificadores | `UserId` y `ProjectId` no son intercambiables aunque ambos sean UUID |
| `readonly` por defecto en propiedades y arrays | La mutación se declara, no se asume |
| Uniones discriminadas en lugar de banderas booleanas | `{ kind: 'blocked', findings }` frente a `{ ok: false, blocked: true }` |
| Exhaustividad comprobada en `switch` | `default: assertNever(x)` |

```ts
// ✅ Tipos nominales
declare const brand: unique symbol;
export type UserId    = string & { readonly [brand]: 'UserId' };
export type ProjectId = string & { readonly [brand]: 'ProjectId' };

// Pasar un ProjectId donde se espera un UserId no compila.
```

---

## 3. Patrones prohibidos

El *hook* de pre-commit y el CI bloquean estos patrones:

| Patrón | Alternativa |
|---|---|
| `$queryRawUnsafe`, concatenación de SQL | `$queryRaw` con plantilla etiquetada o el ORM |
| `child_process.exec` con interpolación | `execFile`/`spawn` con `argv` separado |
| `eval`, `new Function`, `setTimeout('...')` | No hay alternativa: no se hace |
| `Math.random()` en contexto de seguridad | `crypto.randomBytes` |
| `md5`, `sha1`, `createCipher` | SHA-256 / Argon2id / `createCipheriv` con AES-GCM |
| `==` para comparar secretos | `crypto.timingSafeEqual` |
| `rejectUnauthorized: false`, `verify: false` | Nunca |
| `-shell-escape`, `shell_escape=t` | Nunca, bajo ninguna circunstancia |
| `catch {}` vacío | Registra o relanza; jamás silencies |
| `console.log` | El logger estructurado con redacción |
| `process.env.X` disperso por el código | Configuración validada y centralizada |

---

## 4. Manejo de errores

### 4.1 Errores tipados de dominio

```ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found';
  readonly httpStatus = 404;
}

export class ForbiddenError extends DomainError {
  readonly code = 'forbidden';
  readonly httpStatus = 403;
  constructor(public readonly reason?: string) { super('Forbidden'); }
}
```

Prohibido `throw new Error('algo falló')`. Un error sin tipo no se puede tratar correctamente en la frontera.

### 4.2 Reglas de la frontera HTTP

| Regla | Motivo |
|---|---|
| Formato RFC 9457 (Problem Details) | Contrato uniforme |
| El mensaje al cliente **nunca** contiene rutas, trazas, SQL ni versiones | RNF-031 |
| El detalle completo va al log con el `traceId` | Investigable sin exponer |
| «No existe» y «no autorizado» devuelven **el mismo 404** en recursos privados | Evita la enumeración (T-P07) |
| El intento denegado **siempre** se registra en auditoría | Detección |

### 4.3 Nunca silenciar

```ts
// ❌
try { await scan(file); } catch {}

// ✅
try {
  await scan(file);
} catch (err) {
  logger.error({ err, fileId }, 'Fallo del escaneo antivirus');
  await markAsPending(fileId);        // fail closed: el archivo sigue inaccesible
  throw new ScanUnavailableError();
}
```

---

## 5. Criptografía

**Regla número uno: no implementes criptografía.** Usa `packages/security`, que envuelve las primitivas aprobadas.

| Uso | Primitiva |
|---|---|
| Contraseñas y tokens de API | Argon2id (m=64 MiB, t=3, p=4) |
| Cifrado de contenido | AES-256-GCM con nonce aleatorio de 96 bits y AAD |
| Firma de tokens internos | Ed25519 |
| Aleatoriedad | `crypto.randomBytes` |
| Comparación | `crypto.timingSafeEqual` |
| Hash de integridad | SHA-256 |

Toda operación de cifrado pasa por Vault Transit: **la clave maestra nunca está en el proceso**.

---

## 6. Registro y observabilidad

### 6.1 Qué nunca se registra

Contraseñas · hashes de contraseña · tokens y cookies · secretos TOTP · claves · **contenido de documentos** · el cuerpo completo de una petición con datos personales.

```ts
export const logger = pino({
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie',
            '*.password', '*.token', '*.secret', '*.content'],
    censor: '[REDACTADO]',
  },
});
```

### 6.2 Qué sí se registra

`traceId` · identificador del actor · acción · resultado · motivo · duración · identificadores de recurso. La IP siempre anonimizada por red /24.

---

## 7. Estructura del código

| Regla | Límite |
|---|---|
| Longitud de función | ≤ 40 líneas |
| Complejidad ciclomática | ≤ 15 (el CI falla por encima) |
| Parámetros por función | ≤ 4; si son más, un objeto de comando |
| Profundidad de anidamiento | ≤ 3; usa cláusulas de guarda |
| Un archivo, una responsabilidad | — |
| Nombres en inglés, descriptivos | `revokeProjectMemberAccess`, no `handle` |
| Sin abreviaturas salvo las universales | `id`, `url`, `db` sí; `usrPrjMgr` no |
| Sin números mágicos | Constantes con nombre en `domain/constants.ts` |

### 7.1 Comentarios

Comenta **por qué**, no **qué**. Los comentarios valiosos son los que explican una decisión no obvia, sobre todo de seguridad:

```ts
// El escaneo antivirus es asíncrono a propósito: bloquear la respuesta HTTP
// permitiría medir el tiempo de escaneo y deducir características del archivo.
// El archivo permanece inaccesible hasta av_status = 'clean' (fail closed).
await this.queue.add('scan', { fileId });
```

---

## 8. Pruebas

| Regla | Detalle |
|---|---|
| Nombre en lenguaje natural | `it('un lector no puede modificar archivos del proyecto')` |
| Estructura *arrange–act–assert* explícita | — |
| Sin lógica condicional en los tests | Un `if` en un test es un test que no sabe qué prueba |
| Datos sintéticos deterministas | `faker` con semilla fija |
| **Nunca datos reales** | Ni correos, ni nombres, ni contenido de personas |
| Escenario canónico compartido | 4 usuarios con los 4 roles, 3 proyectos |
| Cobertura | 80 % global · **100 %** en `domain/policies`, `security/` y `compile/` |
| **Prueba de acceso cruzado obligatoria** | Por cada endpoint nuevo, sin excepción |

---

## 9. Base de datos

| Regla | Detalle |
|---|---|
| Clave primaria `uuid` con `uuidv7()` | Nunca enteros secuenciales (RS-011) |
| `created_at`, `updated_at` siempre; `deleted_at` si hay borrado lógico | — |
| RLS habilitada **y forzada** en la misma migración que crea la tabla | RS-012 |
| Cada columna clasificada en un comentario SQL | `PUBLIC` / `INTERNAL` / `PII` / `SECRET` / `ENCRYPTED` |
| Migraciones reversibles o con plan de reversión documentado | — |
| `CREATE INDEX CONCURRENTLY` en tablas grandes | Sin bloqueos largos |
| Cambios de esquema en tres pasos: *expand → migrate → contract* | Compatibilidad hacia atrás |

---

## 10. Configuración

Toda la configuración se valida al arrancar con un esquema Zod. **Si falta una variable obligatoria, el proceso no arranca.** Un servicio a medio configurar es peor que un servicio caído.

```ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  VAULT_ADDR: z.string().url(),
  SESSION_COOKIE_DOMAIN: z.string(),
  COMPILE_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(300).default(60),
});

export const env = envSchema.parse(process.env);   // falla ruidosamente al arrancar
```

Prohibido `process.env` fuera de este módulo.

---

## 11. Rust

| Regla | Detalle |
|---|---|
| Prohibido `unsafe` | Salvo justificación en el PR y revisión de dos personas |
| `#![deny(clippy::all, clippy::pedantic)]` | Excepciones puntuales y comentadas |
| Prohibido `unwrap()` y `expect()` en código de producción | Permitidos en tests |
| Errores con `thiserror`; propagación con `?` | — |
| Secretos envueltos en `secrecy::Secret` | Zeroización al liberar |
| `rustls`, nunca OpenSSL | Sin dependencias de C |
| Todo recurso externo con timeout | Sin esperas indefinidas |

---

## 12. Commits y pull requests

```
feat(projects): añade la revocación de acceso de colaboradores
fix(compile): destruye el volumen efímero también en la ruta de error
sec(auth): rota la familia de refresh tokens al detectar reutilización
```

Prefijos: `feat`, `fix`, `sec`, `perf`, `refactor`, `test`, `docs`, `chore`. **Commits firmados obligatorios.**

Plantilla de PR — se responde siempre:

1. ¿Qué amenaza del modelo toca este cambio?
2. ¿Qué controles añade o modifica?
3. ¿Qué pruebas lo verifican?
4. ¿Requiere actualizar el contrato de la API o la documentación?

---

## 13. Motivos de rechazo en revisión

- Endpoint sin `@Policy(...)`
- Tabla nueva sin RLS o sin prueba de acceso cruzado
- Cualquier patrón de la sección 3
- `catch` vacío o error silenciado
- Contrato de API no regenerado
- Documentación no actualizada junto al cambio
- Test que no comprueba comportamiento observable
- Secreto, credencial o dato real en el código o en los tests
- Función que supera los límites de la sección 7 sin justificación

---

## 14. Documentos relacionados

- [`../AGENTS.md`](../AGENTS.md) — versión operativa de estas reglas para agentes de IA
- [02-Arquitectura-del-Backend.md](02-Arquitectura-del-Backend.md)
- [`texguard-docs` · 12-DevSecOps-y-Testing](https://github.com/texguard/texguard-docs/blob/main/docs/12-DevSecOps-y-Testing.md)
</content>
</invoke>
