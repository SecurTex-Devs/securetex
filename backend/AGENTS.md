# AGENTS.md — Instrucciones para agentes de IA · Backend

> Lo leen Claude Code, Cursor, Copilot, Codex y cualquier otro asistente antes de tocar este repositorio.
> **Estas reglas son obligatorias.** Un cambio que las incumpla se rechaza en revisión, lo haya escrito una persona o una IA.

---

## 0. Lo primero que debes saber

SecurTex **ejecuta código arbitrario suministrado por usuarios anónimos**: LaTeX es Turing-completo, lee y escribe ficheros y puede invocar procesos del sistema. Toda la arquitectura existe para contener ese hecho.

Si una propuesta tuya ignora esto, está mal, por muy elegante que sea.

Antes de escribir código lee:

1. [`securtex-docs` · 03-Arquitectura](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/03-Arquitectura.md)
2. [`securtex-docs` · 05-Seguridad](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/05-Seguridad.md) ← el documento central
3. [`Docs/02-Arquitectura-del-Backend.md`](Docs/02-Arquitectura-del-Backend.md)
4. [`Docs/03-Estandares-de-Codigo.md`](Docs/03-Estandares-de-Codigo.md)

---

## 1. Prohibiciones absolutas

Estas nueve reglas **no admiten excepción**. Si crees que necesitas una, no la implementes: abre una discusión.

| # | Prohibido | Por qué |
|---|---|---|
| 1 | Habilitar `shell-escape`, `\write18` o `-shell-escape` en la compilación | Ejecución remota de código (T-C01) |
| 2 | Ejecutar código del usuario fuera del sandbox de gVisor | Es la única frontera que contiene el impacto (T-C03) |
| 3 | Concatenar SQL. Usa siempre consultas parametrizadas o el ORM | Inyección SQL |
| 4 | `$queryRawUnsafe`, `eval`, `new Function`, `child_process.exec` con interpolación | Inyección de comandos |
| 5 | Crear un endpoint sin decorador `@Policy(...)` | El guard global deniega, pero el olvido debe ser imposible por convención |
| 6 | Aceptar el rol, el `userId` o el `projectId` del cuerpo de la petición como fuente de autoridad | Escalada de privilegios |
| 7 | Escribir secretos, credenciales o tokens en el código, en los tests o en los logs | Filtración |
| 8 | `Math.random()`, MD5, SHA-1 o `createCipher` en cualquier contexto de seguridad | Criptografía débil |
| 9 | Registrar en el log contraseñas, tokens, cookies o contenido de documentos | Fuga por observabilidad (RS-052) |
| 10 | Descifrar un dato **antes** de verificar su HMAC o su etiqueta de autenticación | Ejecuta el descifrado sobre entrada del atacante (RS-075) |
| 11 | Reutilizar un nonce con la misma clave, o usar AES-GCM para envolver claves | Rotura total del cifrado / error operativo (RS-071, RS-074) |
| 12 | Implementar criptografía propia, o usar César, Vigenère, ROT13, XOR fijo, ECB o CBC sin MAC | No ofrecen ninguna garantía (RS-081) |

---

## 2. Arquitectura que debes respetar

### 2.1 Hexagonal por servicio

```
src/
├── domain/          Entidades, objetos de valor, políticas. SIN dependencias de infraestructura.
├── application/     Casos de uso. Orquestan dominio + puertos.
├── infrastructure/  Adaptadores: Prisma, S3, Redis, Vault, HTTP externo.
└── presentation/    Controladores HTTP, gateways WebSocket, consumidores de cola.
```

**Regla de dependencias:** `presentation → application → domain`. El dominio **no importa nada** de las otras capas. Se verifica en CI con `dependency-cruiser`; una violación rompe el build.

### 2.2 Objetos de valor autovalidados

Un dato inválido debe ser **inconstruible**. No valides en el controlador y confíes después: encapsula la regla en el tipo.

```ts
// ✅ CORRECTO — si existe un SafeFileName, ya pasó la validación
export class SafeFileName {
  private constructor(private readonly value: string) {}

  static of(raw: string): SafeFileName {
    const normalized = raw.normalize('NFC');
    if (normalized.length === 0 || normalized.length > 255) throw new InvalidFileNameError('longitud');
    if (normalized.includes('/') || normalized.includes('\\')) throw new InvalidFileNameError('separador');
    if (normalized.includes('..')) throw new InvalidFileNameError('traversal');
    if (/[\x00-\x1f\x7f]/.test(normalized)) throw new InvalidFileNameError('control');
    if (RESERVED_NAMES.has(normalized.toUpperCase())) throw new InvalidFileNameError('reservado');
    return new SafeFileName(normalized);
  }

  toString(): string { return this.value; }
}

// ❌ INCORRECTO — string desnudo que alguien olvidará validar
function createFile(name: string) { /* ... */ }
```

Objetos de valor obligatorios: `Email`, `UserId`, `ProjectId`, `FileId`, `SafeFileName`, `SafeFilePath`, `ProjectRole`, `PasswordHash`, `ShareToken`.

### 2.3 La autorización vive en el dominio

```ts
// ✅ CORRECTO
export class UpdateFileUseCase {
  async execute(cmd: UpdateFileCommand): Promise<void> {
    const project = await this.projects.byId(cmd.projectId);
    if (!project) throw new NotFoundError();                    // 404 uniforme

    const decision = this.policy.canWrite(cmd.actor, project);  // ← punto único
    if (decision.denied) {
      await this.audit.record('authz.denied', { ... });
      throw new ForbiddenError(decision.reason);
    }
    // ...
  }
}

// ❌ INCORRECTO — autorización en el controlador, saltable por otras entradas
@Post()
async update(@Body() dto, @CurrentUser() user) {
  if (user.role !== 'editor') throw new ForbiddenException();   // NO
}
```

**Motivo:** el mismo caso de uso se invoca desde HTTP, desde WebSocket y desde la cola. Si la comprobación está en el controlador, las otras dos entradas quedan desprotegidas.

### 2.4 Row Level Security siempre activa

Toda operación de base de datos pasa por el middleware que establece `app.user_id`. **Nunca uses una conexión sin contexto** salvo en los trabajos de sistema, que tienen su propio rol y sus propias políticas. Si olvidas el contexto, no verás filas: eso es correcto, es *fail closed*.

Al crear una tabla con datos de usuario, en la **misma migración**:

```sql
ALTER TABLE nueva_tabla ENABLE ROW LEVEL SECURITY;
ALTER TABLE nueva_tabla FORCE  ROW LEVEL SECURITY;
CREATE POLICY ... ;
```

Y en el **mismo PR**, la prueba de acceso cruzado.

---

## 3. Reglas por tipo de cambio

### 3.1 Nuevo endpoint

Checklist obligatorio:

- [ ] DTO con validación (`class-validator` o Zod) y `@ApiProperty` en cada campo
- [ ] Decorador `@Policy(...)` explícito
- [ ] `@Throttle(...)` si es sensible o costoso
- [ ] Respuestas documentadas: `200/201`, `400`, `401`, `403`, `404`, `429`
- [ ] Identificadores en la ruta: UUID, **nunca** enteros
- [ ] Evento de auditoría si modifica estado o deniega acceso
- [ ] `pnpm contracts:generate` ejecutado y el diff revisado
- [ ] Prueba de **acceso cruzado** añadida a `test/security/authz/`
- [ ] Colección Bruno actualizada

### 3.2 Nueva tabla o migración

- [ ] Clave primaria `uuid` con `uuidv7()`
- [ ] `created_at`, `updated_at`; `deleted_at` si admite borrado lógico
- [ ] RLS habilitada **y forzada** con sus políticas
- [ ] Índices para las consultas previstas y para la evaluación de RLS
- [ ] Clasificación de cada columna (`PUBLIC` / `INTERNAL` / `PII` / `SECRET` / `ENCRYPTED`) en el comentario
- [ ] Columnas `SECRET` o `ENCRYPTED`: nunca en claro; envelope encryption vía Vault
- [ ] Migración reversible o con plan de reversión documentado
- [ ] `Docs` y el modelo de datos de `securtex-docs` actualizados

### 3.3 Tocar el compilador o el sandbox

⚠️ **Componente de riesgo crítico.** Requiere revisión del responsable de seguridad.

- [ ] No se relaja ningún flag de `texmf.cnf`
- [ ] Argumentos del proceso construidos como `argv`, **nunca** pasando por un shell
- [ ] Toda ruta que entre al sandbox pasa por `SafeFilePath`
- [ ] La salida se valida (MIME real, tamaño, estructura) antes de aceptarse
- [ ] Los logs se sanean antes de mostrarse: contienen texto del usuario
- [ ] Los nuevos vectores de ataque considerados se añaden a `test/security/compile/`
- [ ] El contenedor se destruye siempre, también en la ruta de error

### 3.4 Tocar criptografía multicapa

⚠️ **Riesgo crítico.** Cobertura del **100 %** y revisión del responsable de seguridad + una segunda persona.

Las cinco capas están especificadas en [`securtex-docs` · 14-Criptografia-Multicapa](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/14-Criptografia-Multicapa.md). El backend implementa **C2 (apertura del sobre), C3 (reposo) y C4 (verificación)**; C1 y C5 son del cliente.

- [ ] Todo pasa por `packages/security`; ningún servicio llama a una primitiva criptográfica directamente
- [ ] **C2**: se abre el sobre con X25519 + HKDF-SHA-256 + ChaCha20-Poly1305; la clave derivada se zeroiza tras usarse
- [ ] **C3**: claves envueltas con **AES-256-KW**, datos cifrados con **AES-256-GCM** con AAD `projectId ‖ fileId ‖ version`
- [ ] **C4**: se verifica el **HMAC-SHA-256 antes** de descifrar; si falla, se registra incidente de integridad y **no se descifra**
- [ ] Los artefactos de compilación se firman con **Ed25519** antes de salir de la Zona 4
- [ ] La KEK y la DEK se zeroizan del buffer al terminar la petición
- [ ] En **modo confidencial** el servidor **no recibe** ninguna DEK: cualquier ruta que asuma lo contrario debe fallar explícitamente
- [ ] Prueba de manipulación de bit añadida (cifrado, nonce, etiqueta y AAD) → todas deben rechazar

### 3.5 Tocar autenticación o criptografía de identidad

⚠️ Requiere revisión del responsable de seguridad y cobertura del **100 %**.

- [ ] Usa las primitivas de `packages/security`; no implementes criptografía nueva
- [ ] Comparaciones de secretos en tiempo constante (`crypto.timingSafeEqual`)
- [ ] Tokens: ≥ 256 bits del CSPRNG, almacenados **hasheados**
- [ ] Nada de secretos en logs, mensajes de error ni respuestas
- [ ] Respuestas y tiempos uniformes para no permitir enumeración
- [ ] Operaciones sensibles exigen reautenticación reciente (≤ 5 min)

---

## 4. Estilo de código

| Regla | Detalle |
|---|---|
| TypeScript `strict` | Sin `any` implícito, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Sin `any` explícito | Usa `unknown` y estrecha el tipo |
| Sin `!` (non-null assertion) | Salvo tras una comprobación evidente en la línea anterior |
| Sin `// @ts-ignore` | `@ts-expect-error` con comentario justificativo, si es inevitable |
| Funciones ≤ 40 líneas, complejidad ciclomática ≤ 15 | El CI falla por encima |
| Nombres en inglés, descriptivos | `revokeProjectMemberAccess`, no `handle` ni `doStuff` |
| Errores de dominio tipados | `NotFoundError`, `ForbiddenError`; nunca `throw new Error('...')` |
| Sin comentarios que repiten el código | Comenta el **porqué**, sobre todo en decisiones de seguridad |
| Async/await, no cadenas de `.then()` | — |
| Inmutabilidad por defecto | `readonly`, `as const` |
| Sin números mágicos | Constantes con nombre en `domain/constants.ts` |

### 4.1 Comentarios que sí queremos

```ts
// El escaneo antivirus es asíncrono a propósito: bloquear la respuesta HTTP
// permitiría medir el tiempo de escaneo y deducir el contenido del fichero.
// El fichero permanece inaccesible hasta que av_status = 'clean' (fail closed).
await this.queue.add('scan', { fileId });
```

### 4.2 Estructura de un caso de uso

```ts
export class RevokeMemberUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly policy: ProjectAuthorizationPolicy,
    private readonly audit: AuditSink,
    private readonly events: EventPublisher,
  ) {}

  async execute(cmd: RevokeMemberCommand): Promise<void> {
    // 1· Cargar
    const project = await this.projects.byId(cmd.projectId);
    if (!project) throw new NotFoundError();

    // 2· Autorizar
    const decision = this.policy.canManageAccess(cmd.actor, project);
    if (decision.denied) {
      await this.audit.record('authz.denied', { actor: cmd.actor.id, target: cmd.projectId });
      throw new ForbiddenError();
    }

    // 3· Reglas de dominio
    project.revokeMember(cmd.targetUserId, cmd.actor);

    // 4· Persistir
    await this.projects.save(project);

    // 5· Auditar
    await this.audit.record('project.member.revoked', { ... });

    // 6· Publicar el efecto lateral (cierra los WebSockets del revocado en < 5 s)
    await this.events.publish(new MemberRevokedEvent(cmd.projectId, cmd.targetUserId));
  }
}
```

Este orden —cargar, autorizar, aplicar reglas, persistir, auditar, publicar— es **obligatorio**. No lo alteres.

---

## 5. Pruebas

| Tipo | Cuándo es obligatoria |
|---|---|
| Unitaria | Toda lógica de dominio, política y objeto de valor |
| **Acceso cruzado** | **Todo endpoint nuevo, sin excepción** |
| RLS | Toda tabla nueva |
| Integración | Todo repositorio y adaptador |
| Caso de abuso | Toda historia con riesgo medio o superior |
| E2E | Todo flujo de usuario completo |

Cobertura mínima: 80 % global, **100 %** en `domain/policies`, `security/` y `compile/`.

Los datos de prueba son **sintéticos y deterministas**. Nunca datos reales. Parte del escenario canónico de `test/fixtures/scenario.ts`: 4 usuarios, 3 proyectos, los 4 roles.

---

## 6. Commits y pull requests

```
feat(projects): añade la revocación de acceso de colaboradores
fix(compile): destruye el volumen efímero también en la ruta de error
sec(auth): rota la familia de refresh tokens al detectar reutilización
docs(api): documenta las respuestas 429 del endpoint de invitación
```

Prefijos: `feat`, `fix`, `sec`, `perf`, `refactor`, `test`, `docs`, `chore`. **Commits firmados obligatorios.**

En el PR, responde siempre:

1. ¿Qué amenaza del modelo toca este cambio?
2. ¿Qué controles añade o modifica?
3. ¿Qué pruebas lo verifican?

---

## 7. Comandos

```bash
pnpm dev                  # Levanta todo el stack local
pnpm test                 # Unitarias + integración
pnpm test:security        # Suite de casos de abuso
pnpm test:e2e             # Playwright
pnpm lint                 # ESLint + reglas de seguridad
pnpm typecheck            # TypeScript strict
pnpm contracts:generate   # Regenera OpenAPI y AsyncAPI
pnpm contracts:lint       # Spectral
pnpm db:migrate           # Migraciones
pnpm db:seed              # Datos sintéticos
pnpm audit:deps           # SCA
```

Antes de dar por terminado un cambio: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:security`.

---

## 8. Qué hacer si dudas

| Situación | Qué hacer |
|---|---|
| No sabes si algo compromete la seguridad | **Asume que sí.** Pregunta antes de implementarlo |
| Una regla de este documento te bloquea | No la incumplas: propón un ADR |
| Necesitas una dependencia nueva | Justifícala en el PR: alternativas, mantenimiento, dependencias transitivas |
| Falta información (una versión, un umbral) | Márcalo como `⚠️ POR DEFINIR`. **No inventes valores** |
| El cambio afecta a la arquitectura | Actualiza el ADR en `securtex-docs` en un PR paralelo y enlázalo |
| El cambio afecta al frontend | Regenera el contrato y avisa en el PR del otro repositorio |

---

## 9. Contexto de negocio, en una frase

Un estudiante escribe su tesis en LaTeX, su directora la revisa a la vez desde otro país, y ninguno de los dos debería tener que confiar en que el servidor no lea su trabajo ni en que el documento de otro usuario no comprometa la plataforma.
