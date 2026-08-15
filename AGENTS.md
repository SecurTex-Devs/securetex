# AGENTS.md — Instrucciones para agentes de IA · Frontend

> Lo leen Claude Code, Cursor, Copilot, Codex y cualquier otro asistente antes de tocar este repositorio.
> **Estas reglas son obligatorias.** Un cambio que las incumpla se rechaza en revisión, lo haya escrito una persona o una IA.

---

## 0. Lo primero que debes saber

**El cliente nunca es la frontera de seguridad.** El navegador está bajo control del usuario: puede editar el DOM, interceptar peticiones y leer todo lo que le enviemos.

De ahí se deducen dos reglas que gobiernan todo este repositorio:

1. **Ocultar un botón no es autorizar.** Toda restricción de la interfaz existe también en el servidor. Si escribes una comprobación de permisos aquí, es cortesía visual, no un control.
2. **Nuestra responsabilidad es no crear vulnerabilidades**: no introducir XSS, no filtrar tokens y no dejar datos sensibles en el dispositivo.

Antes de escribir código lee:

1. [`Docs/01-Arquitectura-Frontend.md`](Docs/01-Arquitectura-Frontend.md)
2. [`Docs/02-Seguridad-en-el-Cliente.md`](Docs/02-Seguridad-en-el-Cliente.md) ← imprescindible
3. [`Docs/03-Sistema-de-Diseno.md`](Docs/03-Sistema-de-Diseno.md)
4. [`Docs/mockups/index.html`](Docs/mockups/index.html) — la pantalla que vas a tocar ya está especificada

---

## 1. Prohibiciones absolutas

| # | Prohibido | Por qué |
|---|---|---|
| 1 | `dangerouslySetInnerHTML` sin pasar por `DOMPurify` | XSS almacenado |
| 2 | `eval`, `new Function`, `setTimeout` con cadena | Ejecución de código arbitrario |
| 3 | Guardar tokens en `localStorage` o `sessionStorage` | Un XSS los roba (T-A03) |
| 4 | Poner un token en la URL o en una query string | Queda en registros, historial y `Referer` |
| 5 | Renderizar un `href` sin pasar por `safeUrl()` | `javascript:` y `data:` |
| 6 | Añadir un recurso de un CDN o dominio externo | La CSP lo bloquea; cada tercero ejecuta código en la página |
| 7 | Escribir tipos de la API a mano | Se generan del contrato; escribirlos oculta la desincronización |
| 8 | Escribir una cadena de texto directamente en un componente | Rompe la i18n; el lint falla |
| 9 | Confiar en el rol del usuario para decidir algo relevante | La autorización es del servidor |
| 10 | Eliminar el anillo de foco (`outline: none` sin sustituto) | Rompe la accesibilidad por teclado |

---

## 2. Arquitectura que debes respetar

```
app/            Rutas (App Router)
src/
├── features/   Módulos verticales por dominio
├── shared/
│   ├── ui/         Sistema de diseño
│   ├── api/        Cliente generado + interceptores
│   ├── hooks/
│   ├── lib/        Utilidades puras
│   └── security/   Sanitizado, safeUrl, esquemas
└── styles/
```

**Regla de dependencias:** una `feature` importa de `shared`, **nunca** de otra `feature`. Si dos features necesitan lo mismo, ese código sube a `shared`. Se verifica en CI con `dependency-cruiser`.

### 2.1 Cuatro estados, cuatro herramientas

| Estado | Herramienta | Nunca |
|---|---|---|
| Del servidor | TanStack Query | Copiarlo a Zustand |
| Colaborativo (documento) | Yjs | Duplicarlo en otro sitio |
| De la interfaz | Zustand | Guardar en él datos del servidor |
| De la URL | Parámetros de búsqueda | Guardar filtros solo en memoria |

### 2.2 Todo componente asíncrono define tres estados

Cargando, error **y vacío**. Un componente que solo implementa el camino feliz no está terminado y se rechaza en revisión.

---

## 3. Reglas por tipo de cambio

### 3.1 Componente del sistema de diseño

- [ ] Construido sobre una primitiva de **Radix UI** si existe (no reimplementes diálogos, menús ni selects)
- [ ] Solo usa **tokens** de color; ningún valor hexadecimal escrito en el componente
- [ ] Funciona con teclado, con foco visible y contraste ≥ 3:1
- [ ] Correcto en tema claro **y** oscuro
- [ ] Respeta `prefers-reduced-motion`
- [ ] Objetivo táctil ≥ 24×24 px
- [ ] Historia de Storybook con todos los estados
- [ ] Cero violaciones de `axe-core`

### 3.2 Pantalla o feature nueva

- [ ] La pantalla existe en los mockups (`Docs/mockups/`); si no, **añádela primero** con su identificador `P-xx`
- [ ] Estados de carga, error y vacío
- [ ] Cada `kind` de error de la API tiene tratamiento visible
- [ ] Todas las cadenas en el sistema de i18n (español e inglés)
- [ ] Prueba de integración con MSW y prueba E2E del camino principal
- [ ] Documento [`Docs/04-Interfaces-y-Mockups.md`](Docs/04-Interfaces-y-Mockups.md) actualizado

### 3.3 Integrar un endpoint

- [ ] `pnpm api:sync` ejecutado; tipos regenerados, no escritos
- [ ] Hook de consulta o mutación en la feature correspondiente
- [ ] Clave de consulta jerárquica; invalidación por prefijo tras la mutación
- [ ] Sin `invalidateQueries()` sin argumentos
- [ ] Errores tipados tratados uno a uno

### 3.4 Tocar sesión, tokens o renderizado de contenido de usuario

⚠️ Requiere revisión adicional.

- [ ] Ningún token sale de memoria
- [ ] Todo contenido de terceros pasa por escapado o `DOMPurify`
- [ ] Prueba añadida a `e2e/security/`

---

## 4. Estilo de código

| Regla | Detalle |
|---|---|
| TypeScript `strict` | Sin `any` implícito ni explícito; usa `unknown` y estrecha |
| Sin `!` (non-null assertion) | Salvo tras una comprobación evidente en la línea anterior |
| Sin `// @ts-ignore` | `@ts-expect-error` con justificación, si es inevitable |
| Componentes de función con props tipadas | Nada de `React.FC` |
| Un componente por archivo, nombrado igual que el archivo | — |
| Funciones ≤ 40 líneas; componentes ≤ 150 | Si crece, extrae |
| Nombres en inglés | Identificadores y ficheros; los textos visibles van en i18n |
| Sin comentarios que repiten el código | Comenta el **porqué**, sobre todo en decisiones de seguridad |
| Sin lógica de negocio en los componentes | Va en hooks o en `lib` |
| Consultas de test por rol y nombre accesible | Nada de `data-testid` salvo último recurso |

### 4.1 Ejemplo del patrón esperado

```tsx
// ✅ CORRECTO
export function ProjectList() {
  const { data, isLoading, error } = useProjects();
  const t = useTranslations('projects');

  if (isLoading) return <ProjectListSkeleton />;
  if (error)     return <ApiErrorView error={error} />;
  if (data.items.length === 0) return <EmptyProjects />;

  return (
    <ul aria-label={t('list.label')}>
      {data.items.map((p) => <ProjectRow key={p.id} project={p} />)}
    </ul>
  );
}
```

```tsx
// ❌ INCORRECTO
export function ProjectList() {
  const { data } = useProjects();                    // sin estados de carga ni error
  return <div dangerouslySetInnerHTML={{            // XSS
    __html: data.map(p => `<div>${p.name}</div>`).join('')
  }} />;
}
```

---

## 5. Accesibilidad: no es opcional

Cada cambio con interfaz debe cumplir la lista de [`Docs/06-Accesibilidad-e-i18n.md §6`](Docs/06-Accesibilidad-e-i18n.md). El CI bloquea el merge ante cualquier violación crítica o seria de `axe-core`.

Errores frecuentes que **no** deben aparecer:

- `<div onClick>` en lugar de `<button>`
- Icono como único contenido de un control sin `aria-label`
- Estado transmitido solo por color
- Diálogo sin foco atrapado ni retorno de foco
- Mensaje de error que no se anuncia ni recibe el foco

---

## 6. Commits y pull requests

```
feat(editor): añade el panel de control de cambios
fix(auth): evita el bucle de refresco tras un 401 repetido
sec(pdf): deshabilita el scripting embebido en PDF.js
a11y(dialog): devuelve el foco al botón que abrió el diálogo
docs(mockups): añade la pantalla P-47 de compilación bloqueada
```

Prefijos: `feat`, `fix`, `sec`, `a11y`, `perf`, `refactor`, `test`, `docs`, `chore`. **Commits firmados obligatorios.**

En el PR, responde siempre:

1. ¿Qué pantalla de los mockups implementa o modifica?
2. ¿Qué estados (carga, error, vacío) has cubierto?
3. ¿Es accesible por teclado y con lector de pantalla?

---

## 7. Comandos

```bash
pnpm dev              # Servidor de desarrollo
pnpm build            # Build de producción
pnpm test             # Unitarias e integración
pnpm test:e2e         # Playwright
pnpm test:security    # Suite de seguridad del cliente
pnpm test:a11y        # axe-core
pnpm lint             # ESLint + reglas de seguridad y de i18n
pnpm typecheck        # TypeScript strict
pnpm api:sync         # Regenera los tipos desde el contrato del backend
pnpm api:check        # Falla si los tipos están desactualizados
pnpm storybook        # Sistema de diseño
pnpm size             # Presupuesto de tamaño del bundle
```

Antes de dar por terminado un cambio: `pnpm lint && pnpm typecheck && pnpm test && pnpm api:check`.

---

## 8. Qué hacer si dudas

| Situación | Qué hacer |
|---|---|
| No sabes si algo compromete la seguridad | **Asume que sí.** Pregunta antes de implementarlo |
| Necesitas una dependencia nueva | Justifícala en el PR: alternativas, mantenimiento, tamaño, dependencias transitivas |
| El diseño de una pantalla no está definido | Añádela primero a los mockups y acuérdala; no improvises en el código |
| Falta un endpoint en el backend | Ábrelo como *issue* en `texguard-backend`; no simules la respuesta en producción |
| El contrato de la API te bloquea | Coordina el PR con el del backend; nunca escribas el tipo a mano |
| Falta información (una medida, un texto) | Márcalo como `⚠️ POR DEFINIR`. **No inventes valores** |

---

## 9. Contexto de producto, en una frase

Una estudiante escribe su tesis durante meses en esta pantalla; su directora la revisa desde otro país al mismo tiempo. La interfaz tiene que ser rápida, predecible, usable con teclado y lectores de pantalla, y no debe filtrar nada de lo que el servidor le confía.
