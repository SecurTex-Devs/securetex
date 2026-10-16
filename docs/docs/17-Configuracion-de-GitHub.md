# 17 — Configuración de GitHub

> **Estado real de la organización `SecurTex-Devs`**: qué está aplicado, qué no se puede aplicar todavía y por qué.
> **Versión:** 1.0 · última verificación: 2026-08-15

---

## 1. Resumen honesto

| Control | Estado | Motivo |
|---|---|---|
| Solo *squash merge* (historial lineal) | ✅ Aplicado | — |
| Borrado automático de la rama al fusionar | ✅ Aplicado | — |
| Alertas de vulnerabilidad (Dependabot) | ✅ Aplicado | — |
| Parches de seguridad automáticos | ✅ Aplicado | — |
| `CODEOWNERS` con solicitud automática de revisión | ✅ Aplicado | — |
| *Hook* local que bloquea el push a `main` | ✅ Aplicado | Cada persona lo activa una vez |
| Wiki deshabilitada | ✅ Aplicado | La documentación va por *pull request*, no por wiki |
| **Protección de la rama `main`** | ❌ **No disponible** | GitHub Free no la ofrece en repositorios **privados** |
| **Rulesets** | ❌ **No disponible** | Mismo motivo |
| **Escaneo de secretos** | ❌ **No disponible** | Requiere GitHub Advanced Security |
| Revisión obligatoria antes de fusionar | ❌ No exigible | Depende de la protección de ramas |
| Commits firmados obligatorios | ❌ No exigible | Depende de la protección de ramas |
| Checks de CI obligatorios | ❌ No exigible | Depende de la protección de ramas |

> **Qué significa esto hoy:** cualquier persona con acceso de escritura **puede subir directamente a `main`** sin revisión. La disciplina la sostienen el *hook* local y el acuerdo del equipo, **no la plataforma**. Es una diferencia importante y conviene decirla tal cual en la defensa del proyecto: reconocer una limitación real vale más que fingir un control que no existe.

---

## 2. Cómo levantar la limitación

Tres caminos, de menor a mayor coste:

| Opción | Coste | Qué se gana | Qué se pierde |
|---|---|---|---|
| **A · GitHub Education** | Gratis | Plan Team para la organización: protección de ramas, rulesets, revisión obligatoria | Hay que solicitarlo y esperar aprobación |
| **B · Repositorios públicos** | Gratis e inmediato | Protección de ramas, rulesets y escaneo de secretos | El trabajo queda visible e indexable antes de la entrega |
| **C · GitHub Team** | ~4 USD por persona y mes | Igual que A, inmediato | Coste económico |

### Opción A · GitHub Education (recomendada)

1. Cada integrante solicita el **Student Developer Pack** en <https://education.github.com/pack> con el correo institucional `@uta.edu.ec`.
2. Con la cuenta ya verificada como estudiante, se solicita la mejora de la **organización** a plan Team.
3. Una vez aprobada, aplicar la protección con el comando de la sección 4.

### Opción B · Repositorios públicos

Decisión del equipo. Si se elige:

```bash
for r in securtex-docs securtex-backend securtex-frontend; do gh repo edit "SecurTex-Devs/$r" --visibility public --accept-visibility-change-consequences; done
```

Después, aplicar la protección con el comando de la sección 4.

> Antes de hacerlos públicos: revisar que no haya quedado ningún dato personal ni credencial en el histórico. `gitleaks detect --log-opts="--all"` sobre cada repositorio.

---

## 3. Lo que hay que hacer **hoy**, una vez por persona

En **cada uno** de los tres repositorios clonados:

```bash
git config core.hooksPath .githooks
```

Con eso, `git push` a `main` se bloquea con un mensaje que explica qué hacer. **Sin eso el *hook* no se ejecuta**: git no activa los *hooks* de un repositorio recién clonado, por seguridad.

Comprobación de que funciona:

```bash
git switch main && git commit --allow-empty -m "prueba" && git push
```

Debe fallar con `✕ Push directo a 'main' bloqueado`. Para deshacer la prueba:

```bash
git reset --hard origin/main
```

---

## 4. Comando para aplicar la protección en cuanto esté disponible

Guardado aquí para no tener que reconstruirlo:

```bash
for r in securtex-docs securtex-backend securtex-frontend; do gh api -X PUT "repos/SecurTex-Devs/$r/branches/main/protection" --input proteccion.json; done
```

Con `proteccion.json`:

```json
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "block_creations": false
}
```

### 4.1 Dos ajustes que **no** conviene activar todavía

| Ajuste | Por qué esperar |
|---|---|
| `required_signatures` | Nadie del equipo tiene firma de commits configurada. Activarlo ahora bloquearía a todo el mundo de inmediato |
| `required_status_checks` con checks concretos | Todavía no hay CI. Exigir un check que no existe deja los *pull requests* bloqueados para siempre |

Cuando llegue el momento:

```bash
gh api -X POST "repos/SecurTex-Devs/securtex-backend/branches/main/protection/required_signatures"
```

```bash
gh api -X PATCH "repos/SecurTex-Devs/securtex-backend/branches/main/protection/required_status_checks" -F strict=true -f 'contexts[]=lint' -f 'contexts[]=test' -f 'contexts[]=security'
```

> `enforce_admins` se deja en `false` a propósito: si algo se rompe, alguien con permisos de administrador tiene que poder arreglarlo sin quedarse fuera.

---

## 5. Equipos y permisos

Requiere el permiso `admin:org`, que el token actual **no tiene**. Para habilitarlo:

```bash
gh auth refresh -s admin:org,write:org,project
```

Crear los equipos:

```bash
gh api -X POST orgs/SecurTex-Devs/teams -f name='core' -f privacy=closed
gh api -X POST orgs/SecurTex-Devs/teams -f name='backend' -f privacy=closed
gh api -X POST orgs/SecurTex-Devs/teams -f name='frontend' -f privacy=closed
gh api -X POST orgs/SecurTex-Devs/teams -f name='docente' -f privacy=closed
```

Asignar permisos con mínimo privilegio:

| Equipo | `securtex-docs` | `securtex-backend` | `securtex-frontend` |
|---|---|---|---|
| `core` | admin | admin | admin |
| `backend` | push | push | pull |
| `frontend` | push | pull | push |
| `docente` | pull | pull | pull |

```bash
gh api -X PUT orgs/SecurTex-Devs/teams/core/repos/SecurTex-Devs/securtex-docs -f permission=admin
gh api -X PUT orgs/SecurTex-Devs/teams/backend/repos/SecurTex-Devs/securtex-backend -f permission=push
gh api -X PUT orgs/SecurTex-Devs/teams/backend/repos/SecurTex-Devs/securtex-frontend -f permission=pull
gh api -X PUT orgs/SecurTex-Devs/teams/frontend/repos/SecurTex-Devs/securtex-frontend -f permission=push
gh api -X PUT orgs/SecurTex-Devs/teams/frontend/repos/SecurTex-Devs/securtex-backend -f permission=pull
gh api -X PUT orgs/SecurTex-Devs/teams/docente/repos/SecurTex-Devs/securtex-docs -f permission=pull
```

Invitar a una persona a un equipo:

```bash
gh api -X PUT orgs/SecurTex-Devs/teams/backend/memberships/USUARIO -f role=member
```

Después, actualizar el `.github/CODEOWNERS` de cada repositorio para que apunte a los equipos (`@SecurTex-Devs/core`) en lugar de a personas concretas.

---

## 6. Tablero del proyecto

Requiere el permiso `project`, que el token actual tampoco tiene.

```bash
gh auth refresh -s project
gh project create --owner SecurTex-Devs --title "SecurTex — Plan de proyecto"
```

Campos personalizados (sustituye `NUMERO` por el que devuelva el comando anterior):

```bash
gh project field-create NUMERO --owner SecurTex-Devs --name "Sprint" --data-type SINGLE_SELECT --single-select-options "S1,S2,S3,S4,S5"
gh project field-create NUMERO --owner SecurTex-Devs --name "Nivel" --data-type SINGLE_SELECT --single-select-options "N0 Núcleo,N1 Esencial,N2 Deseable,N3 Prescindible,SEC"
gh project field-create NUMERO --owner SecurTex-Devs --name "Módulo" --data-type TEXT
gh project field-create NUMERO --owner SecurTex-Devs --name "Requisito" --data-type TEXT
gh project field-create NUMERO --owner SecurTex-Devs --name "Riesgo" --data-type SINGLE_SELECT --single-select-options "Ninguno,Bajo,Medio,Alto,Crítico"
```

Los valores del campo «Nivel» son los de [16-Priorizacion-y-Alcance.md](16-Priorizacion-y-Alcance.md).

---

## 7. Repositorio de perfil de la organización

Opcional. Muestra una portada al entrar en la organización:

```bash
gh repo create SecurTex-Devs/.github --public --add-readme
```

Después, crear dentro el archivo `profile/README.md`.

---

## 8. Verificación periódica

```bash
for r in securtex-docs securtex-backend securtex-frontend; do echo "-- $r"; gh api "repos/SecurTex-Devs/$r" --jq '"  squash-only=\(.allow_squash_merge and (.allow_merge_commit|not))  borrar-rama=\(.delete_branch_on_merge)  visibilidad=\(.visibility)"'; gh api "repos/SecurTex-Devs/$r/branches/main/protection" --jq '"  proteccion: ACTIVA"' 2>/dev/null || echo "  proteccion: NO DISPONIBLE"; done
```

---

## 9. Documentos relacionados

- [00-Publicacion-de-la-Documentacion.md](00-Publicacion-de-la-Documentacion.md) — organización de los repositorios y equipos previstos
- [11-Plan-de-Proyecto.md](11-Plan-de-Proyecto.md) — reglas de trabajo del equipo
- [12-DevSecOps-y-Testing.md](12-DevSecOps-y-Testing.md) — checks de CI que se volverán obligatorios
</content>
