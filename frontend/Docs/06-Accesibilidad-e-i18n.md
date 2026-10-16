# 06 — Accesibilidad e Internacionalización

> **Repositorio:** `securtex-frontend`
> **Objetivo:** WCAG 2.2 nivel AA verificado, no declarado
> **Versión:** 1.0

---

## 1. Por qué es un requisito y no una mejora

SecurTex es una herramienta académica: si un estudiante con discapacidad visual no puede escribir su tesis con ella, el producto ha fallado en su función. Además, `RF-142` lo exige y el CI lo verifica: **una violación crítica de accesibilidad bloquea el merge**, igual que un fallo de seguridad.

---

## 2. Criterios WCAG 2.2 AA aplicados

### 2.1 Perceptible

| Criterio | Aplicación en SecurTex |
|---|---|
| 1.1.1 Contenido no textual | Todo icono funcional lleva `aria-label`; los decorativos, `aria-hidden`. Las vistas previas de plantilla llevan descripción |
| 1.3.1 Información y relaciones | Encabezados jerárquicos reales; tablas con `<th scope>`; formularios con `<label for>` |
| 1.3.5 Identificar el propósito | `autocomplete` correcto en correo, contraseña y nombre |
| 1.4.1 Uso del color | El rol del colaborador, el estado de compilación y la severidad del error llevan **siempre** texto o icono además del color |
| 1.4.3 Contraste mínimo | 4.5:1 en texto, 3:1 en elementos de interfaz, verificado en ambos temas |
| 1.4.4 Cambio de tamaño | Interfaz usable al 200 % de zoom sin pérdida de contenido |
| 1.4.10 Reajuste | Sin desplazamiento horizontal a 320 px de ancho |
| 1.4.11 Contraste no textual | Bordes de campos, conmutadores y anillos de foco superan 3:1 |
| 1.4.12 Espaciado del texto | La interfaz tolera el aumento de interlineado y espaciado de letras |

### 2.2 Operable

| Criterio | Aplicación |
|---|---|
| 2.1.1 Teclado | **Toda** la funcionalidad es accesible por teclado, incluidos redimensionar paneles, arrastrar archivos en el árbol y navegar la paleta de símbolos |
| 2.1.2 Sin trampas de teclado | Los diálogos atrapan el foco pero se cierran con `Esc` |
| 2.1.4 Atajos de un carácter | Los atajos del editor son configurables y se pueden desactivar |
| 2.4.1 Evitar bloques | Enlace «Saltar al contenido» como primer elemento enfocable |
| 2.4.3 Orden del foco | Sigue el orden visual; en los diálogos empieza en el primer control |
| 2.4.7 Foco visible | Anillo de 2 px con contraste ≥ 3:1, **nunca** eliminado |
| 2.4.11 Foco no oscurecido | Las barras fijas no tapan el elemento enfocado (`scroll-margin`) |
| 2.5.7 Movimientos de arrastre | Mover un archivo en el árbol tiene alternativa por menú contextual |
| 2.5.8 Tamaño del objetivo | Mínimo 24×24 px en todos los controles |

### 2.3 Comprensible

| Criterio | Aplicación |
|---|---|
| 3.1.1 Idioma de la página | `<html lang>` correcto y sincronizado con la preferencia del usuario |
| 3.2.1 / 3.2.2 Al recibir foco o al introducir datos | Ningún cambio de contexto inesperado; los formularios no se envían solos |
| 3.3.1 Identificación de errores | El error se describe con texto, se asocia con `aria-describedby` y recibe el foco |
| 3.3.3 Sugerencia ante error | «¿Querías escribir `\includegraphics`?» en los errores de compilación |
| 3.3.7 Entrada redundante | No se pide dos veces el mismo dato en un flujo |
| 3.3.8 Autenticación accesible | **Passkeys** disponibles; el TOTP admite pegar; no hay pruebas cognitivas obligatorias |

### 2.4 Robusto

| Criterio | Aplicación |
|---|---|
| 4.1.2 Nombre, función, valor | Componentes de Radix con ARIA correcto; los propios se prueban con `axe-core` |
| 4.1.3 Mensajes de estado | El resultado de la compilación, el guardado y la conexión se anuncian con `role="status"` sin robar el foco |

---

## 3. Los tres retos difíciles

### 3.1 El editor de código

Un editor de texto enriquecido es notoriamente difícil de hacer accesible.

| Medida | Detalle |
|---|---|
| Rol y estado | CodeMirror expone `role="textbox"` con `aria-multiline="true"` y etiqueta el archivo abierto |
| Anuncios | La posición del cursor (línea y columna) se anuncia con `aria-live="polite"` bajo demanda, no en cada pulsación |
| Autocompletado | Patrón *combobox* de WAI-ARIA: `aria-expanded`, `aria-activedescendant`, número de resultados anunciado |
| Errores en el margen | Además del icono, existe una **lista navegable** de errores en el panel de compilación con enlaces a cada línea |
| Sin dependencia del ratón | Plegado, búsqueda, ir a línea, insertar símbolo y cambiar de panel tienen atajo de teclado documentado |

### 3.2 La colaboración en tiempo real

| Problema | Solución |
|---|---|
| Los cursores remotos son puramente visuales | Panel de colaboradores conectados, navegable, con «ir a la posición de María» |
| Los cambios remotos pueden desorientar | Los cambios de otros usuarios **no** se anuncian por defecto; existe un modo «anunciar ediciones remotas» activable |
| El color identifica al usuario | El nombre acompaña siempre al color, en el cursor y en el panel |

### 3.3 El visor PDF

El PDF renderizado en canvas es opaco para un lector de pantalla.

| Medida | Detalle |
|---|---|
| Capa de texto | PDF.js genera la capa de texto seleccionable y accesible sobre el canvas |
| Alternativa estructural | Panel de esquema del documento (secciones, figuras, tablas) navegable |
| SyncTeX por teclado | «Ir a la línea del código correspondiente» disponible como comando, no solo por doble clic |
| Descarga | Siempre posible, para usar un lector de PDF propio |

---

## 4. Verificación

| Nivel | Herramienta | Frecuencia | Bloquea |
|---|---|---|---|
| Componente | `axe-core` + Testing Library | Cada push | ✅ violación crítica o seria |
| Página | `@axe-core/playwright` en los flujos E2E | Cada push | ✅ |
| Auditoría | Lighthouse (accesibilidad ≥ 95) | Cada push | ✅ |
| Contraste | Script propio sobre los tokens, ambos temas | Cada push | ✅ |
| **Manual con teclado** | Recorrido completo sin ratón | Por sprint | Revisión |
| **Manual con lector de pantalla** | NVDA (Windows) y VoiceOver (macOS) | Por sprint | Revisión |
| Zoom 200 % y 320 px de ancho | Manual | Por sprint | Revisión |

> Las herramientas automáticas detectan alrededor del 40 % de los problemas reales. Las revisiones manuales por sprint **no son opcionales**.

---

## 5. Internacionalización

### 5.1 Alcance

| Idioma | Estado | Responsable |
|---|---|---|
| Español (Ecuador) | Completo — idioma base | Equipo |
| Inglés | Completo | Equipo |
| Portugués, francés | Preparado; sin traducir | Comunidad |

### 5.2 Reglas

| Regla | Motivo |
|---|---|
| **Ninguna cadena escrita directamente en un componente** | Verificado por regla de ESLint que falla el build |
| Claves con espacio de nombres (`editor.compile.blocked.title`) | Evita colisiones y facilita el contexto |
| Sin concatenar frases | «Se han encontrado {n} errores», no «Se han encontrado» + n + «errores» |
| Pluralización con reglas ICU | El plural no es «añadir una s» en todos los idiomas |
| Fechas, horas y números con `Intl` | Formato correcto por locale y zona horaria |
| Interpolación segura | Los valores interpolados se escapan; nunca HTML desde una traducción |
| Traducciones de terceros revisadas | Una traducción es contenido que se renderiza: se trata como entrada no confiable |

### 5.3 Consideración de seguridad

Un archivo de traducción es **código que se renderiza**. Una traducción maliciosa podría intentar inyectar HTML o cambiar el sentido de un mensaje de seguridad («Estás a punto de eliminar» → «Confirma para continuar»). Por eso:

- Las traducciones se revisan por pull request como cualquier código.
- El motor de i18n **no interpreta HTML** en las cadenas.
- Los mensajes de los flujos críticos (eliminar, compartir, bloquear) tienen revisión adicional.

### 5.4 Contenido del usuario

Los documentos LaTeX pueden estar en cualquier idioma y alfabeto. El editor soporta UTF-8 completo, alfabetos no latinos y escritura de derecha a izquierda **en el contenido** — aunque la interfaz de la aplicación no se invierte, porque el código LaTeX es siempre de izquierda a derecha.

---

## 6. Lista de verificación por componente

Antes de fusionar cualquier componente nuevo:

- [ ] Usable solo con teclado, en orden lógico
- [ ] Foco visible con contraste ≥ 3:1
- [ ] Nombre accesible correcto (probado con lector de pantalla)
- [ ] Contraste verificado en tema claro y oscuro
- [ ] Ninguna información transmitida solo por color
- [ ] Estados de carga, error y vacío definidos y anunciados
- [ ] Respeta `prefers-reduced-motion`
- [ ] Objetivos táctiles ≥ 24×24 px
- [ ] Cero violaciones de `axe-core`
- [ ] Todas las cadenas en el sistema de i18n

---

## 7. Documentos relacionados

- [03-Sistema-de-Diseno.md](03-Sistema-de-Diseno.md)
- [04-Interfaces-y-Mockups.md](04-Interfaces-y-Mockups.md) — cada mockup incluye su anotación de accesibilidad
- [07-Testing-Frontend.md](07-Testing-Frontend.md)
