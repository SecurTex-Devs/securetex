## Qué cambia

<!-- Descripción breve y concreta. Marca qué partes toca: -->

- [ ] `backend/`
- [ ] `frontend/`
- [ ] `docs/`
- [ ] `docker-compose.yml` / `infra/`

## Trazabilidad

- Requisito: `RF-xxx` / `RS-xxx`
- Caso de uso: `CU-xx` · Pantalla del prototipo: `P-xx`
- Issue: #

## Revisión de seguridad

1. **¿Qué amenaza del modelo toca este cambio?** (`T-xxx`, o «ninguna» con justificación)
2. **¿Qué controles añade o modifica?**
3. **¿Qué pruebas lo verifican?**

## Lista de verificación · backend

- [ ] Autorización aplicada en el caso de uso, no en el controlador
- [ ] Entradas validadas con esquema declarativo
- [ ] Eventos de seguridad registrados en auditoría
- [ ] Prueba de **acceso cruzado** para todo endpoint nuevo
- [ ] RLS habilitada y probada para toda tabla nueva
- [ ] Contrato de la API regenerado (`pnpm contracts:generate`)
- [ ] Documentación actualizada en este mismo PR
- [ ] Sin secretos, credenciales ni datos reales
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:security` en verde

## Lista de verificación · frontend

- [ ] Estados de carga, error y vacío implementados
- [ ] Cada `kind` de error de la API tiene tratamiento visible
- [ ] Usable solo con teclado, con foco visible
- [ ] Probado con lector de pantalla (si es una pantalla nueva)
- [ ] Correcto en tema claro y oscuro
- [ ] Todas las cadenas en el sistema de i18n
- [ ] Tipos de la API generados, no escritos (`pnpm api:check`)
- [ ] Ningún token en `localStorage`, `sessionStorage` ni en la URL
- [ ] Mockup actualizado si cambió la estructura de la pantalla
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm api:check` en verde

## ¿Requiere revisión del responsable de seguridad?

- [ ] Sí — toca autenticación, criptografía, autorización o el sandbox
- [ ] No

## Capturas

<!-- Antes / después, en tema claro y oscuro -->
