## Qué cambia

<!-- Descripción breve y concreta -->

## Trazabilidad

- Requisito: `RF-xxx` / `RS-xxx`
- Caso de uso: `CU-xx`
- Issue: #

## Revisión de seguridad

1. **¿Qué amenaza del modelo toca este cambio?** (`T-xxx`, o «ninguna» con justificación)
2. **¿Qué controles añade o modifica?**
3. **¿Qué pruebas lo verifican?**

## Lista de verificación

- [ ] Autorización aplicada en el caso de uso, no en el controlador
- [ ] Entradas validadas con esquema declarativo
- [ ] Eventos de seguridad registrados en auditoría
- [ ] Prueba de **acceso cruzado** para todo endpoint nuevo
- [ ] RLS habilitada y probada para toda tabla nueva
- [ ] Contrato de la API regenerado (`pnpm contracts:generate`)
- [ ] Documentación actualizada en este mismo PR
- [ ] Sin secretos, credenciales ni datos reales
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:security` en verde

## ¿Requiere revisión del responsable de seguridad?

- [ ] Sí — toca autenticación, criptografía, autorización o el sandbox
- [ ] No
