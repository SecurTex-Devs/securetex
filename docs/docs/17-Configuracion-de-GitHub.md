# 17 — Configuración de GitHub

Verificado el 26 de noviembre de 2026 en `SecurTex-Devs/securetex`, repositorio público. Sustituye la configuración histórica de los tres repositorios separados: sus limitaciones de repositorios privados ya no describen este monorepo.

## Protección de main aplicada

| Control | Estado observado |
|---|---|
| Pull request obligatorio | Activado, también para administradores (`enforce_admins=true`) |
| Check obligatorio | `Validación`, con la rama actualizada respecto de `main` |
| Origen de la versión estable | El workflow rechaza PR a `main` cuyo origen no sea `develop` |
| Push directo y force-push | Bloqueados; no hay excepciones de actores configuradas |
| Borrado de main | Bloqueado |
| Conversaciones pendientes | Deben resolverse antes de fusionar |
| Número mínimo de aprobaciones humanas | 0; se exige PR y CI, no una segunda persona disponible |
| Firmas exigidas por GitHub | No activado; las reglas del repo siguen pidiendo commits firmados |

La protección se comprobó mediante la API de GitHub. El hook local sigue siendo útil, pero la restricción efectiva está en el servidor de GitHub. No se usa `--admin` para saltar un check ni se sube directamente a `main`.

## Trabajo del equipo

```bash
git switch develop
git pull --ff-only
git switch -c feat/mi-cambio
# Implementar, comprobar y crear commits firmados en español.
git push -u origin feat/mi-cambio
gh pr create --base develop
```

Después de integrar en `develop`, abrir su PR a `main` y esperar `Validación`. Una fusión correcta dispara el despliegue; no hace falta entrar en Oracle. El pipeline usa runners ARM64 nativos de GitHub y registra qué comprobación falló.

## Environment production

Solo ramas protegidas pueden desplegar. `main` es la rama protegida que utiliza el workflow. Secrets: `DEPLOY_SSH_KEY` y `DEPLOY_KNOWN_HOSTS`. Variable: `DEPLOY_HOST`. La clave SSH es exclusiva de SecureTex, tiene comando forzado y `restrict`; no es la clave personal del propietario.

Las imágenes se publican en GHCR con el SHA completo del commit. La autenticación del registro usa el `GITHUB_TOKEN` efímero del job; no hay un PAT guardado en el servidor. Las revisiones anteriores quedan disponibles para revertir según `docs/DEPLOY.md`.

## Límites de esta comprobación

No se modificaron equipos, permisos de los miembros ni otros repositorios de la organización. El nombre de un check verde acredita la ejecución del workflow, no una auditoría externa de seguridad. La cobertura real es inferior al objetivo de la documentación y se publica sin redondearla al objetivo.

Las notificaciones por correo dependen de la configuración personal de GitHub Actions de cada integrante. Un fallo produce una ejecución roja con el paso y el error; no se han configurado correos adicionales ni cambiado preferencias personales.
