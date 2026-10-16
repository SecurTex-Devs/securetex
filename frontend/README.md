# securtex-frontend

Frontend de **SecurTex**, editor LaTeX colaborativo seguro: aplicación web, editor de código, visor PDF, colaboración en tiempo real y sistema de diseño.

> Proyecto final de la asignatura *Seguridad de Software* · Universidad Técnica de Ambato
> **Estado: primera entrega funcional conectada a la API real.** Ver [Estado de esta entrega](#estado-de-esta-entrega).

---

## Estado de esta entrega

### Arrancar

La forma recomendada es la pila completa desde la **raíz del repositorio** (construye también esta aplicación):

```bash
cd ..
cp .env.example .env    # rellena los secretos
docker compose up --build -d   # http://localhost:3000
```

Para desarrollar solo el frontend contra esa API: `pnpm install`, copiar `.env.example` a `.env.local` y `pnpm dev`. Tras cambiar endpoints en el backend: `pnpm api:sync` (copia `contracts/openapi.json` y regenera los tipos; nunca se escriben a mano).

### Stack real

Next 15 (App Router) · React 19 · Tailwind 4 con los tokens «Papel y tinta» · Radix · TanStack Query · Zustand · `openapi-fetch` con tipos generados · CodeMirror 6 · KaTeX + DOMPurify. Arquitectura por *features* (`src/features/*` nunca se importan entre sí; lo común vive en `src/shared`).

### Qué funciona de verdad

- **Acceso**: registro, verificación por correo, inicio de sesión con bloqueo tras intentos fallidos, recuperación, Google/Microsoft (si se configuran, ver el README del backend), segundo factor TOTP y códigos de recuperación.
- **Proyectos**: listado con filtros, búsqueda, etiquetas, vista en cuadrícula o lista; crear en blanco o desde las 5 plantillas del equipo; archivar, papelera, compartir por correo con roles.
- **Editor colaborativo**: varias personas en el mismo archivo a la vez (Yjs), con cursores y selecciones de cada una, avatares de quién está conectado y en qué archivo, y deshacer que solo deshace lo propio. Sin conexión se sigue escribiendo y se sincroniza al volver. Si te revocan el acceso, la sala se cierra al instante.
- **Paleta de comandos LaTeX** (botón «Comandos» de la barra): búsqueda por nombre o comando, vista previa, y al hacer clic el comando se inserta con el cursor en el primer hueco por rellenar (Tab salta al siguiente; si había texto seleccionado, ocupa el primer hueco). **Personalizable**: cada persona puede cambiar la plantilla de cualquier comando, crear los suyos u ocultar los que no usa; se guardan cifrados en su cuenta y la siguen en cualquier equipo.
- **Cifrado de extremo a extremo con el servicio**: todo lo que se escribe viaja en tramas C1 (AES-256-GCM) dentro de C2 (X25519 + ChaCha20-Poly1305) y se verifica al recibir (C5) antes de mostrarse. El indicador «Guardado y cifrado» explica las cinco capas.
- **Compilar**: el servidor analiza el proyecto (P-47 si bloquea, con la línea exacta y una alternativa) y compila con TeX Live en un sandbox sin red. El PDF llega firmado con Ed25519, se verifica (C4b) y se muestra con PDF.js endurecido; también se puede descargar, y el registro de compilación muestra errores y avisos. **SyncTeX sobre el PDF real**: doble clic en un párrafo abre su archivo y su línea en el editor, y «Ver en la vista previa» (barra del editor) lleva desde el cursor a la página y resalta las líneas. El mapa llega con firma Ed25519 propia, atada al PDF, y se verifica antes de usarlo. Mientras se escribe, la vista rápida se compone en el navegador, también con SyncTeX en ambos sentidos.
- **Figuras**: botón «Subir» o arrastrar al árbol (PNG, JPG o PDF de hasta 5 MB). Se guardan en `figuras/` con un nombre seguro y la vista previa ofrece «Copiar \includegraphics»; la figura sale en el PDF compilado.
- **Historial**: botón de reloj de la barra. Lista las versiones de cada archivo con autor y hora, muestra las diferencias con el texto actual y restaura una versión, que llega al instante a quienes estén editando. Por debajo de 1280 px el panel se superpone al PDF.
- **Recuento de palabras** del documento (sigue los `\input`, sin comandos ni fórmulas) en la barra de estado, y corrector ortográfico del navegador en español.
- **Copia y .zip**: desde el menú de cada proyecto, «Hacer una copia» (proyecto propio con su clave) y «Descargar código fuente (.zip)», que se genera en el navegador con el contenido sellado.
- **Cuenta**: perfil, sesiones activas, actividad, preferencias del editor, vincular y desvincular Google/Microsoft, y exportación de todos tus datos en JSON (llegan sellados y se abren en el navegador).
- **Administración**: resumen calculado con datos reales, gestión de cuentas (suspender/reactivar) y auditoría con verificación de la cadena.

### Fuera del alcance

Chat, comentarios, control de cambios, modo confidencial (clave que el servidor nunca recibe), importación .zip/GitHub, tokens de aplicación, passkeys, SAML, métricas y moderación. Los mockups de `Docs/mockups` siguen describiendo el diseño completo como referencia.

---

## 📐 Prototipo de las 50 pantallas

**[`Docs/mockups/index.html`](Docs/mockups/index.html)** — ábrelo con doble clic. No necesita servidor, dependencias ni conexión.

Incluye las 50 pantallas del producto en 8 grupos, con sus estados, sus anotaciones de seguridad y de accesibilidad, modo claro y oscuro, y trazabilidad a requisitos y casos de uso.

| Grupo | Pantallas |
|---|---|
| [1 · Acceso e identidad](Docs/mockups/01-acceso.html) | P-01 … P-07 |
| [2 · Panel de proyectos](Docs/mockups/02-panel.html) | P-08 … P-13 |
| [3 · Editor](Docs/mockups/03-editor.html) | P-14 … P-26 |
| [4 · Cuenta y seguridad](Docs/mockups/04-cuenta.html) | P-27 … P-34 |
| [5 · Plantillas](Docs/mockups/05-plantillas.html) | P-35 … P-37 |
| [6 · Administración](Docs/mockups/06-administracion.html) | P-38 … P-41 |
| [7 · Estados transversales](Docs/mockups/07-estados.html) | P-42 … P-47 |
| [8 · Cifrado 🔐](Docs/mockups/08-cifrado.html) | P-48 … P-50 |

---

## Documentación

| Documento | Contenido |
|---|---|
| [Docs/01-Arquitectura-Frontend.md](Docs/01-Arquitectura-Frontend.md) | Estructura, estado, editor, rendimiento |
| [Docs/02-Seguridad-en-el-Cliente.md](Docs/02-Seguridad-en-el-Cliente.md) | XSS, CSP, tokens, almacenamiento, PDF.js |
| [Docs/03-Sistema-de-Diseno.md](Docs/03-Sistema-de-Diseno.md) | Tokens, componentes, redacción |
| [Docs/04-Interfaces-y-Mockups.md](Docs/04-Interfaces-y-Mockups.md) | Inventario de pantallas y decisiones de interacción |
| [Docs/05-Integracion-con-la-API.md](Docs/05-Integracion-con-la-API.md) | Contrato generado, errores, WebSocket |
| [Docs/06-Accesibilidad-e-i18n.md](Docs/06-Accesibilidad-e-i18n.md) | WCAG 2.2 AA e internacionalización |
| [Docs/07-Testing-Frontend.md](Docs/07-Testing-Frontend.md) | Estrategia de pruebas |
| [Docs/08-Criptografia-en-el-Cliente.md](Docs/08-Criptografia-en-el-Cliente.md) | **Capas C1, C2 y C5**: cifrado al guardar, sobre de envío y descifrado |
| [AGENTS.md](AGENTS.md) | **Instrucciones obligatorias para agentes de IA** |
| [`securtex-docs`](https://github.com/SecurTex-Devs/securtex-docs) | Requisitos, arquitectura general, modelo de amenazas, plan |

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 15 + React 19 + TypeScript strict** |
| Editor | **CodeMirror 6** con gramática LaTeX y BibTeX propia |
| Colaboración | **Yjs** (CRDT) + `y-codemirror.next` |
| Visor PDF | **PDF.js** endurecido: sin scripting, sin `eval`, en Web Worker |
| Interfaz | **Tailwind CSS 4 + Radix UI** |
| Estado del servidor | **TanStack Query** |
| Estado de interfaz | **Zustand** |
| Validación | **Zod**, compartida con el backend |
| Criptografía | **WebCrypto** (AES-256-GCM) · **X25519 + ChaCha20-Poly1305** · **Argon2id** (WASM) |
| Pruebas | Vitest · Testing Library · Playwright · axe-core |

---

## Puesta en marcha

```bash
git clone https://github.com/SecurTex-Devs/securetex.git
cd securetex/frontend
cp .env.example .env.local
pnpm install
pnpm api:sync      # genera los tipos desde el contrato del backend
pnpm dev
```

**Requisitos:** Node 22 LTS, pnpm 9. Para el desarrollo completo, la pila levantada desde la raíz con `docker compose up -d`.

---

## Comandos

```bash
pnpm dev              # Servidor de desarrollo
pnpm build            # Build de producción
pnpm test             # Unitarias e integración
pnpm test:e2e         # Playwright
pnpm test:security    # Suite de seguridad del cliente
pnpm test:a11y        # axe-core
pnpm lint             # ESLint + reglas de seguridad e i18n
pnpm typecheck        # TypeScript strict
pnpm api:sync         # Regenera los tipos de la API
pnpm api:check        # Falla si están desactualizados
pnpm storybook        # Sistema de diseño
pnpm size             # Presupuesto de tamaño del bundle
```

Antes de abrir un PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm api:check`.

---

## Reglas innegociables

1. **El cliente no es la frontera de seguridad.** Ocultar un botón no es autorizar.
2. Ningún token en `localStorage`, `sessionStorage` ni en la URL.
3. Nada de `dangerouslySetInnerHTML` sin `DOMPurify`.
4. Los tipos de la API se **generan**, no se escriben.
5. Ninguna cadena de texto fuera del sistema de i18n.
6. Cero recursos de dominios externos: la CSP los bloquea.
7. Cero violaciones críticas de accesibilidad: bloquean el merge.
8. Nadie llama a `crypto.subtle` fuera de `src/shared/crypto`.

Desarrollo completo en [AGENTS.md](AGENTS.md).

---

## Presupuestos verificados en CI

| Métrica | Límite |
|---|---|
| Bundle inicial sin editor | < 250 KB comprimido |
| LCP en 4G simulada | < 2,5 s |
| INP | < 200 ms |
| Lighthouse · accesibilidad | ≥ 95 |
| Violaciones de axe-core | 0 críticas o serias |

---

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md). Ramas protegidas, commits firmados y una aprobación mínima.

## Seguridad

[SECURITY.md](SECURITY.md). No abras un *issue* público para una vulnerabilidad.
