# Cuentas reales

La demo permanece disponible. Las altas de producción siguen cerradas hasta completar las consolas de identidad, verificar SMTP y probar el acceso real. No basta con mostrar los botones.

| Proveedor | Configuración en su consola | URI Web de producción |
|---|---|---|
| Google | Google Auth Platform → Clientes → cliente de aplicación web. Audiencia externa; permisos `openid email profile`. Conservar las URI de localhost si se reutiliza el cliente local. | `https://securetex.dayle.dev/api/v1/auth/oidc/google/callback` |
| Microsoft | Entra ID → App registrations → aplicación → Authentication → plataforma Web. Audiencia **Any Entra ID Tenant + Personal Microsoft accounts**. | `https://securetex.dayle.dev/api/v1/auth/oidc/microsoft/callback` |

No habilitar flujo implícito. La aplicación usa código, PKCE S256, state y nonce de un solo uso. `openid-client` verifica firma, audiencia, emisor y nonce; su soporte de Entra resuelve el emisor de cada tenant al usar `common`. Una política de la organización del visitante puede requerir consentimiento de su administrador.

En `~/securetex/.env` del servidor, con permisos 600: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` y `MICROSOFT_TENANT=common`. Si se crea un cliente de producción nuevo, conservar las credenciales locales anteriores. Nunca enviar secretos por chat ni añadirlos a Git.

El correo transaccional requiere `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` y `MAIL_FROM`. Por ejemplo, Resend admite SMTP TLS en 465, usuario `resend` y una clave como contraseña; hay que verificar primero el dominio remitente con los registros que indique su consola. No cambiar los MX del dominio principal: usar un subdominio propio de envío. En 587 la aplicación exige STARTTLS en producción. No se desactiva la validación de certificados.

El dominio elegido en Resend es `securetex.dayle.dev`; el remitente previsto es `SecureTex <no-reply@securetex.dayle.dev>`. Añadir solamente los registros de verificación y envío que solicite Resend bajo ese subdominio, sin modificar el CNAME de la aplicación ni el correo de `dayle.dev`.

Antes de poner `REGISTRATION_ENABLED=true`: comprobar autenticación SMTP, entrega y enlace de verificación; acceso Google y Microsoft; alta pendiente si Microsoft no afirma `email_verified`; rechazo de operaciones que exigen correo verificado; acceso cruzado entre cuentas; compilación efímera y PDF firmado. El guard de arranque rechaza registro público de producción sin SMTP autenticado externo. Mailpit queda reservado al Compose local.

Una coincidencia de correo nunca vincula identidades automáticamente. Las identidades existentes pueden seguir entrando con las altas cerradas. Los nuevos usuarios de Microsoft que no traigan confirmación de correo reciben la verificación habitual y quedan sin permisos de cuenta verificada hasta completarla.

Fuentes: [Google: aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server), [Google: estado y audiencia](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [Microsoft: registro](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [Microsoft: claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference), [Resend: SMTP](https://resend.com/changelog/smtp-service).
