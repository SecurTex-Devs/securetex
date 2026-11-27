# Revisión con OWASP ZAP

La revisión conserva los hallazgos originales, incluidos los informativos. Un informe vacío no equivale a una aplicación segura: las reglas de ZAP también describen la autenticación, las sesiones y las distintas políticas de caché.

## Alcance

Se ejecutó primero una exploración pasiva de `https://securetex.dayle.dev`. El análisis activo utiliza una copia HTTPS local con base separada, usuarios sintéticos y Mailpit interno. El recorrido registra la portada, las plantillas, el acceso de una cuenta verificada, el editor, una compilación real y el PDF pintado. No genera carga de ataque en Oracle ni envía correos a personas.

El fuzzing excluye los endpoints de autenticación; sus controles se comprueban mediante los 82 casos de abuso de CI. El escáner conserva una sesión válida mediante renovaciones reales. Los límites del análisis y el estado de cada regla se registran: una regla pendiente o un navegador que no arranca impiden considerar terminada la pasada.

La imagen oficial es ZAP **2.17.0**, digest `sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af`, con reglas estables y beta. Las versiones de los complementos figuran en el [resultado medido](security/zap/revision-local.json). Los informes HTML/JSON originales se conservan fuera de Git porque pueden contener cookies y evidencias. El JSON público conserva los 13 tipos y las instancias representativas exportadas por el informe; omite evidencias, cuerpos, cookies, queries e identificadores. No contiene todas las alertas de la API.

La pasada sobre `a6b81c9` terminó con **20 115 peticiones activas**, **398 eventos de alerta** y estos **13 tipos**: uno alto, dos medios, uno bajo y nueve informativos. Son cifras brutas, anteriores a las correcciones de `d2ab64f`; los eventos del escáner y los tipos deduplicados son métricas distintas. No se presenta como un resultado sin alertas.

De las **75 reglas**, **68 terminaron** y **7 quedaron omitidas**: DOM XSS, User Agent Fuzzer y Backup File Disclosure agotaron el minuto por regla; Log4Shell y Text4Shell necesitaban OAST; Active Script no tenía scripts y enumeración de usuarios quedó fuera del fuzzing de autenticación. La revisión automática rechazó activar un proveedor OAST externo por la salida de datos a un tercero no autorizada. Se mantuvo desactivado. El estado global `FINISHED` no acredita la ejecución de esas siete reglas ni una pasada completa de la revisión corregida.

## Correcciones

La exploración pasiva inicial encontró cinco tipos de nivel bajo y cuatro informativos. Las cabeceras del middleware no alcanzaban los recursos estáticos ni algunas redirecciones. El análisis autenticado identificó además dos 404 HTML sin CSP y la respuesta de apertura del WebSocket sin HSTS.

| Hallazgo | Corrección comprobable |
|---|---|
| COEP ausente en HTML; CORP, permisos, HSTS y `nosniff` ausentes en estáticos | Cabeceras comunes en `next.config.ts`, que también cubren recursos y redirecciones |
| Tipo de contenido ausente en la redirección privada | `text/plain; charset=utf-8` en esa respuesta |
| CSP ausente en los 404 de `/api/v1` y `/_next/static` | CSP de reserva para respuestas excluidas del middleware |
| HSTS ausente en la actualización del WebSocket | Cabecera en el gateway, incluida la respuesta 101 |
| Regla 43, inclusión de archivos en el optimizador de imágenes | No se reprodujo divulgación de código: `/image` y una ruta aleatoria devolvieron el mismo error 400. Se redujo además la entrada del optimizador a `/landing/**`, sin queries ni imágenes remotas; la prueba de navegador comprueba el rechazo de una ruta de API. |
| 90028-1, anuncio de DELETE en OPTIONS | Next.js generaba `Allow: DELETE` para todas las rutas del BFF. OPTIONS ahora llega a la API y responde según la ruta real; se comprueba 404/405 sin ese anuncio genérico. Se conservan las operaciones DELETE autorizadas de la aplicación. |

La reserva permite los scripts propios que importa el worker de PDF.js; mantiene bloqueados scripts en línea y `eval`. Las páginas conservan su nonce. Se volvió a comprobar el renderizado real y la descarga del PDF, además de la colaboración entre Chromium y Firefox. Se conservan el cifrado, los permisos, las cookies de sesión y la caché pública de recursos.

## Observaciones revisadas

Después de publicar `1ba0fb6` se recorrieron pasivamente ocho rutas públicas por HTTPS, sin ataques activos ni sesión de cuenta. La [pasada de producción](security/zap/revision-produccion-pasiva.json) conserva **230 instancias** de la API de alertas y **12 tipos**: cero altos, uno medio, cinco bajos y seis informativos. Todos los medios y bajos de esta pasada corresponden a respuestas `/cdn-cgi/` de Cloudflare; los recursos de la aplicación solo generaron informativos. Esto no sustituye la pasada activa local ni acredita cero alertas.

El medio 10098 identifica `Access-Control-Allow-Origin: *` en el JavaScript público del desafío de Cloudflare. Los bajos describen `cf_clearance` con SameSite=None, cabeceras de recursos del desafío y números interpretados como fechas; no son respuestas privadas de SecureTex. Se conservan también sus observaciones de alcance de cookie y sesión. La [documentación de Cloudflare](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/) confirma que inyecta esos recursos y emite esa cookie. Se mantiene la protección del proveedor y se omiten los identificadores efímeros de sus desafíos al publicar las rutas.

La primera prueba de PDF tras desplegar detectó un worker conservado por Cloudflare con cabeceras antiguas. Se renovó la caché de 128 URL exactas de recursos de SecureTex, sin purgar el resto de `dayle.dev`. Después se comprobó la nueva revisión y se repitieron renderizado, colaboración, compilación y descarga reales en escritorio y móvil.

| Regla | Interpretación y evidencia |
|---|---|
| 43 · Source Code Disclosure, alto | La evidencia de ZAP es una comparación heurística de respuestas del parámetro `url`, no código fuente recuperado. La reproducción directa no confirmó la divulgación. Se conserva su severidad original y se registra el endurecimiento; no se declara resuelto mediante otra pasada completa de ZAP. |
| 40025-2 · Proxy Disclosure, medio | Detecta componentes proxy por diferencias ante TRACE, TRACK y OPTIONS. La aplicación usa nginx y un BFF de forma deliberada. No se acreditó un proxy abierto, reflexión de credenciales ni omisión de autorización. Se mantiene la observación y su riesgo de identificación de infraestructura. |
| 10010 · Cookie sin HttpOnly | Se refiere a `__Host-stx_csrf`, que el cliente debe leer para enviar `X-CSRF-Token`. No autentica por sí sola; su hash está ligado a la sesión y se valida en el servidor. Las cookies de acceso y refresco sí son HttpOnly. Cambiar la cookie CSRF a HttpOnly rompería el mecanismo existente. |
| 90027 · Cookie Slack | El arnés de sesión reemplazaba la cabecera Cookie para mantener el acceso durante el fuzzing; interfiere con una regla que intenta quitar cookies. Una prueba directa sin ZAP confirmó acceso válido 200, cookie de acceso alterada 401 y CSRF incorrecto o ausente 403/403. Esta prueba local adicional no equivale a repetir la regla completa. |
| 10015 · Revisar caché | La evidencia de las respuestas privadas es `no-store`, establecido por la API. Se conserva y se comprueba; la observación no acredita que se estén almacenando documentos. |
| 10049-1, 10049-2 y 10049-3 | Clasifican contenido no almacenable, almacenable que requiere revalidación y contenido cacheable. Los archivos públicos y los datos privados requieren políticas distintas. |
| 10109 · Aplicación web moderna | Identifica una interfaz que ejecuta JavaScript. |
| 10111 y 10112 · Autenticación y sesión identificadas | Identifican el acceso y las cookies; no describen por sí solas una vulnerabilidad. |
| 10104 · User Agent Fuzzer | Registra variaciones según el agente de usuario; por sí sola no demuestra una omisión de permisos. La regla agotó su plazo en esta pasada. |

El conteo bruto y los estados de ejecución se publican tal como se midieron en el JSON. La clasificación contextual de la cookie CSRF se documenta; no se elimina la alerta del informe ni se desactiva la regla para conseguir un cero visual.

Referencias: [clasificación de caché en ZAP](https://www.zaproxy.org/docs/alerts/10049/), [revisión de caché](https://www.zaproxy.org/docs/alerts/10015/), [cookie HttpOnly](https://www.zaproxy.org/docs/alerts/10010/), [prevención CSRF de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [cookies implementadas](https://github.com/SecurTex-Devs/securetex/blob/a6b81c9ab961b5f2c9eb063ec1a1af08128d6f65/backend/apps/api/src/presentation/http/cookies.ts).

Reglas activas revisadas: [inclusión de archivos](https://www.zaproxy.org/docs/alerts/43/), [identificación de proxies](https://www.zaproxy.org/docs/alerts/40025-2/) y [Cookie Slack](https://www.zaproxy.org/docs/alerts/90027/).
