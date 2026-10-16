# ADR-0003 · Keycloak como proveedor de identidad

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Responsable de seguridad
- **Afecta a:** `auth-service`, integración con Google, Microsoft, ORCID y SSO institucional

## Contexto

El requisito exige inicio de sesión con **Google** y **Microsoft**, SSO institucional **SAML 2.0**, segundo factor **TOTP** y **WebAuthn**, políticas de contraseña y detección de fuerza bruta.

Implementar correctamente OIDC y SAML no es "integrar una librería": implica validar firmas con rotación de JWKS, `iss`, `aud`, `exp` y `nonce`; gestionar `state` y PKCE; y, en SAML, la canonicalización XML con sus ataques de *signature wrapping*. Es uno de los terrenos donde más implementaciones propias han fallado históricamente.

## Alternativas

| Opción | Ventajas | Inconvenientes |
|---|---|---|
| Implementación propia con `passport` u similar | Control total, aprendizaje | Altísima probabilidad de introducir un fallo sutil de seguridad; sin SAML realista |
| Auth0 / Clerk / Firebase Auth | Cero mantenimiento | Dependencia de un tercero; datos de identidad fuera del control del proyecto; contradice el requisito de despliegue autoalojable |
| Ory (Kratos + Hydra) | Moderno, modular, en Go | Más piezas que integrar; SAML requiere componente adicional |
| **Keycloak 26** | OIDC, SAML, Google, Microsoft, ORCID, WebAuthn, TOTP, políticas y *brute force detection* nativos; autoalojable; maduro y auditado | Pesado (JVM); curva de configuración |

## Decisión

**Keycloak** como proveedor de identidad, con `auth-service` encargándose únicamente de la sesión de aplicación, el motor de riesgo, los tokens de aplicación y la auditoría.

El aprendizaje de la asignatura no se pierde: se traslada de *implementar* protocolos a *configurarlos correctamente y endurecerlos*, que es lo que realmente se hace en la industria y donde se producen la mayoría de los fallos reales.

## Endurecimiento aplicado

- Realm dedicado; consola de administración **no expuesta** públicamente.
- Cuenta de administrador con MFA obligatoria y restricción por IP.
- `sslRequired=all`; tiempos de vida de token cortos.
- Base de datos propia con credenciales exclusivas.
- Imagen ejecutada como usuario no root.
- Un `client_id` distinto por proveedor; `redirect_uri` exactas, sin comodines.
- SPI propio para la comprobación de contraseñas contra HIBP.

## Consecuencias

**Positivas** — Se eliminan de golpe las amenazas T-A05, T-A06 y T-A07; se obtiene SAML y WebAuthn sin escribir código de protocolo.

**Negativas** — Una pieza más que operar y actualizar; consumo de memoria de la JVM; la configuración del realm debe versionarse como código (se exporta a `infra/keycloak/realm-export.json` y se aplica de forma automatizada).

## Relacionadas

- [04-Stack-Tecnologico.md §5](../04-Stack-Tecnologico.md)
- [07-Casos-de-Uso.md · CU-02](../07-Casos-de-Uso.md)
