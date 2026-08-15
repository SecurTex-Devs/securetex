# texguard-frontend

Frontend de **TeXGuard**, editor LaTeX colaborativo seguro: aplicación web, editor de código, visor PDF, colaboración en tiempo real y sistema de diseño.

> Proyecto final de la asignatura *Seguridad de Software* · Universidad Técnica de Ambato
> **Estado: planificación aprobada, implementación pendiente (Sprint 0).**

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
| [`texguard-docs`](https://github.com/SecurTex-Devs/securtex-docs) | Requisitos, arquitectura general, modelo de amenazas, plan |

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
git clone https://github.com/SecurTex-Devs/securtex-frontend.git
cd texguard-frontend
cp .env.example .env.local
pnpm install
pnpm api:sync      # genera los tipos desde el contrato del backend
pnpm dev
```

**Requisitos:** Node 22 LTS, pnpm 9. Para el desarrollo completo, el backend levantado con `pnpm dev` en su repositorio.

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
