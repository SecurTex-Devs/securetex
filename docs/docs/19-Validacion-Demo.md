# 19 · Validación local de la demo

Comprobaciones del **25 y 26 de noviembre de 2026**. Complementan la [revisión inicial](18-Revision-Local.md). Son resultados locales con Docker Desktop, no verificaciones de producción.

| Comprobación | Resultado medido |
|---|---|
| Unitarias | 118 aprobadas, 6 archivos |
| Seguridad e integración | 82 aprobadas, 12 suites, 0 fallos y 0 omitidas; 108,73 s |
| TypeScript y OpenAPI | Backend y frontend sin errores; contrato sincronizado |
| Cuenta normal | Registro, verificación por correo, acceso, creación de artículo, edición bidireccional en Chromium y Firefox, compilación, firma, descarga y persistencia tras recarga |
| Demo | Entrada sin contraseña, colaboración bidireccional, PDF real, salida a cuenta normal con creación, Compartir y autocompilación disponibles |
| Móvil | Portada y editor a 390 × 844 sin desbordamiento horizontal |
| Reinicio | Restaura el ejemplo e invalida sus sesiones; conserva sesión y contenido de una cuenta normal; recupera un cambio de día pendiente al arrancar |
| Registro deshabilitado | API local aislada con `NODE_ENV=production` y `REGISTRATION_ENABLED=false`: respuesta 403 |
| Google y Microsoft | Variables locales presentes; redirecciones a los proveedores con retorno local y PKCE S256. No se realizó autenticación personal ni se comprobó el estado de publicación de las aplicaciones de proveedor |
| axe 4.14.1 | 0 infracciones WCAG A/AA detectadas en la portada, en claro y oscuro, a 1440 y 390 px |
| Lighthouse 13.6.0 | Chrome 158, emulación móvil local: rendimiento 82, accesibilidad 100, buenas prácticas 100 y SEO 100 |

Lighthouse corresponde a una ejecución sobre localhost, con la aplicación construida para producción. No representa latencia de Internet ni es una media de varias ejecuciones. La primera ejecución con Chromium 159 falló al obtener la traza y se descartó. axe y Lighthouse no sustituyen una revisión manual de accesibilidad.

## Cobertura unitaria

V8 instrumenta toda `apps/api/src/**/*.ts`, incluidos arranque, HTTP y scripts. Las pruebas contra Docker no se incluyen en esta medición.

| Métrica | Cubierto / total | Porcentaje |
|---|---|---|
| Líneas | 378 / 2602 | 14,52 % |
| Sentencias | 457 / 3069 | 14,89 % |
| Funciones | 92 / 679 | 13,54 % |
| Ramas | 244 / 1511 | 16,14 % |

## Correcciones verificadas

La demo usa las sesiones, cookies, cifrado, permisos y sandbox existentes. Añade un alcance de proyecto y una lista explícita de acciones permitidas, caducidad de 30 minutos y presupuestos de inicio, compilación y peticiones. El reinicio respeta RLS y el paso por la papelera; no utiliza credenciales de migración.

Las restricciones visuales se aplican solo a la demo. Se conserva la interfaz habitual de cuentas normales y se restaura su preferencia de autocompilación al abandonar la muestra. Las barras de herramientas se pueden recorrer en móvil; el estado no ensancha la página. El pie de la portada usa un token de texto con contraste suficiente.

Las credenciales locales de proveedores y las claves de cifrado se conservaron. No se copiaron al código ni a la captura. El despliegue debe usar claves propias para su base y autorizar el URI de retorno del dominio en cada proveedor que se habilite.

## Repetir

Con `DEMO_ENABLED=true` y la pila local levantada:

```bash
docker compose --profile demo up --build -d
node --env-file=.env --test --test-concurrency=1 backend/apps/api/test/security/*.test.mjs
```

La prueba de reinicio se ejecuta aparte porque restaura los datos de demostración. Necesita presupuesto de sesiones disponible; después de la suite de límites se puede reiniciar **solo la API local** antes de ejecutarla:

```bash
docker compose restart api
# Esperar a que /api/v1/health responda 200.
node backend/apps/api/test/manual/demo-reset.mjs
```

El diseño y las limitaciones están en [ADR-0011](adr/ADR-0011-demo-publica-limitada.md). Los riesgos pendientes del sandbox de producción y el alcance real de cifrado y firma siguen descritos en la revisión inicial.
