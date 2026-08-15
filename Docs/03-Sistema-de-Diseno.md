# 03 — Sistema de Diseño

> **Repositorio:** `securtex-frontend`
> **Base:** Tailwind CSS 4 + Radix UI primitives + tokens propios
> **Versión:** 1.0

---

## 1. Principios de diseño

| # | Principio | Aplicación |
|---|---|---|
| 1 | **La densidad al servicio del trabajo** | Un editor académico se usa durante horas: prima el contenido visible sobre el aire decorativo |
| 2 | **El color nunca comunica solo** | Todo estado transmitido por color lleva además texto o icono (WCAG 1.4.1) |
| 3 | **Estados de seguridad reconocibles** | Un bloqueo por seguridad tiene un lenguaje visual propio y consistente |
| 4 | **Sin sorpresas** | Un mismo componente se comporta igual en toda la aplicación |
| 5 | **Accesible por construcción** | Se parte de primitivas accesibles; no se «arregla» después |
| 6 | **Claro y oscuro son iguales de importantes** | Se escribe la aplicación en ambos temas desde el primer día |

---

## 2. Tokens

### 2.1 Color

Definidos como variables CSS en `:root` y redefinidos en `[data-theme="dark"]`.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#f6f7f9` | `#0d1117` | Fondo de la aplicación |
| `--surface` | `#ffffff` | `#161b22` | Tarjetas, paneles, editor |
| `--surface-2` | `#f0f2f5` | `#1c2129` | Cabeceras de panel, barras |
| `--surface-3` | `#e4e7ec` | `#262c36` | Fondos hundidos, etiquetas |
| `--border` | `#d5d9e0` | `#30363d` | Separadores |
| `--text` | `#1a1f29` | `#e6edf3` | Texto principal |
| `--text-2` | `#545c6b` | `#9198a1` | Texto secundario |
| `--text-3` | `#8a93a3` | `#6e7681` | Texto terciario, marcas de agua |
| `--brand` | `#2f5fd9` | `#4f81f7` | Acción principal, foco, enlaces |
| `--ok` | `#1a7f45` | `#3fb950` | Éxito, compilación correcta |
| `--warn` | `#9a6700` | `#d29922` | Advertencia, pendiente |
| `--danger` | `#b3261e` | `#f85149` | Error, destrucción |
| `--sec` | `#6b2fb3` | `#a371f7` | **Control de seguridad** |

**Contraste verificado:** todas las combinaciones de texto sobre superficie superan 4.5:1 (texto normal) y 3:1 (texto grande y elementos de interfaz), en ambos temas. Se comprueba automáticamente en el CI.

### 2.2 Color de colaborador

Cuatro colores asignados por orden de entrada a la sala, usados de forma **consistente** en cursor, selección, comentario y cambio rastreado:

`--u1` azul · `--u2` verde · `--u3` rojo · `--u4` ámbar

Con más de cuatro colaboradores simultáneos se genera un tono derivado del identificador de usuario, garantizando contraste mínimo con el fondo. **El nombre siempre acompaña al color**: nadie debe depender del color para saber quién escribe.

### 2.3 Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Interfaz | `system-ui` con la pila del sistema | Todo salvo el código |
| Código | `ui-monospace` / JetBrains Mono | Editor, registros, tokens, identificadores |
| Documento | Serif | Solo dentro del modo visual y la vista previa del PDF |

Escala: 11 · 12 · 13 · 14 · 16 · 19 · 22 · 26 px. Interlineado 1.55 en prosa, 1.75 en el editor de código.

> El texto **nunca** baja de 12 px, y la interfaz respeta el tamaño de fuente configurado por el usuario en el navegador (unidades relativas).

### 2.4 Espaciado, radios y sombras

Espaciado en múltiplos de 4 px. Radios: 5 px (controles), 8 px (tarjetas), 10 px (diálogos y ventanas), 50 % (avatares). Dos niveles de sombra: elevación de tarjeta y elevación de diálogo. No hay más.

---

## 3. Componentes

Todos se construyen sobre **primitivas de Radix UI**, que resuelven foco, teclado y ARIA correctamente.

| Componente | Primitiva | Estados obligatorios |
|---|---|---|
| Botón | nativo | reposo · hover · foco · activo · deshabilitado · cargando |
| Campo de texto | nativo | reposo · foco · error · deshabilitado · solo lectura |
| Selector | Radix Select | + abierto · sin opciones |
| Casilla y conmutador | Radix Checkbox / Switch | + indeterminado |
| Diálogo | Radix Dialog | foco atrapado · `Esc` · retorno de foco |
| Menú contextual | Radix DropdownMenu | navegación con flechas · `Home`/`End` |
| Pestañas | Radix Tabs | activación manual, no automática |
| Aviso emergente | Radix Toast | con `role="status"` o `role="alert"` según severidad |
| Descripción emergente | Radix Tooltip | accesible por teclado; nunca única fuente de información |
| Avatar | propio | con iniciales y `alt` con el nombre completo |
| Etiqueta de estado | propio | color + texto siempre |

### 3.1 Anatomía de un botón

| Variante | Uso | Cuántos por pantalla |
|---|---|---|
| `primary` | La acción principal | **Como máximo uno** |
| `default` | Acciones secundarias | Los necesarios |
| `ghost` | Acciones terciarias, dentro de listas | Los necesarios |
| `danger` | Acciones destructivas | Siempre con confirmación previa |

Un botón que dispara una acción de más de 300 ms **debe** mostrar estado de carga y quedar inhabilitado para evitar el doble envío.

### 3.2 Lenguaje visual de la seguridad

Los estados de seguridad tienen tratamiento propio y reconocible:

| Situación | Tratamiento |
|---|---|
| Control activo y correcto | Etiqueta `ok` con icono 🛡️ (ej. «Análisis superado») |
| Acción que requiere reautenticación | Aviso `info` explicando por qué antes de pedirla |
| Compilación bloqueada | Panel `danger` con hallazgos concretos, línea y **alternativa** |
| Modo confidencial | Etiqueta `sec` persistente en la barra del proyecto |
| Archivo en cuarentena | Etiqueta `warn` en el árbol y acciones inhabilitadas con motivo |

**Regla de tono:** el mensaje explica **qué ha pasado y qué hacer**. Nunca acusa al usuario ni sugiere que ha hecho algo malicioso: la mayoría de los bloqueos serán errores honestos.

---

## 4. Distribución

| Región | Comportamiento |
|---|---|
| Barra de aplicación | Fija, 44 px, siempre visible |
| Barra lateral | 190–210 px, colapsable, con estado persistido |
| Paneles del editor | Redimensionables por arrastre **y por teclado**, con proporciones guardadas por proyecto |
| Barra de estado | 30 px, muestra el resultado de la compilación y el estado de conexión |

Puntos de ruptura: 360 · 768 · 1024 · 1280 px. Comportamiento detallado en [04-Interfaces-y-Mockups.md §4](04-Interfaces-y-Mockups.md).

---

## 5. Movimiento

| Regla | Detalle |
|---|---|
| Duración | 120 ms (microinteracciones) · 200 ms (paneles y diálogos) |
| Curva | `cubic-bezier(.2,0,0,1)` |
| Sin animación | Cambios de contenido del editor y del PDF: distraen durante el trabajo |
| `prefers-reduced-motion` | Se desactivan todas las transiciones y los esqueletos quedan estáticos |

---

## 6. Contenido y redacción

| Regla | Ejemplo correcto | Ejemplo incorrecto |
|---|---|---|
| Voz directa, en segunda persona | «No hemos podido compilar el documento» | «Ha ocurrido un error en el proceso de compilación» |
| El error dice qué hacer | «Elige otra contraseña: esta aparece en filtraciones» | «Contraseña no válida» |
| Sin jerga innecesaria | «Enlace caducado» | «Token JWT expirado (exp claim)» |
| Sin culpar | «No hemos compilado este documento» | «Tu documento contiene código peligroso» |
| Sin detalles internos | «Algo ha salido mal · ref. 4bf92f35» | Traza de pila |
| Botones con verbo concreto | «Eliminar proyecto» | «Aceptar» |

**Idioma:** español de Ecuador como base, inglés como segunda lengua completa. Toda cadena pasa por el sistema de i18n desde el primer commit; ninguna se escribe directamente en un componente.

---

## 7. Iconografía

Conjunto único (Lucide), trazo de 1.5 px, tamaños 14 · 16 · 20 px. Todo icono que actúe como único contenido de un control lleva `aria-label`. Los iconos decorativos llevan `aria-hidden="true"`.

---

## 8. Implementación

```
src/shared/ui/
├── tokens.css          Variables CSS de ambos temas
├── button.tsx
├── input.tsx
├── dialog.tsx
├── dropdown.tsx
├── toast.tsx
├── tag.tsx
├── avatar.tsx
├── skeleton.tsx
└── ...
```

**Reglas:**

1. Ningún componente de una `feature` define colores propios: solo usa tokens.
2. Ningún valor de color aparece escrito directamente en un componente.
3. Todo componente nuevo se acompaña de su historia en Storybook con **todos** sus estados.
4. Todo componente nuevo pasa `axe-core` sin violaciones antes de fusionarse.

---

## 9. Documentos relacionados

- [04-Interfaces-y-Mockups.md](04-Interfaces-y-Mockups.md) — las 47 pantallas que aplican este sistema
- [06-Accesibilidad-e-i18n.md](06-Accesibilidad-e-i18n.md)
- [`mockups/assets/mockup.css`](mockups/assets/mockup.css) — implementación de referencia de los tokens
