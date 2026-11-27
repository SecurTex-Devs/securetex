# 04 — Interfaces y Mockups

> **Repositorio:** `securtex-frontend`
> **Prototipo navegable:** [`mockups/index.html`](mockups/index.html) — ábrelo con doble clic, no necesita servidor ni dependencias
> **Versión:** 1.0

---

## 1. Qué contiene el prototipo

50 pantallas especificadas y maquetadas en HTML estático, organizadas en 8 grupos. Cada pantalla incluye:

- La **estructura y jerarquía de información** definitivas.
- Los **estados** relevantes (vacío, cargando, error, sin permisos, sin conexión).
- Anotaciones de **seguridad**: qué control se aplica y qué amenaza del modelo STRIDE mitiga.
- Anotaciones de **accesibilidad**: requisitos WCAG 2.2 AA concretos y verificables.
- **Trazabilidad** al requisito (`RF-xxx`) y al caso de uso (`CU-xx`) que implementa.

```
Docs/mockups/
├── index.html                Portada, índice, leyenda y trazabilidad
├── 01-acceso.html            P-01 … P-07
├── 02-panel.html             P-08 … P-13
├── 03-editor.html            P-14 … P-26
├── 04-cuenta.html            P-27 … P-34
├── 05-plantillas.html        P-35 … P-37
├── 06-administracion.html    P-38 … P-41
├── 07-estados.html           P-42 … P-47
├── 08-cifrado.html           P-48 … P-50
└── assets/
    ├── mockup.css            Tokens y componentes del prototipo
    └── mockup.js             Navegación, tema claro/oscuro, anotaciones
```

**Controles del prototipo:** la barra superior permite navegar entre grupos, alternar entre modo claro y oscuro (el mismo comportamiento que tendrá el producto) y ocultar o mostrar las anotaciones.

---

## 2. Inventario de pantallas

### Grupo 1 · Acceso e identidad

| ID | Pantalla | Requisitos | Caso de uso |
|---|---|---|---|
| P-01 | Portada pública | RF-110 | — |
| P-02 | Registro | RF-001, RF-010 | CU-01 |
| P-03 | Verificación de correo | RF-001 | CU-01 |
| P-04 | Inicio de sesión (Google, Microsoft, SSO, contraseña) | RF-002, RF-003, RF-004 | CU-02 |
| P-05 | Segundo factor (passkey y TOTP) | RF-006 | CU-02, CU-03 |
| P-06 | Recuperar contraseña | RF-007 | CU-01 |
| P-07 | Establecer nueva contraseña | RF-007 | CU-01 |

### Grupo 2 · Panel de proyectos

| ID | Pantalla | Requisitos | Caso de uso |
|---|---|---|---|
| P-08 | Lista de proyectos | RF-021, RF-022 | CU-10 |
| P-09 | Panel vacío | RNF-030 | — |
| P-10 | Nuevo proyecto | RF-020 | CU-10, CU-11 |
| P-11 | Importar proyecto (`.zip`) | RF-020 | CU-12 |
| P-12 | Gestión de etiquetas | RF-022 | CU-13 |
| P-13 | Papelera y archivados | RF-023 | CU-18 |

### Grupo 3 · Editor

| ID | Pantalla | Requisitos | Caso de uso |
|---|---|---|---|
| P-14 | Editor · vista dividida | RF-040, RF-050, RF-070 | CU-20, CU-25 |
| P-15 | Árbol de archivos y menú contextual | RF-030, RF-035 | CU-17 |
| P-16 | Autocompletado y corrección | RF-041, RF-044, RF-048 | CU-20 |
| P-17 | Modo visual | RF-046, RF-047 | CU-20 |
| P-18 | Panel de compilación | RF-053, RF-058 | CU-21, CU-23 |
| P-19 | Visor PDF y SyncTeX | RF-060, RF-061 | CU-22 |
| P-20 | Comentarios | RF-080 | CU-30 |
| P-21 | Control de cambios | RF-081, RF-082 | CU-30 |
| P-22 | Historial de versiones | RF-090 … RF-092 | CU-35 |
| P-23 | Chat del proyecto | RF-074 | CU-25 |
| P-24 | Compartir proyecto | RF-026, RF-027 | CU-14 |
| P-25 | Ajustes del proyecto | RF-035, RF-051 | CU-19 |
| P-26 | Paleta de símbolos y generador de tablas | RF-047 | CU-24 |

### Grupo 4 · Cuenta y seguridad

| ID | Pantalla | Requisitos | Caso de uso |
|---|---|---|---|
| P-27 | Perfil | RF-012 | CU-04 |
| P-28 | Seguridad y sesiones activas | RF-008 | CU-05 |
| P-29 | Segundo factor y passkeys | RF-006 | CU-03 |
| P-30 | Cuentas vinculadas | RF-005 | CU-06 |
| P-31 | Tokens de aplicación | RF-013 | CU-09 |
| P-32 | Preferencias del editor | RF-043, RF-045 | CU-20 |
| P-33 | Suscripción y plan | RF-130 | — |
| P-34 | Mis datos y eliminación de cuenta | RF-011 | CU-07, CU-08 |

### Grupo 5 · Plantillas

| ID | Pantalla | Requisitos | Caso de uso |
|---|---|---|---|
| P-35 | Galería de plantillas | RF-110, RF-113 | CU-11 |
| P-36 | Ficha de plantilla | RF-110, RF-111 | CU-11 |
| P-37 | Publicar plantilla | RF-112 | CU-45 |

### Grupo 6 · Administración

| ID | Pantalla | Requisitos | Caso de uso |
|---|---|---|---|
| P-38 | Panel de métricas | RF-133 | CU-60 |
| P-39 | Gestión de usuarios | RF-133 | CU-60 |
| P-40 | Moderación de plantillas | RF-112 | CU-45 |
| P-41 | Registro de auditoría | RS-050, RS-051 | CU-65 |

### Grupo 7 · Estados transversales

| ID | Pantalla | Requisitos |
|---|---|---|
| P-42 | Carga (esqueletos) | RNF-001 |
| P-43 | Error del servidor | RNF-031 |
| P-44 | Sin permisos / no encontrado | RF-025 |
| P-45 | Sin conexión | RF-072 |
| P-46 | Mantenimiento | RF-133 |
| P-47 | **Compilación bloqueada por seguridad** | RS-041 |

### Grupo 8 · Cifrado

| ID | Pantalla | Requisitos | Capa |
|---|---|---|---|
| P-48 | Guardado cifrado (`Ctrl+S`) | RS-070, RS-072 | C1 · C2 |
| P-49 | Modo confidencial y claves de recuperación | RS-079, RF-150 | C1 |
| P-50 | Contenido no verificable | RS-076, RS-077 | C4 · C5 |

---

## 3. Decisiones de diseño de interacción

### 3.1 El editor tiene tres paneles, no dos

Overleaf presenta archivos + editor + PDF. Se mantiene esa distribución porque es la que el usuario académico ya conoce, con una diferencia: los **paneles de revisión** (comentarios, cambios, historial, chat) se abren como cuarto panel a la derecha en lugar de sustituir al PDF. Ver el documento y el comentario a la vez es el caso real de uso.

### 3.2 Los estados de error son producto

La pantalla **P-47 (compilación bloqueada)** es la más específica del sistema y merece atención de diseño: es el punto donde un usuario legítimo se topa con un control de seguridad. Si el mensaje es hostil o críptico, la persona concluye que la plataforma está rota. El mensaje por tanto:

1. Dice qué ha pasado, sin acusar.
2. Señala la línea exacta y el constructo concreto.
3. **Ofrece una alternativa viable** para su flujo de trabajo.
4. Explica por qué existe la restricción.
5. Permite reportar un falso positivo.

### 3.3 Indistinción deliberada entre 404 y 403

**P-44** usa el mismo texto para «no existe» y «no tienes acceso». Es una decisión de seguridad (T-P07) con coste de usabilidad asumido y compensado con la frase «si crees que deberías tenerlo, pide a su propietario que te invite».

### 3.4 Los roles se muestran, pero no se confía en ellos

El panel muestra el rol del usuario en cada proyecto y el editor oculta las acciones no permitidas. **Esto es cortesía visual, no un control de seguridad**: la comprobación real ocurre en el servidor en cada petición, incluidas las de WebSocket.

### 3.5 Transparencia como funcionalidad

**P-28** (sesiones y actividad) y **P-34** (mis datos) existen porque un usuario que puede ver qué sabe el sistema sobre él y dónde está conectado detecta antes un compromiso que cualquier heurística del servidor.

---

## 4. Comportamiento responsive

| Punto de ruptura | Comportamiento |
|---|---|
| ≥ 1280 px | Editor a tres paneles; panel de revisión como cuarta columna |
| 1024–1279 px | Editor a tres paneles; el panel de revisión se superpone |
| 768–1023 px | Editor a dos paneles; el árbol de archivos se convierte en cajón lateral |
| 360–767 px | Un panel visible cada vez, con conmutador Código / PDF / Archivos en la barra inferior |

El objetivo en móvil no es escribir una tesis: es **revisar, comentar y compilar**. La interfaz prioriza esas tres acciones y no intenta reproducir el editor completo en 360 px.

---

## 5. Del mockup al código

| Elemento del prototipo | Implementación real |
|---|---|
| Tokens de `mockup.css` | Variables CSS del sistema de diseño ([03-Sistema-de-Diseno.md](03-Sistema-de-Diseno.md)) |
| Botones, campos, diálogos | Primitivas de **Radix UI** con estilos de Tailwind |
| Editor de código | **CodeMirror 6** con gramática LaTeX propia |
| Visor PDF | **PDF.js** endurecido (sin scripting, sin `eval`, en Web Worker) |
| Cursores y presencia | **Yjs Awareness** con `y-codemirror.next` |
| Esqueletos de carga | Componentes con `aria-busy` y respeto a `prefers-reduced-motion` |
| Diálogos | Radix Dialog: foco atrapado, `Esc`, retorno del foco |

> **El prototipo no define el diseño visual final.** Fija estructura, jerarquía, estados y comportamiento. La tipografía, el espaciado fino y la ilustración se cierran en el sistema de diseño implementado.

---

## 6. Mantenimiento del prototipo

- Un cambio de estructura de una pantalla **actualiza su mockup en el mismo pull request**.
- Los mockups no se convierten en imágenes: se revisan como HTML en el *diff*.
- Al añadir una pantalla: nuevo identificador `P-xx`, entrada en la tabla de este documento y en `index.html`.
- Toda pantalla nueva debe llevar sus dos anotaciones (seguridad y accesibilidad) antes de considerarse terminada.

---

## 7. Demostración pública

| Pantalla | Mockup | Comportamiento |
|---|---|---|
| P-51 · Demo | [09-demo.html](mockups/09-demo.html) | Portada de producto con recorrido real, vistas seleccionables, plantillas del catálogo y preguntas breves. Demo directa, cuenta opcional, microinteracciones y nota académica al pie. Sesión limitada; editor normal preservado. |

Los estados de carga, error, límite de uso y registro cerrado están anotados en el mockup. Los detalles del aislamiento pertenecen a la documentación técnica, no al recorrido de producto de la portada.

El recorrido usa capturas reales de producción y un vídeo del documento de demostración grabado el 27 de noviembre de 2026 (UTC), con la revisión `2d89522`. No contiene cuentas personales. Se sirve desde el mismo origen, sin reproductores externos. La reproducción se pausa fuera de pantalla, respeta una pausa manual y no empieza automáticamente con movimiento reducido. Si no carga, queda la captura y el acceso a la demo. Las pestañas cambian con flechas (verticales en escritorio, horizontales en móvil); el foco tiene indicador visible.

Las respuestas al puntero usan transformaciones de 160 ms y opacidad de 200 ms con los tokens existentes. Las apariciones ocurren una sola vez, sin ocultar el HTML inicial ni desplazar contenido cuando se solicita movimiento reducido. El editor conserva su comportamiento y sus controles.

## 8. Documentos relacionados

P-03 conserva la verificación y el reenvío con espera. La ayuda visible se refiere a Spam o Correo no deseado; la aplicación no muestra direcciones locales ni herramientas de correo de desarrollo.

P-52 (privacidad) y P-53 (condiciones) se especifican en [10-informacion-publica.html](mockups/10-informacion-publica.html). Son páginas públicas de lectura, enlazadas desde el pie y el registro, necesarias para identificar el uso de datos en Google Auth Platform. El contacto se toma del entorno público del servidor y no se versiona una dirección personal.

- [03-Sistema-de-Diseno.md](03-Sistema-de-Diseno.md) — tokens, componentes y estados
- [08-Criptografia-en-el-Cliente.md](08-Criptografia-en-el-Cliente.md) — lo que implementan las pantallas P-48 a P-50
- [06-Accesibilidad-e-i18n.md](06-Accesibilidad-e-i18n.md) — criterios WCAG y traducción
- [`securtex-docs` · 02-Requisitos](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/02-Requisitos.md)
- [`securtex-docs` · 07-Casos-de-Uso](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/07-Casos-de-Uso.md)
