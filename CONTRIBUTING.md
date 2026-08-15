# Cómo contribuir a la documentación

## 1. Regla número uno

**Un documento vive en un solo repositorio.** Nunca se copia contenido entre `texguard-docs`, `texguard-backend` y `texguard-frontend`. Si necesitas referenciar algo de otro repositorio, enlázalo.

| Si el contenido es… | Va en… |
|---|---|
| Común al sistema (requisitos, arquitectura, seguridad, datos, plan) | `texguard-docs` |
| Específico de la API o de los servicios | `texguard-backend/Docs` |
| Específico de la interfaz o del diseño | `texguard-frontend/Docs` |

## 2. Flujo de trabajo

```bash
git switch -c docs/mi-tema
# editar
pip install -r requirements.txt
mkdocs build --strict          # falla ante enlaces rotos
git commit -S -m "docs: describe el cambio"
git push -u origin docs/mi-tema
```

Abre un *pull request*. Requiere **una aprobación** de alguien distinto al autor.

## 3. Convenciones de escritura

| Regla | Detalle |
|---|---|
| Idioma | Español en la prosa; inglés en identificadores, código, nombres de fichero técnicos y mensajes de commit |
| Nombres de archivo | `NN-Titulo-En-Kebab-Case.md`, numerados para fijar el orden |
| Diagramas | **Mermaid en bloques de código**, nunca imágenes: un diagrama en imagen no se puede revisar en un *diff* |
| Enlaces | Relativos dentro del repositorio; URL completa hacia otros repositorios |
| Tablas | Preferidas frente a listas largas cuando hay más de dos atributos por elemento |
| Trazabilidad | Referencia siempre los `F-xxx`, `RF-xxx`, `RS-xxx` o `T-xxx` que desarrolla el texto |
| Tono | Directo y técnico. Sin marketing, sin superlativos, sin "simplemente" ni "obviamente" |
| Honestidad | Si algo tiene un inconveniente, se escribe. Un documento que solo lista ventajas no es documentación técnica |

### 3.1 Colores en los diagramas

| Color | Hex | Uso |
|---|---|---|
| Rojo | `#8b1a1a` | Elemento con implicación directa de seguridad o zona hostil |
| Verde | `#1a5c1a` | Almacén protegido o control efectivo |
| Ámbar | `#d29922` | Punto de aislamiento o frontera |
| Azul | `#1f6feb` | Elemento central del diagrama |

## 4. Decisiones arquitectónicas (ADR)

Toda decisión estructural se registra en `docs/adr/` con este formato:

```markdown
# ADR-XXXX · Título en una línea

- **Estado:** Propuesta | Aceptada | Sustituida por ADR-YYYY
- **Fecha:** AAAA-MM-DD
- **Decide:** Rol o roles
- **Afecta a:** Componentes

## Contexto
Qué problema hay y por qué hay que decidir ahora.

## Alternativas
Tabla comparativa honesta, incluida la opción que se descarta.

## Decisión
Qué se decide, en imperativo.

## Consecuencias
Positivas **y negativas**. Un ADR sin consecuencias negativas no está terminado.
```

## 5. Qué se rechaza en revisión

- Documentación que no se actualiza junto al cambio que describe.
- Diagramas como imagen.
- Contenido duplicado entre repositorios.
- Enlaces rotos (`mkdocs build --strict` los detecta).
- Afirmaciones de seguridad sin control verificable asociado.
- Secretos, credenciales, datos reales o correos verdaderos, aunque sean de ejemplo.
- ADR sin sección de consecuencias negativas.

## 6. Commits

Formato *Conventional Commits*, **firmados**:

```
docs: añade el modelo de amenazas del módulo de plantillas
docs(adr): registra la decisión sobre el aislamiento del compilador
fix(docs): corrige el enlace roto a 06-Modelo-de-Datos
```
