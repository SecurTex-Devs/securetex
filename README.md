# texguard-docs

**Documentación de planificación del proyecto TeXGuard** — editor LaTeX colaborativo seguro.

> Proyecto final de la asignatura *Seguridad de Software* · Universidad Técnica de Ambato · 8.º semestre

---

## Qué hay aquí

Este repositorio es la **fuente única de verdad** de la documentación común del proyecto. No contiene código de la aplicación.

```
docs/
├── index.md                              Portada e índice general
├── 00-Publicacion-de-la-Documentacion.md Cómo se organiza y publica todo esto
├── 01-Analisis-Funcional-Overleaf.md     222 funcionalidades inventariadas
├── 02-Requisitos.md                      ERS completa (ISO/IEC/IEEE 29148)
├── 03-Arquitectura.md                    Modelo C4 y fronteras de confianza
├── 04-Stack-Tecnologico.md               Tecnologías y su justificación de seguridad
├── 05-Seguridad.md                       Modelo de amenazas STRIDE y controles
├── 06-Modelo-de-Datos.md                 Entidad-relación, diccionario, RLS
├── 07-Casos-de-Uso.md                    Casos de uso y casos de abuso
├── 08-Diagramas-UML.md                   Clases, secuencia, actividad, estados, despliegue
├── 09-Interfaces-y-Mockups.md            → apunta a texguard-frontend
├── 10-API-y-Endpoints.md                 → apunta a texguard-backend
├── 11-Plan-de-Proyecto.md                Sprints, roles, riesgos, entregables
├── 12-DevSecOps-y-Testing.md             Pipeline y estrategia de pruebas
├── 13-Infraestructura-y-Despliegue.md    Entornos, IaC, operación
├── 14-Glosario.md                        Términos y acrónimos
└── adr/                                  9 registros de decisión arquitectónica
```

---

## Los tres repositorios

| Repositorio | Contenido |
|---|---|
| **texguard-docs** *(este)* | Documentación común y decisiones |
| **texguard-backend** | API, servicios, orquestador de compilación, sandbox |
| **texguard-frontend** | SPA, editor, visor PDF, sistema de diseño |

El trabajo de los tres se planifica en un **GitHub Project (v2) de la organización**. Ver [00-Publicacion-de-la-Documentacion.md](docs/00-Publicacion-de-la-Documentacion.md).

---

## Cómo leerla

**Opción 1 — En GitHub (sin instalar nada).** Entra en [`docs/index.md`](docs/index.md) y navega. GitHub renderiza Markdown y los diagramas Mermaid de forma nativa.

**Opción 2 — Sitio web local.**

```bash
pip install -r requirements.txt
mkdocs serve
```

Abre `http://127.0.0.1:8000`: buscador, navegación lateral, modo oscuro y diagramas renderizados.

**Opción 3 — Sitio publicado.** Cada push a `main` regenera el sitio con GitHub Actions.

---

## Cómo contribuir

1. Rama desde `main`: `docs/<tema>`.
2. Edita el documento correspondiente. **Un documento vive en un solo repositorio**: si el contenido es específico del frontend o del backend, va en su repositorio.
3. Verifica en local: `mkdocs build --strict` (falla ante enlaces rotos).
4. Abre un *pull request*. Requiere una aprobación.

Detalle completo en [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Estado

| | |
|---|---|
| Versión | 1.0 |
| Estado | **Propuesta en revisión** |
| Funcionalidades inventariadas | 222 |
| Requisitos especificados | 251 |
| Amenazas modeladas | 61 |
| Última actualización | 2026-08-14 |
</content>
</invoke>
