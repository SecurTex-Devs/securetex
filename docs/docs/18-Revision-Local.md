# 18 — Revisión local para la publicación

Verificada el **25 de noviembre de 2026**, sobre la rama `fix/revision-portafolio`, partiendo de `3aa2f52`. Resultados locales; todavía no acreditan un despliegue de producción.

| Comprobación | Resultado medido |
|---|---|
| Construcción y arranque con Docker Compose | API, web, PostgreSQL, compilador y Mailpit operativos; migraciones aplicadas |
| Unitarias de la API | 110 aprobadas en 4 archivos |
| Casos de abuso e integración | 75 aprobados, 11 suites, 0 fallos, 0 omitidos; 245,60 s |
| TypeScript | Backend y frontend sin errores |
| Contrato OpenAPI del frontend | Sincronizado con el backend |
| Auditoría de dependencias | 0 avisos en ambos proyectos; antes: 46 en backend y 8 en frontend |
| Gitleaks sobre el historial | Sin secretos detectados |
| MkDocs | `build --strict` correcto |
| Diagramas Mermaid | 66 bloques con sintaxis válida usando el parser de Mermaid CLI 10.4.0 |
| Navegadores reales | Chromium 159.0.8154.6 y Firefox 159.0, con cuentas sintéticas distintas |

Se comprobaron en el navegador el registro, el correo de verificación capturado por Mailpit, el acceso, la creación de un artículo, los cambios colaborativos en ambas direcciones, la compilación, la verificación Ed25519 antes de mostrar el PDF, la descarga de un PDF real y la persistencia después de recargar. La recuperación por correo está cubierta por dos nuevos casos: cambio de contraseña con revocación de sesiones y enlace de un solo uso; rechazo de un enlace inventado.

La suite de abuso también comprobó RLS y acceso cruzado, CSRF, rotación de refresh tokens, bloqueo de cuentas desde PostgreSQL, TOTP, sobres manipulados, revocación de colaboradores, cinco plantillas compiladas, firmas manipuladas, shell escape, lectura fuera del proyecto, tiempo máximo y límite de salida del compilador.

## Cobertura

`cd backend && pnpm test:coverage` mide **toda** `apps/api/src/**/*.ts` con V8, incluidas las capas HTTP, arranque y scripts. Solo instrumenta la suite unitaria, no la API que atiende las pruebas de integración en Docker.

| Métrica | Cubierto / total | Porcentaje |
|---|---|---|
| Líneas | 344 / 2478 | 13,88 % |
| Sentencias | 415 / 2906 | 14,28 % |
| Funciones | 81 / 651 | 12,44 % |
| Ramas | 218 / 1397 | 15,60 % |

Estas cifras no alcanzan los objetivos de cobertura de la documentación de planificación. No se presentan como una cobertura del 80 % ni del 100 % de seguridad.

## Correcciones de esta revisión

- Dependencias vulnerables actualizadas y parches transitivos fijados en los lockfiles. Se conservaron los algoritmos criptográficos, las políticas de autorización, RLS y el aislamiento existente.
- Medición reproducible de cobertura y prueba completa de recuperación de contraseña.
- La prueba de auditoría ya no puede pasar silenciosamente cuando falla el acceso de la cuenta sintética: exige el acceso o declara una omisión si falta su contraseña en el entorno.
- Enlaces de MkDocs, navegación y cinco diagramas Mermaid reparados sin cambiar su contenido arquitectónico.

## Límites que deben respetarse al publicar

- La API puede descifrar los documentos para compilarlos. El cifrado del navegador y del transporte no acredita un modo confidencial frente al operador del servidor; ese modo sigue fuera del alcance implementado.
- El compilador actual usa un contenedor persistente con `runc`, sin red, raíz de solo lectura y límites. El `runsc` de producción y el aislamiento por trabajo todavía requieren una decisión y comprobación de despliegue. Véanse los [riesgos residuales implementados](https://github.com/SecurTex-Devs/securetex/blob/main/backend/README.md#compilación-en-el-sandbox).
- La firma Ed25519 es de la aplicación y se verifica antes de visualizar o descargar. El PDF descargado no incorpora una firma PAdES reconocible por un lector de PDF convencional.
- El seed académico crea una administradora y puede mostrar la contraseña sintética generada en sus logs si no se configura `SEED_DEMO_PASSWORD`; no sirve para habilitar una demo pública.
- El repositorio no contiene actualmente configuración ejecutable de ESLint, Semgrep, CodeQL, Checkov, Spectral, axe o un pipeline. Los controles que aparecen en la documentación como objetivo no se contabilizan como análisis ejecutados.

## Repetir las comprobaciones

Con la pila local levantada y los secretos locales ya configurados, desde la raíz:

```bash
docker compose up --build -d
node --env-file=.env --test --test-concurrency=1 backend/apps/api/test/security/*.test.mjs
```

En `backend/`: `pnpm test:coverage`, `pnpm typecheck` y `pnpm audit`. En `frontend/`: `pnpm typecheck`, `pnpm api:check` y `pnpm audit`. En `docs/`, con sus dependencias de Python instaladas: `mkdocs build --strict`.
