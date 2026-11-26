# 21 · Validación de producción

Comprobaciones reales del **26 de noviembre de 2026**. Aplicación: **[https://securetex.dayle.dev](https://securetex.dayle.dev)**. Versión inicial de aplicación: `d2acf099c79895227473630e7b8d828adf47f9db`.

| Comprobación | Resultado |
|---|---|
| HTTPS | Landing y `/health`: 200; API con `status=ok` y `database=true` |
| Entrada | Botón de la portada abre el editor sin formulario de acceso |
| Primera compilación visible | 9389 ms desde el clic hasta el PDF dibujado, una ejecución en Chromium; no incluye la lectura previa de la portada |
| Colaboración | Chromium 159.0.8154.6 y Firefox 159.0 con sesiones independientes, mismo documento y cambios comprobados en ambas direcciones |
| PDF | Compilación ARM64 bajo gVisor, firma Ed25519 comprobada; descarga real de 110345 bytes |
| Móvil | Portada y editor a 390 × 844 sin desbordamiento horizontal |
| Registro | API rechaza nuevas cuentas; comprobado con petición real, no solo con la interfaz |
| Identidades | 9 sintéticas; 0 administradores y 0 contraseñas guardadas |
| Contenedores | 7 propios, todos con límites de memoria y CPU y sin puertos publicados |
| Servicios ajenos | 20 contenedores conservaron ID, arranque, reinicios, redes y puertos frente a la captura previa a instalar gVisor |
| Datos y secretos | PostgreSQL propio, claves nuevas en `.env` con modo 600; API sin credencial del propietario de la base ni token del túnel |
| Publicación | Túnel propio `securetex-oracle`; CNAME proxied de `securetex.dayle.dev`, sin usar nginx-proxy-manager ni puertos del host |

El tiempo de apertura es una observación desde el equipo de revisión, no una garantía de latencia ni una media. Las capturas de esta comprobación móvil no sustituyen las capturas con escala 2 exigidas para el material final de portafolio.

## Versiones observadas en Oracle

| Componente | Versión |
|---|---|
| Node.js | 22.23.5, ARM64 |
| PostgreSQL | 17.12, Debian 17.12-1.pgdg12+1 |
| nginx | 1.30.8 |
| gVisor | release-20261123.1, `systrap`, sin red |
| pdfTeX | 3.141592653-2.6-1.40.24, TeX Live 2022/Debian |
| kpathsea | 6.3.4 |

Las imágenes de API, web y compilador se inspeccionaron como `arm64`. PostgreSQL, nginx y cloudflared están fijados mediante digests en el script de despliegue.

## Correcciones durante la puesta en marcha

La compilación de Next dependía de descargar fuentes de Google y falló bajo emulación. Se copiaron los mismos 17 WOFF2 ya usados por la aplicación, con sus licencias, rangos Unicode y métricas de fallback. Las familias y medidas del título y botones coincidieron en 1440 y 390 px. El recorrido normal completo volvió a pasar después del cambio. No se cambió la tipografía del producto.

Las imágenes de web y TeX Live se construyeron finalmente de forma nativa en Oracle con límites configurados de 1 CPU y 2 GiB por instrucción de construcción; la API se construyó localmente para ARM64. No se instalaron dependencias de aplicación en el sistema del servidor.

Una primera puesta en marcha detectó un permiso 600 que impedía al gateway leer su configuración. La comprobación posterior detuvo la publicación, antes de crear DNS. Se corrigió a 644 únicamente ese archivo de configuración sin secretos y se repitieron las comprobaciones. El `.env` mantiene 600.

El endpoint de salud existente devuelve un cuerpo `degraded` cuando falla la base. El despliegue comprueba también ese cuerpo y `database=true`, además del estado HTTP, para no aceptar una respuesta 200 con la base caída.

El alcance inicial continúa limitado al proyecto público sintético. Las limitaciones de confidencialidad frente al operador y de firma de aplicación, y el trabajador persistente de compilación, están en las revisiones anteriores; no se presentan como aislamiento por trabajo o firma PAdES.
