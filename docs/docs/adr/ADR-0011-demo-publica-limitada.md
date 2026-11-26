# ADR-0011 · Demostración pública con alcance de sesión

Estado: implementado para revisión y validación local. El despliegue requiere completar su fase correspondiente.

## Contexto

La portada debe permitir probar el editor sin registrar una cuenta. Las identidades académicas existentes incluyen una administradora y no sirven para ese acceso público. Las cuentas normales deben conservar sus permisos, flujos y preferencias.

## Decisión

El endpoint dedicado `POST /api/v1/auth/demo` emite las cookies y tokens existentes, con una sesión de 30 minutos sin elevación ni persistencia de acceso. El método guardado en PostgreSQL incluye el UUID del proyecto de demostración. La API obtiene ese alcance del registro de sesión, nunca del cuerpo ni de una cabecera enviada por el visitante.

Se usan ocho identidades sintéticas sin contraseña, proveedores vinculados ni privilegios de administración, con el rol de editor del único proyecto de muestra. Una identidad separada, sin acceso interactivo, es su propietaria. La demo no crea ni importa archivos: solo permite editar el documento preparado, leerlo, colaborar y compilarlo. Se conservan las cuotas existentes de archivo, historial, CRDT y sandbox.

El guard deniega las acciones de demo salvo las declaradas expresamente. Los flujos públicos de autenticación conservan su autenticación propia: una persona puede iniciar sesión con las credenciales de su cuenta normal, completar MFA o recuperar su contraseña después de visitar la demo. Esto no habilita acciones de cuenta con la identidad de demostración. El registro público tiene un interruptor independiente y está deshabilitado por defecto; Compose lo habilita para las pruebas locales. El interruptor también se comprueba antes de crear un usuario nuevo mediante OIDC, después de resolver las identidades ya vinculadas.

| Límite adicional de demo | Por IP | Global, una instancia de API |
|---|---|---|
| Inicio de sesiones | 10 por hora | 100 por hora |
| Compilación | 3 por minuto | 60 por hora |
| Peticiones autenticadas | 120 por minuto | 1200 por minuto |

Los presupuestos tienen memoria acotada. Las peticiones rechazadas por el límite individual no agotan el presupuesto de otras IP. El compilador mantiene los límites originales de concurrencia, tiempo, memoria, PID y salida.

`seed-demo.js --watch` renueva el proyecto cada medianoche de `America/Guayaquil`, revoca y elimina las sesiones y tokens de correo de esas identidades. Si el proceso estuvo apagado durante el cambio de día, comprueba la fecha del proyecto al arrancar y recupera el reinicio pendiente. Usa los roles existentes y el contexto RLS de la propietaria de la demo; no necesita el rol de migración. Las cuentas, proyectos y sesiones normales no forman parte de sus selecciones. La auditoría mantiene su política append-only.

El borrado respeta el paso por la papelera que exige RLS, dentro de la misma transacción que crea el documento nuevo. Un bloqueo transaccional serializa los reinicios simultáneos. Si quedan proyectos anteriores, se aborta la transacción en lugar de acumular copias.

El cifrado, las firmas y el sandbox no se rediseñan. La portada habla del producto y presenta los controles en lenguaje breve. El alcance real del cifrado y la firma de aplicación se documenta en la [revisión local](../18-Revision-Local.md).

## Alternativas descartadas

- Compartir las credenciales del seed académico: expondría una cuenta administradora y un acceso reutilizable sin las restricciones de la demo.
- Acceso sin autenticación a los endpoints del editor: debilitaría las fronteras existentes y complicaría la autorización de WebSocket y archivos.
- Copiar las claves o contraseñas locales a JavaScript: expondría secretos y no proporcionaría autorización de servidor.

## Consecuencias

El documento de demo es compartido: otras visitas pueden modificarlo y sus cambios son visibles. La interfaz lo indica y pide usar únicamente datos de ejemplo. El reinicio nocturno recupera el documento original. Los límites pueden rechazar temporalmente una visita cuando hay mucha actividad.

Los contadores en memoria son adecuados para la instancia única prevista; si la API se replica, deben pasar a un almacén común antes de ampliar el despliegue. Un reinicio de API reinicia esos contadores, pero no amplía la fecha de caducidad de las sesiones ya emitidas.

El modo de demostración no sustituye la revisión de seguridad necesaria para ejecutar LaTeX de Internet. Los riesgos residuales del compilador y el requisito de aislamiento de producción siguen vigentes.

## Verificación

Las pruebas de `demo.test.mjs` comprueban sesión, CSRF, restricciones de cuenta y administración, alcance incluso con una membresía adicional, compilación y límites. Las pruebas unitarias comprueban los presupuestos y su separación. Las suites y recorridos habituales deben repetirse con cuentas normales antes de cerrar esta fase.
