# Cómo contribuir · securtex-backend

## 1. Antes de escribir código

Lee, en este orden:

1. [`securtex-docs` · 05-Seguridad](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/05-Seguridad.md) — el modelo de amenazas
2. [`Docs/02-Arquitectura-del-Backend.md`](Docs/02-Arquitectura-del-Backend.md)
3. [`Docs/03-Estandares-de-Codigo.md`](Docs/03-Estandares-de-Codigo.md)
4. [`AGENTS.md`](AGENTS.md) — aplica también a personas

## 2. Flujo

```bash
git switch -c feat/mi-cambio
pnpm install
pnpm dev
# … trabajar …
pnpm lint && pnpm typecheck && pnpm test && pnpm test:security
git commit -S -m "feat(projects): descripción del cambio"
git push -u origin feat/mi-cambio
```

Ramas: `feat/`, `fix/`, `sec/`, `refactor/`, `test/`, `docs/`, `chore/`.

## 3. Requisitos del pull request

- [ ] Una aprobación de alguien distinto al autor
- [ ] **Revisión del responsable de seguridad** si toca autenticación, criptografía, autorización o el sandbox
- [ ] Todos los controles del CI en verde
- [ ] Commits firmados
- [ ] Contrato de la API regenerado si cambió algún endpoint
- [ ] Documentación actualizada **en el mismo PR**
- [ ] Prueba de acceso cruzado para todo endpoint nuevo

Responde siempre en la descripción:

1. ¿Qué amenaza del modelo toca este cambio?
2. ¿Qué controles añade o modifica?
3. ¿Qué pruebas lo verifican?

## 4. Definición de Terminado

La lista completa está en [`securtex-docs` · 11-Plan-de-Proyecto §8](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/11-Plan-de-Proyecto.md). Resumen: implementado, autorizado en el servidor, validado, auditado, probado (incluido el caso de abuso si el riesgo es medio o superior), sin hallazgos críticos ni altos, y documentado.

## 5. Motivos de rechazo

Endpoint sin `@Policy` · tabla sin RLS o sin prueba de acceso cruzado · SQL concatenado · `catch` vacío · secreto en el código · contrato no regenerado · documentación desactualizada · patrón prohibido de [`Docs/03-Estandares-de-Codigo.md §3`](Docs/03-Estandares-de-Codigo.md).

## 6. Reportar una vulnerabilidad

No abras un *issue* público: sigue [SECURITY.md](SECURITY.md).
