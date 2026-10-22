# SecurTex · backend

Backend de **SecurTex**, editor LaTeX colaborativo seguro: API REST, servicios de dominio, colaboración en tiempo real y orquestador de compilación aislada.

> Proyecto final de la asignatura *Seguridad de Software* · Universidad Técnica de Ambato
> **Estado: primera entrega funcional.** Lo implementado y lo que queda fuera está en [Estado de esta entrega](#estado-de-esta-entrega); el resto del documento describe la arquitectura objetivo.

---

## Estado de esta entrega

### Arrancar todo con Docker

Desde la **raíz del repositorio** (un solo `docker-compose.yml` para todo):

```bash
cp .env.example .env               # rellena los secretos; cada uno trae el comando que lo genera
docker compose up --build -d
```

| Servicio | URL | Nota |
|---|---|---|
| Aplicación web | http://localhost:3000 | Imagen de `../frontend` |
| API + documentación | http://localhost:4000/api/docs | OpenAPI generado desde el código |
| Correo de pruebas (Mailpit) | http://localhost:8025 | Enlaces de verificación y recuperación |
| Compilador (sandbox) | — | Sin red: no publica puertos ni puede abrir conexiones |

Si ya tenías un `.env` de una versión anterior, compáralo con `.env.example` y añade las claves que falten (sin tocar las existentes). La migración S3 cifra columnas que antes estaban en claro y necesita una base vacía: `docker compose down -v` antes de volver a levantar.

El servicio `migrate` aplica las migraciones y siembra el escenario sintético: 4 usuarios `*@securtex.test` (Ana Torres es administradora) y 6 proyectos con sus archivos ya cifrados. La contraseña de esas cuentas es `SEED_DEMO_PASSWORD` de `.env` (raíz). Es el único servicio con las credenciales del propietario de la base de datos; la API se conecta con tres roles de mínimo privilegio. Para empezar de cero: `docker compose down -v`.

### Implementado

| Área | Qué hay |
|---|---|
| Identidad | Registro con verificación por correo, Argon2id + comprobación HIBP (k-anonimato), **bloqueo por cuenta aplicado por PostgreSQL** (10 fallos en 15 min; bloqueos escalonados de 15 min, 1 h, 6 h y 24 h; la API no puede quitarlo y un trigger impide crear sesiones de cuentas bloqueadas o suspendidas, también con acceso directo a la base), recuperación de contraseña, OIDC (Google/Microsoft con PKCE), vincular y desvincular proveedores desde Ajustes con reautenticación, TOTP con códigos de recuperación y antirreplay, aviso por correo de inicio de sesión desde un dispositivo nuevo |
| Sesiones | JWT Ed25519 de 10 min en cookie, refresh opaco rotatorio con detección de reutilización (revoca la familia), CSRF por Origin + token sincronizado, sesiones visibles y revocables |
| Autorización | Guard global que deniega por defecto (`@Policy`), matriz de roles owner/editor/reviewer/viewer, 404 uniforme para no miembros y **Row Level Security forzada** en PostgreSQL |
| Proyectos | Crear (en blanco o desde plantilla), renombrar, archivar, papelera, borrado definitivo, invitaciones por correo, cambio de rol, revocación, etiquetas privadas |
| **Colaboración en tiempo real** | Yjs (CRDT) por proyecto sobre WebSocket en `/api/v1/collab/:projectId`: varias personas escriben a la vez, con cursores y presencia. Origin exacto (anti CSWSH), sesión por cookie, rol revalidado cada 10 s y al instante al revocar (cierre 4403). Lectores y revisores ven en vivo, pero el servidor descarta sus cambios. El nombre y el color del cursor los pone el servidor (no se pueden suplantar). Se persiste cifrado cada 1,5 s (máximo 8 s) |
| **Cifrado multicapa C1–C5** | **C1** AES-256-GCM en el navegador · **C2** sobre X25519 + HKDF-SHA-256 + ChaCha20-Poly1305 (por mensaje en REST; por conexión, estilo Noise NK, en el WebSocket, con contadores antirrepetición) · **C3** AES-256-KW + AES-256-GCM en reposo, AAD `proyecto ‖ archivo ‖ versión` · **C4** HMAC-SHA-256 verificado antes de descifrar · **C5** el navegador comprueba Poly1305 y la etiqueta GCM antes de mostrar nada |
| **Datos personales cifrados (C3c)** | Correos, nombres, institución, cargo, sujetos y correos OIDC, IP y dispositivo de las sesiones, etiquetas, nombres de proyecto, documento principal, rutas de archivo, invitaciones y preferencias: AES-256-CBC + HMAC-SHA-256 (encrypt-then-MAC), contexto `tabla.columna`. Búsquedas y unicidad con índices ciegos HMAC; RLS casa invitaciones por índice ciego |
| Edición | Árbol de archivos (crear, renombrar/mover, eliminar, documento principal) con rutas validadas (`SafeFilePath`), cuotas (1 MB por archivo de texto, 20 MB y 200 archivos por proyecto) |
| **Figuras** | `POST /projects/:id/files/upload`: PNG, JPG o PDF de hasta 5 MB (50 MB de binarios por proyecto) en un sobre C1 + C2. Se exige la **firma binaria** del tipo (un «.png» con HTML dentro da 400), no se aceptan SVG ni otros formatos, y se cifran en reposo como el resto. El compilador los recibe en base64 y comprueba que la codificación casa con la extensión |
| **Historial de versiones** | Instantánea cifrada (C3 + C4, AAD con el id de la versión) como mucho cada 2 min por archivo y autor; se guardan las 60 últimas de cada archivo. `GET …/versions`, contenido sellado en `GET …/versions/:id` y `POST …/versions/:id/restore`, que crea un cambio nuevo y lo difunde en vivo a la sala. Leer: cualquier miembro; restaurar: propietaria o editores |
| **Copia de proyecto** | `POST /projects/:id/duplicate`: proyecto nuevo de quien copia, con **su propia DEK** (el servidor recifra cada archivo) y sin colaboradores. Puede copiar cualquier miembro, incluso un lector; un ajeno recibe 404 |
| **Estado colaborativo persistido** | El documento Yjs de cada sala se guarda cifrado con una **época**. Tras reiniciar el servidor, la sala recupera su estado y lo reconcilia con la base de datos; un cliente con un historial de otra época se reinicia en vez de fusionarlo, así que el texto ya no se duplica |
| Compilación segura | `POST /projects/:id/compile/analyze`: guarda lo de la sala y decide antes de compilar. Bloquea `\write18`, `\input{|…}`, lecturas fuera del proyecto, Lua y E/S directa; avisa de paquetes con shell-escape y `\catcode`. Los bloqueos se auditan |
| **Compilación real (C4b)** | `POST /projects/:id/compile`: autoriza `compile`, repite el análisis sobre la MISMA lectura que se compila (422 `compile_blocked` si bloquea), compila con TeX Live en el servicio `compiler` y devuelve el PDF firmado con Ed25519 dentro de un sobre C1 + C2. Detalle en [Compilación en el sandbox](#compilación-en-el-sandbox) |
| Plantillas | 5 plantillas del equipo generadas en el servidor y cifradas desde el primer byte |
| Administración | Listado de cuentas, suspender (cierra sus sesiones al instante) y reactivar; auditoría global con verificación de la cadena de hashes |
| Auditoría | Registro append-only encadenado por hash, escrito por un rol de base de datos que solo puede insertar. Es la única tabla con metadatos en claro (tipo de evento, prefijo de IP anonimizado): cifrarla rompería la verificación de la cadena |

### Usar SecurTex en la red local (varias personas, mismo wifi)

1. Averigua la IP del equipo que hará de servidor (en Windows, `ipconfig` → «Dirección IPv4», p. ej. `192.168.1.50`).
2. Añade a `.env` (raíz):
   ```
   PUBLISH_HOST=0.0.0.0
   APP_ORIGIN=http://192.168.1.50:3000,http://localhost:3000
   ```
   El primer origen es el de los enlaces de los correos; ponlo con la IP para que funcionen desde otros equipos.
3. `docker compose up -d` y permite en el cortafuegos de Windows los puertos **3000** (web) y **4000** (API y WebSocket de colaboración) para redes privadas.
4. Desde otro equipo de la red: `http://192.168.1.50:3000`. El cifrado C1/C2/C5 del navegador usa `@noble` y funciona también en `http://IP` (WebCrypto no estaría disponible ahí).

Sin HTTPS en la LAN, las cookies viajan sin `Secure`: aceptable en una red de confianza para clase; en un despliegue real va detrás de TLS.

### Iniciar sesión con Google y Microsoft (gratis)

El código está hecho; solo hacen falta credenciales tuyas. Ambos registros son gratuitos.

**Google** (consola de Google Cloud):
1. Crea un proyecto → «APIs y servicios» → «Pantalla de consentimiento de OAuth» → tipo *Externo*, en modo *Prueba*, y añade como «usuarios de prueba» los correos que vayan a entrar.
2. «Credenciales» → «Crear credenciales» → «ID de cliente de OAuth» → *Aplicación web*.
3. URI de redirección autorizado: `http://localhost:3000/api/v1/auth/oidc/google/callback`.
4. Copia el ID y el secreto a `.env` (raíz) como `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

**Microsoft** (portal de Azure → Microsoft Entra ID → «Registros de aplicaciones»):
1. «Nuevo registro» → cuentas admitidas: *Cuentas personales de Microsoft* (o *cualquier directorio y cuentas personales*).
2. URI de redirección, plataforma *Web*: `http://localhost:3000/api/v1/auth/oidc/microsoft/callback`.
3. «Certificados y secretos» → nuevo secreto de cliente; copia su **valor**.
4. En `.env` (raíz): `MICROSOFT_CLIENT_ID` (Id. de aplicación), `MICROSOFT_CLIENT_SECRET` y `MICROSOFT_TENANT=consumers` (solo personales) o `common`.

Después: `docker compose up -d --force-recreate api`. Los botones aparecen solos en el acceso y en Ajustes → Cuentas vinculadas. Limitación: Google y Microsoft solo admiten `http://` con `localhost` como redirección, así que en la red local el acceso con proveedor funciona desde el equipo servidor; los demás usan correo y contraseña (o hace falta un dominio con HTTPS).

### Fuera del alcance de esta entrega

Chat del proyecto, comentarios y control de cambios, modo confidencial (DEK que el servidor nunca recibe y compilación en el navegador), importación desde .zip o GitHub, tokens de aplicación, passkeys, SAML, métricas de servicio y moderación de plantillas.

### Pruebas

```bash
cd apps/api
npx vitest run                              # unitarias: dominio, primitivas, cifrado (bit-flip, AAD, KEK ajena), rutas, analizador, PDF, registro, firma C4b y mapa SyncTeX
node --test "test/security/*.test.mjs"     # 73 casos de abuso contra la pila en marcha (Docker arriba)
```

Los casos de abuso cubren acceso cruzado e IDOR, rol insuficiente, recorrido de rutas, conflictos de versión, cuotas, el bloqueo de `\write18`, reutilización de refresh tokens, CSRF, fuerza bruta, MFA, sobres C2 manipulados o reubicados, y en la colaboración: CSWSH, sesión ausente, lector que intenta escribir, trama manipulada y revocación en caliente. En la compilación (`compile.test.mjs`): las cinco plantillas a PDF con firma válida, PDF manipulado, `\write18` directo (422) y ofuscado (el sandbox lo deja en `runsystem(…)...disabled`), `\input{/etc/passwd}` directo (422) y escondido en una macro (openin_any=p), bucle infinito (plazo de 30 s) y PDF enorme (RLIMIT_FSIZE); y en SyncTeX: el mapa solo nombra archivos del proyecto (ni `/work`, ni TeX Live, ni el `.aux`), su firma propia no verifica si se toca el mapa, se pega a otro PDF o se cambia el compilationId, un `output.synctex.gz` falsificado desde el documento (`\synctex=0` + `\openout` ofuscado) no produce mapa, y sin PDF no hay mapa. En figuras, historial y copias (`project-features.test.mjs`): «PNG» con HTML dentro, SVG, `.tex` subido como binario, lector y ajeno que suben, imagen sobrescrita como texto, historial de otro proyecto, lector que restaura y copia por un ajeno. En el bloqueo de cuentas (`lockout.test.mjs`), atacando también la base con el rol de la API: leer, poner a cero, borrar o crear contadores (permiso denegado), desbloqueo manual, crear una sesión para la cuenta bloqueada o suspendida, registrar un acierto para quitar el bloqueo, reasignar una sesión a otra cuenta y revivir una revocada; además, el agravamiento 15 min → 1 h → 6 h y el desbloqueo por un operador. `test/security/demo-maria.mjs` simula a una segunda persona escribiendo para verlo en el navegador.

### Bloqueo de cuentas en la base

El bloqueo por intentos fallidos no lo decide la API sino PostgreSQL (migración `s5_bloqueo_de_cuentas_en_la_base`):

- **Solo el rol `securtex_lockout`** (sin inicio de sesión) toca `login_throttle`. La API llama a funciones `SECURITY DEFINER` (`auth_register_login_failure`, `auth_register_login_success`, `auth_login_locked_until`, `auth_user_locked_until`) y no tiene ningún permiso sobre la tabla: no puede leer los contadores, ponerlos a cero ni borrar un bloqueo.
- **Escalonado:** 10 fallos en 15 minutos bloquean 15 min; los bloqueos siguientes en menos de 24 h duran 1 h, 6 h y 24 h.
- **Trigger `sessions_account_guard`:** ninguna sesión nueva para una cuenta bloqueada, suspendida o borrada, sea por contraseña, segundo factor, Google o Microsoft, o con un `INSERT` directo con las credenciales de la API. Una sesión tampoco puede cambiar de dueño ni revivir tras revocarse.
- Las sesiones ya abiertas del titular **no se cierran** al bloquear: si no, cualquiera podría echar a otra persona fallando su contraseña diez veces.
- **Desbloqueo manual** (solo el propietario de la base): `docker compose exec postgres psql -U securtex_owner -d securtex -c "SELECT auth_unlock_account('<id del usuario>')"`.
- **Límite:** el propietario de la base o un superusuario puede desactivar el trigger. Ese rol solo lo usan las migraciones, y la API nunca tiene sus credenciales.

### Compilación en el sandbox

Compilar LaTeX es ejecutar código hostil, así que el compilador vive en su propio contenedor (`apps/compiler`, Zona 4) y la API nunca ejecuta TeX:

```
navegador ──C1+C2──▶ API ── análisis ──▶ volumen tmpfs compile-jobs ──▶ compiler (sin red)
          ◀─C1+C2── firma Ed25519 ◀── valida PDF ◀── <id>.res ◀───────── TeX Live
```

| Control | Cómo |
|---|---|
| Sin red | `network_mode: none`: solo `lo`. Ni Internet, ni la API, ni PostgreSQL. Los trabajos llegan por un volumen **tmpfs** (`noexec,nosuid,nodev`, 128 MB) con un protocolo de archivos de un solo uso; la petición se lee y se borra al reclamarla |
| Contenedor | `read_only`, `cap_drop: ALL`, `no-new-privileges`, usuario 1000, `pids_limit: 64`, 1,5 GB de memoria sin swap, 2 CPU, sin volcados de memoria |
| TeX | `-no-shell-escape`, `shell_escape=f`, `openin_any=p`, `openout_any=p` y `mktex*=0` en `texmf.cnf` **y** en el entorno de cada proceso (que kpathsea antepone); la imagen no se construye si la configuración efectiva no es esa. LuaTeX además con `--safer --nosocket` |
| Proceso | `spawn` con argv, sin shell, entorno mínimo sin secretos (kpathsea expande `$VAR` en los nombres de archivo); `prlimit` con CPU, memoria virtual 2 GB, **RLIMIT_FSIZE de 16 MB** (un PDF o un registro más grande mata a TeX) y 256 descriptores; plazo de reloj de **30 s** para todas las pasadas, tras el que se mata el grupo de procesos entero |
| Directorio | Uno por trabajo en `/work` (tmpfs privado, `noexec`), borrado en `finally`: éxito, error, plazo o excepción. La API también borra sus archivos del volumen en `finally` |
| Salida | La API valida el PDF por su contenido (`%PDF-1.x`/`2.x`, `%%EOF`, ≤ 16 MB), sanea el registro (sin rutas absolutas ni caracteres de control, acotado) y extrae los errores en formato `-file-line-error` |
| Firma (C4b) | `Ed25519(SHA-256(pdf) ‖ compilationId[16] ‖ sourceTreeHash[32])` con `COMPILER_SIGNING_KEY`. La clave la tiene la API, no el sandbox: si el sandbox la tuviera, el propio documento hostil podría filtrarla. Clave pública en `GET /api/v1/crypto/artifact-key`; el navegador verifica antes de renderizar |
| SyncTeX | TeX corre con `-synctex=1` (comprimido: sin comprimir podría chocar con RLIMIT_FSIZE). El trabajador descomprime el `.synctex.gz` con topes (8 MB comprimido, 64 MB descomprimido, 2000 páginas, 600 000 números, 4 MB de mapa) y lo reduce a un mapa mínimo en décimas de bp con rutas **relativas** y solo de archivos del proyecto: ni el `.synctex.gz` ni las rutas del sandbox salen del contenedor. La API lo trata como salida hostil: estructura exacta, enteros en rango, cada ruta por `SafeFilePath` y presente en el proyecto, y lo **reserializa** (nunca reenvía los bytes del sandbox). Viaja tras el PDF en la trama v2 (`pdfBytes`, `synctexBytes`) dentro del mismo sobre C1 + C2, con firma propia `Ed25519("securtex:c4b:synctex:v1" ‖ SHA-256(mapa) ‖ compilationId ‖ SHA-256(pdf))`: la del PDF no cambia y un mapa no se puede pegar a otro PDF. Un mapa inválido no rompe la compilación: el PDF llega sin mapa y la auditoría registra `synctexRejected` |
| Coste | 12 compilaciones/min por cliente, una a la vez por persona y 4 en todo el servicio (429 `compile_busy`); 503 `compiler_unavailable` si el sandbox no reclama el trabajo en 10 s |
| Auditoría | `compile.completed`, `compile.failed`, `compile.output_rejected` (plazo, tamaño, PDF inválido) y `compile.blocked`, con motor, duración, pasadas y bytes (PDF y mapa SyncTeX); nunca contenido |

**Riesgos residuales** (documentados, no resueltos en esta entrega):

- **Sin gVisor.** Docker Desktop no trae `runsc`, así que el aislamiento es el de `runc` (espacios de nombres + seccomp por defecto de Docker), no un kernel de usuario. AGENTS.md exige gVisor en producción: donde esté instalado, `COMPILER_RUNTIME=runsc` en `.env` (raíz) lo activa sin tocar nada más.
- **Un contenedor de larga vida, no uno por compilación.** Se destruye el directorio de cada trabajo, no el contenedor. Crear contenedores desde la API exigiría darle el socket de Docker (equivale a root en el anfitrión). Con 2 trabajos a la vez y el mismo uid, una fuga de TeX hasta ejecución de código podría leer el otro trabajo en curso o una petición aún en cola en el volumen.
- **Lua puede leer archivos del contenedor.** Con `--safer` LuaTeX no ejecuta programas ni borra, pero `io.open` sigue leyendo cualquier archivo legible de la imagen (no hay secretos en ella). El análisis bloquea `\directlua`, pero es una lista de bloqueo que `\csname` puede esquivar: el contenedor es la frontera real.
- **Figuras sin antivirus.** Las subidas se validan por extensión, firma binaria y tamaño, y TeX las lee en el sandbox sin red, pero no pasan por un escáner (ClamAV) ni se recodifican. Un PDF malicioso subido como figura llega intacto a quien lo descargue; en el navegador se abre con PDF.js endurecido (sin scripts ni XFA).
- **TeX Live 2022 de Debian bookworm**, no la última versión de TeX Live; las actualizaciones de seguridad llegan con la imagen base.

---

## El problema que resuelve este repositorio

Compilar LaTeX **es ejecutar código arbitrario suministrado por un usuario anónimo**. LaTeX es Turing-completo, lee y escribe ficheros y puede invocar procesos del sistema. Toda la arquitectura de este backend existe para contener ese hecho.

---

## Documentación

| Documento | Contenido |
|---|---|
| [Docs/01-API-y-Documentacion-de-Endpoints.md](Docs/01-API-y-Documentacion-de-Endpoints.md) | Estrategia de documentación de la API y catálogo de los ~93 endpoints |
| [Docs/02-Arquitectura-del-Backend.md](Docs/02-Arquitectura-del-Backend.md) | Estructura del monorepo y arquitectura hexagonal |
| [Docs/03-Estandares-de-Codigo.md](Docs/03-Estandares-de-Codigo.md) | Reglas de escritura de código |
| [AGENTS.md](AGENTS.md) | **Instrucciones obligatorias para agentes de IA** |
| [`securtex-docs`](https://github.com/SecurTex-Devs/securtex-docs) | Requisitos, arquitectura general, modelo de amenazas, datos, plan de proyecto |

---

## Stack objetivo

| Capa | Tecnología | Motivo |
|---|---|---|
| Servicios de negocio | **NestJS 11 + Fastify** | Guards y validación estrictos obligatorios por diseño |
| Componentes de alto riesgo | **Rust + Axum** | Seguridad de memoria donde entra código hostil |
| Tiempo real | **Node 22 + Hocuspocus (Yjs)** | CRDT: un cliente malicioso no puede corromper el estado |
| Identidad | **Keycloak 26** | OIDC, SAML, Google, Microsoft, WebAuthn, sin reimplementar protocolos |
| Base de datos | **PostgreSQL 17 + Row Level Security** | Segunda barrera de autorización |
| Objetos | **MinIO + SSE-KMS** | Cifrado por defecto, autoalojable |
| Secretos y claves | **HashiCorp Vault** | Envelope encryption; la clave maestra nunca toca la aplicación |
| Compilación | **TeX Live full + gVisor** | Kernel independiente para código no confiable |

Justificación completa en [`securtex-docs` · 04-Stack-Tecnologico](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/04-Stack-Tecnologico.md).

---

## Documentación de la API

Tres especificaciones, una por tipo de interfaz:

| Interfaz | Especificación | Dónde se ve |
|---|---|---|
| REST público | **OpenAPI 3.1** generado desde el código | `/api/docs` (Scalar) · `/api/docs-classic` (Swagger UI) |
| Colaboración y eventos | **AsyncAPI 3.0** | `/api/asyncapi` |
| Entre servicios | **Protobuf / gRPC** | `contracts/proto/` (no publicado) |

```bash
pnpm contracts:generate   # Regenera los contratos desde el código
pnpm contracts:lint       # Spectral: reglas de estilo y de seguridad
pnpm contracts:test       # Schemathesis contra la implementación real
pnpm docs:serve           # http://localhost:3000/api/docs
```

> ⚠️ La documentación de la API **está deshabilitada en producción**: un esquema completo es un mapa para un atacante.

---

## Puesta en marcha (arquitectura objetivo)

```bash
git clone https://github.com/SecurTex-Devs/securetex.git
cd securetex/backend
pnpm install
pnpm dev
```

`pnpm dev` levanta con Docker Compose: PostgreSQL, Redis, MinIO, Vault (modo desarrollo), Keycloak con el realm preconfigurado, ClamAV, MailHog y el runner de TeX Live ligero, y siembra datos sintéticos.

**Requisitos:** Node 22 LTS, pnpm 9, Rust estable, Docker con Compose v2.

---

## Comandos

```bash
pnpm dev                  # Entorno completo
pnpm test                 # Unitarias e integración
pnpm test:security        # Suite de casos de abuso
pnpm test:e2e             # Playwright
pnpm lint                 # ESLint + reglas de seguridad
pnpm typecheck            # TypeScript strict
pnpm db:migrate           # Migraciones
pnpm db:seed              # Datos sintéticos
pnpm audit:deps           # Análisis de dependencias
```

Antes de abrir un PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:security`.

---

## Reglas innegociables

1. `shell-escape` está deshabilitado de forma permanente. No se activa por ningún motivo.
2. El código del usuario solo se ejecuta dentro del sandbox de gVisor, sin red.
3. Ningún endpoint existe sin `@Policy(...)`; el guard global deniega por defecto.
4. Toda tabla con datos de usuario tiene Row Level Security **forzada**.
5. Nunca se concatena SQL.
6. Ningún secreto entra en el repositorio.
7. Todo endpoint nuevo trae su prueba de acceso cruzado.

Desarrollo completo en [AGENTS.md](AGENTS.md) y [Docs/03-Estandares-de-Codigo.md](Docs/03-Estandares-de-Codigo.md).

---

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md). Ramas protegidas, commits firmados, una aprobación mínima, y revisión del responsable de seguridad para todo lo que toque autenticación, criptografía o el sandbox.

## Seguridad

¿Has encontrado una vulnerabilidad? [SECURITY.md](SECURITY.md). No abras un *issue* público.
