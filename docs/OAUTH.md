# Cuentas reales

La demo permanece disponible. Las altas de producción siguen cerradas hasta completar las consolas de identidad, verificar SMTP y probar el acceso real. No basta con mostrar los botones.

| Proveedor | Configuración en su consola | URI Web de producción |
|---|---|---|
| Google | Google Auth Platform → Clientes → cliente de aplicación web. Audiencia externa; permisos `openid email profile`. Conservar las URI de localhost si se reutiliza el cliente local. | `https://securetex.dayle.dev/api/v1/auth/oidc/google/callback` |
| Microsoft | Entra ID → App registrations → aplicación → Authentication → plataforma Web. Audiencia **Any Entra ID Tenant + Personal Microsoft accounts**. | `https://securetex.dayle.dev/api/v1/auth/oidc/microsoft/callback` |

No habilitar flujo implícito. La aplicación usa código, PKCE S256, state y nonce de un solo uso. `openid-client` verifica firma, audiencia, emisor y nonce; su soporte de Entra resuelve el emisor de cada tenant al usar `common`. Una política de la organización del visitante puede requerir consentimiento de su administrador.

En Google Auth Platform → Público (Audience), usar audiencia externa y **Publicar aplicación / Publish app** para pasar a **En producción**. Se conserva el mismo cliente y sus URI. Google aplica una excepción al límite de usuarios de prueba cuando solo se solicitan `openid email profile`, como hace SecureTex: Testing por sí solo no demuestra que el acceso de otra cuenta esté bloqueado. La publicación, la verificación de marca y la aprobación de permisos sensibles son estados distintos; comprobar el consentimiento real después de configurar la consola.

En Branding, la página principal es `https://securetex.dayle.dev`, la política `https://securetex.dayle.dev/privacidad` y las condiciones `https://securetex.dayle.dev/terminos`; el dominio autorizado es `dayle.dev`. La política es pública y está enlazada desde el pie y el registro. Explica los datos de identidad recibidos de Google, su uso, documentos, proveedores, conservación y eliminación. `PUBLIC_SUPPORT_EMAIL`, configurado solo en el entorno del servidor, proporciona el contacto público autorizado. Antes de solicitar otra verificación, comprobar las tres URL con HTTPS y respuesta 200; no presentar rutas pendientes o una página de acceso como política.

En `~/securetex/.env` del servidor, con permisos 600: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` y `MICROSOFT_TENANT=common`. Si se crea un cliente de producción nuevo, conservar las credenciales locales anteriores. Nunca enviar secretos por chat ni añadirlos a Git.

El correo transaccional requiere `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` y `MAIL_FROM`. Por ejemplo, Resend admite SMTP TLS en 465, usuario `resend` y una clave como contraseña; hay que verificar primero el dominio remitente con los registros que indique su consola. No cambiar los MX del dominio principal: usar un subdominio propio de envío. En 587 la aplicación exige STARTTLS en producción. No se desactiva la validación de certificados.

El dominio elegido en Resend es `securetex.dayle.dev`; el remitente previsto es `SecureTex <no-reply@securetex.dayle.dev>`. Añadir solamente los registros de verificación y envío que solicite Resend bajo ese subdominio, sin modificar el CNAME de la aplicación ni el correo de `dayle.dev`.

Antes de poner `REGISTRATION_ENABLED=true`: comprobar autenticación SMTP, entrega y enlace de verificación; redirecciones Google y Microsoft; alta pendiente de Microsoft; rechazo de operaciones que exigen correo verificado; acceso cruzado entre cuentas; compilación efímera y PDF firmado. Después de publicar, comprobar el consentimiento completo de ambos proveedores. El guard de arranque rechaza registro público de producción sin SMTP autenticado externo. Mailpit queda reservado al Compose local.

Una coincidencia de correo nunca vincula identidades automáticamente. Las identidades existentes pueden seguir entrando con las altas cerradas. Los nuevos usuarios de Microsoft reciben siempre la verificación habitual y quedan sin permisos de cuenta verificada hasta completarla: Microsoft no garantiza la titularidad de su claim de correo. Se conserva el estado verificado de las cuentas ya existentes. Mantener desactivado el seguimiento de aperturas y clics de Resend para no reescribir enlaces de autenticación; es su configuración predeterminada.

Fuentes: [Google: aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server), [Google: estado y audiencia](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [Microsoft: registro](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [Microsoft: claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference), [Resend: SMTP](https://resend.com/changelog/smtp-service).
