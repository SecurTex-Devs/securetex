# AGENTS.md — Instrucciones para agentes de IA

> Este archivo lo leen los asistentes de IA (Claude Code, Cursor, Copilot, Codex…) antes de trabajar en `docs/`. Las reglas comunes a todo el repositorio están en el [`AGENTS.md` de la raíz](../AGENTS.md). Las instrucciones son **obligatorias**, no sugerencias.

---

## 1. Qué es esta carpeta

`docs/` es la **documentación de planificación** del proyecto SecurTex, un editor LaTeX colaborativo seguro. **No contiene código de aplicación.**

Junto a ella están `backend/` y `frontend/`, cada uno con su propio `AGENTS.md`.

---

## 2. Reglas absolutas

1. **Un documento vive en un solo repositorio.** No copies contenido entre repositorios: enlázalo.
2. **No inventes datos.** Si no sabes un valor (una versión, una métrica, un umbral), pregunta o márcalo explícitamente como `⚠️ POR DEFINIR`. Nunca rellenes con una cifra plausible.
3. **No debilites un control de seguridad** descrito en la documentación sin registrar un ADR que lo justifique.
4. **Nunca escribas secretos, credenciales, tokens ni datos personales reales**, ni siquiera como ejemplo. Usa `example.com`, `usuario@example.com`, `<TOKEN>`.
5. **Los diagramas son Mermaid en bloques de código.** Nunca imágenes, nunca ASCII art.
6. Si cambias una decisión estructural, **crea o actualiza el ADR** correspondiente en `docs/adr/`.
7. Si añades un documento, **actualiza `docs/index.md` y `mkdocs.yml`**. El build es `--strict` y falla ante enlaces rotos.

---

## 3. Estilo de escritura

| Regla | Explicación |
|---|---|
| Español en la prosa, inglés en el código | Identificadores, nombres de fichero técnicos y commits en inglés |
| Directo y técnico | Sin marketing, sin superlativos, sin "simplemente", "obviamente" ni "basta con" |
| **Honesto sobre los inconvenientes** | Toda decisión lleva sus consecuencias negativas. Un texto que solo lista ventajas se rechaza en revisión |
| Trazable | Referencia los `F-xxx`, `RF-xxx`, `RS-xxx`, `T-xxx` que desarrollas |
| Tablas antes que listas largas | Cuando hay más de dos atributos por elemento |
| Sin redundancia | Si algo ya está explicado en otro documento, enlázalo; no lo repitas |

---

## 4. Estructura y numeración

```
docs/
├── index.md                 Portada — actualízala al añadir documentos
├── NN-Titulo-Kebab-Case.md  Documentos numerados; el número fija el orden de lectura
└── adr/ADR-NNNN-titulo.md   Decisiones arquitectónicas
```

Al crear un documento nuevo: usa el siguiente número libre, añádelo a `index.md`, a `mkdocs.yml` (sección `nav`) y enlázalo desde los documentos relacionados.

---

## 5. Colores obligatorios en los diagramas

| Uso | Hex |
|---|---|
| Seguridad / zona hostil | `#8b1a1a` con `color:#fff` |
| Almacén protegido / control efectivo | `#1a5c1a` con `color:#fff` |
| Frontera o punto de aislamiento | `#d29922` con `color:#000` |
| Elemento central | `#1f6feb` con `color:#fff` |

---

## 6. Antes de terminar, verifica

- [ ] `mkdocs build --strict` pasa sin errores
- [ ] Todos los bloques Mermaid tienen sintaxis válida
- [ ] `index.md` y `mkdocs.yml` reflejan los documentos nuevos
- [ ] No hay contenido duplicado con los otros repositorios
- [ ] No hay secretos, datos reales ni correos verdaderos
- [ ] Toda decisión nueva tiene su ADR, con consecuencias negativas incluidas
- [ ] Las afirmaciones de seguridad tienen un control verificable asociado

---

## 7. Qué NO hacer

- ❌ Añadir tecnologías al stack sin justificarlas contra la rúbrica de [04-Stack-Tecnologico.md §1](docs/04-Stack-Tecnologico.md)
- ❌ Suavizar o eliminar advertencias de seguridad para que el texto "quede mejor"
- ❌ Reescribir documentos completos cuando el cambio pedido es puntual
- ❌ Cambiar la numeración de documentos existentes (rompe enlaces en los otros repositorios)
- ❌ Crear código de aplicación aquí: va en `backend/` o `frontend/`
- ❌ Prometer funcionalidades sin trazarlas a un `F-xxx` de [01-Analisis-Funcional-Overleaf.md](docs/01-Analisis-Funcional-Overleaf.md)

---

## 8. Contexto imprescindible

Antes de escribir sobre arquitectura o seguridad, lee al menos:

1. [docs/03-Arquitectura.md](docs/03-Arquitectura.md) — principios y fronteras de confianza
2. [docs/05-Seguridad.md](docs/05-Seguridad.md) — el documento central del proyecto
3. Los ADR relevantes en [docs/adr/](docs/adr/)

**Premisa que gobierna todo el diseño:** compilar LaTeX es ejecutar código arbitrario del usuario. Cualquier propuesta que ignore ese hecho está mal.
