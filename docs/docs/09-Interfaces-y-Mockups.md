# 09 — Interfaces y Mockups

> Este documento **vive en el repositorio del frontend**, porque cambia con cada iteración de la interfaz y debe revisarse junto al código que la implementa.

---

## Dónde está

| Documento | Ubicación |
|---|---|
| Diseño de interfaces, inventario de pantallas y mockups | [`securtex-frontend/Docs/04-Interfaces-y-Mockups.md`](https://github.com/SecurTex-Devs/securtex-frontend/blob/main/Docs/04-Interfaces-y-Mockups.md) |
| Prototipo HTML navegable de todas las pantallas | [`securtex-frontend/Docs/mockups/index.html`](https://github.com/SecurTex-Devs/securtex-frontend/blob/main/Docs/mockups/index.html) |
| Sistema de diseño (colores, tipografía, componentes, estados) | [`securtex-frontend/Docs/03-Sistema-de-Diseno.md`](https://github.com/SecurTex-Devs/securtex-frontend/blob/main/Docs/03-Sistema-de-Diseno.md) |
| Accesibilidad e internacionalización | [`securtex-frontend/Docs/06-Accesibilidad-e-i18n.md`](https://github.com/SecurTex-Devs/securtex-frontend/blob/main/Docs/06-Accesibilidad-e-i18n.md) |
| Criptografía en el cliente (capas C1, C2 y C5) | [`securtex-frontend/Docs/08-Criptografia-en-el-Cliente.md`](https://github.com/SecurTex-Devs/securtex-frontend/blob/main/Docs/08-Criptografia-en-el-Cliente.md) |

---

## Resumen de las pantallas especificadas

| Grupo | Pantallas |
|---|---|
| **Acceso** | Portada · Registro · Verificación de correo · Inicio de sesión · Segundo factor · Recuperación de contraseña · Nueva contraseña |
| **Panel** | Lista de proyectos · Estado vacío · Creación de proyecto · Importación · Gestión de etiquetas · Papelera y archivados |
| **Editor** | Vista dividida · Árbol de archivos · Editor de código · Modo visual · Panel de compilación · Visor PDF · Panel de comentarios · Historial · Chat · Diálogo de compartición · Ajustes del proyecto · Paleta de símbolos · Generador de tablas |
| **Cuenta** | Perfil · Seguridad y sesiones · MFA y passkeys · Proveedores vinculados · Tokens de aplicación · Preferencias del editor · Suscripción · Mis datos y eliminación de cuenta |
| **Plantillas** | Galería · Ficha de plantilla · Publicación de plantilla |
| **Administración** | Panel de métricas · Gestión de usuarios · Moderación de plantillas · Registro de auditoría |
| **Estados transversales** | Carga · Error · Sin permisos · Sin conexión · Mantenimiento · Compilación bloqueada por seguridad |
| **Cifrado** | Guardado cifrado con `Ctrl+S` · Modo confidencial y claves de recuperación · Contenido no verificable |

**Total: 50 pantallas especificadas**, cada una con su mockup navegable, sus estados, su anotación de seguridad y su anotación de accesibilidad.

---

## Relación con esta documentación

- Las pantallas implementan los requisitos `RF-*` del [documento 02](02-Requisitos.md).
- Los flujos que las recorren están en [07-Casos-de-Uso.md](07-Casos-de-Uso.md).
- Los mensajes de error siguen las reglas de RNF-031: nunca exponen detalles internos.
