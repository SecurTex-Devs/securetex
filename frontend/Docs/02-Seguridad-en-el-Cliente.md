# 02 — Seguridad en el Cliente

> **Repositorio:** `securtex-frontend`
> **Premisa:** el navegador está bajo control del usuario. El frontend **no puede** proteger datos frente a su propio usuario; su trabajo es no crear vulnerabilidades y no filtrar lo que el servidor confía.

---

## 1. Qué protege y qué no protege el frontend

| El frontend **sí** es responsable de | El frontend **nunca** es responsable de |
|---|---|
| No introducir XSS | Autorizar el acceso a un recurso |
| No filtrar tokens ni secretos | Validar reglas de negocio |
| Aplicar CSP y cabeceras correctamente | Impedir que el usuario vea sus propios datos |
| Sanear todo contenido de terceros que renderice | Garantizar la integridad de lo que envía |
| No dejar datos sensibles en almacenamiento local | Limitar la tasa de peticiones |

> Ocultar un botón es **cortesía visual**, no un control. Cualquier restricción de la interfaz debe existir también en el servidor (T-P03).

---

## 2. Prevención de XSS

### 2.1 Reglas absolutas

| Regla | Verificación |
|---|---|
| Prohibido `dangerouslySetInnerHTML` sin `DOMPurify` | Regla de ESLint que falla el build |
| Prohibido `eval`, `new Function`, `setTimeout` con cadena | ESLint + Semgrep |
| Prohibido construir HTML concatenando cadenas | Revisión de código |
| Prohibido `href` con esquema no validado | Utilidad `safeUrl()` obligatoria |
| Nunca renderizar SVG subido por el usuario en línea | Se sirve como `<img>` desde el origen de contenido |

### 2.2 Enlaces

```ts
// src/shared/security/safeUrl.ts
const ESQUEMAS_PERMITIDOS = new Set(['http:', 'https:', 'mailto:']);

export function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw, window.location.origin);
    return ESQUEMAS_PERMITIDOS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
```

Esto bloquea `javascript:`, `data:`, `vbscript:` y `blob:` en cualquier enlace que provenga de contenido del usuario: bibliografías, comentarios, chat y descripciones de plantilla.

### 2.3 Superficies de riesgo del producto

| Superficie | Origen del contenido | Tratamiento |
|---|---|---|
| Nombre de proyecto y de archivo | Usuario | Escapado por React; validado por esquema |
| Chat y comentarios | Colaboradores | Escapado; sin interpretación de HTML ni Markdown con etiquetas |
| Nombres de colaborador en cursores | Otros usuarios | Escapado; longitud limitada |
| Registro de compilación | **Compilador con entrada del usuario** | Ya saneado en el servidor; se renderiza como texto plano |
| Descripción de plantilla | Cualquier usuario | Markdown restringido a un subconjunto seguro + DOMPurify |
| Entradas `.bib` | Archivo del proyecto | Texto plano |

---

## 3. Content Security Policy

Generada por el middleware de Next.js con un **nonce por petición**:

```
default-src 'none';
script-src 'nonce-{ALEATORIO}' 'strict-dynamic';
style-src 'self';
img-src 'self' https://contenido.securtex.app data: blob:;
font-src 'self';
connect-src 'self' https://api.securtex.app wss://collab.securtex.app;
worker-src 'self' blob:;
frame-ancestors 'none';
base-uri 'none';
form-action 'self';
object-src 'none';
upgrade-insecure-requests;
report-uri /api/csp-report
```

| Decisión | Motivo |
|---|---|
| Sin `unsafe-inline` ni `unsafe-eval` | Elimina el vector principal de explotación de un XSS |
| `default-src 'none'` | Denegar por defecto; se abre solo lo necesario |
| Tailwind en lugar de CSS-in-JS en ejecución | Permite `style-src 'self'` sin `unsafe-inline` |
| `frame-ancestors 'none'` | Impide el *clickjacking* |
| `worker-src blob:` | Necesario para el Web Worker de PDF.js |
| `report-uri` | Toda violación se registra y se investiga |

**Verificación:** el test `e2e/security/csp.spec.ts` comprueba la cabecera en todas las rutas y que no exista ningún script en línea sin nonce.

**Implementación actual:** el ejemplo anterior describe el objetivo. `middleware.ts` genera la política del mismo origen con nonce en scripts y estilos; `media-src 'self'` permite el vídeo propio de la portada. `style-src-attr 'unsafe-inline'` se reserva al posicionamiento de Radix y KaTeX. Las cabeceras comunes se definen en `next.config.ts` para cubrir también `/_next/static`, imágenes y redirecciones: HSTS, `nosniff`, DENY, COOP y CORP `same-origin`, COEP `credentialless` y permisos de cámara, micrófono, ubicación, pagos y USB denegados. Las rutas de verificación y recuperación mantienen `Referrer-Policy: no-referrer`. Se conserva la caché inmutable de recursos públicos y nunca se aplica a los datos privados. La comprobación ejecutable de esta entrega está en `tools/ci/e2e.mjs`; no se presupone que exista el archivo de prueba objetivo indicado arriba.

Las respuestas excluidas del middleware, incluidos los 404 de recursos, reciben una CSP de reserva. Permite importar scripts del mismo origen porque el worker de PDF.js carga otros chunks del build; mantiene bloqueados scripts en línea y `eval`. Las páginas conservan su política con nonce. El gateway añade HSTS también a la respuesta de actualización del WebSocket.

---

## 4. Sesión y tokens

| Regla | Motivo |
|---|---|
| La sesión vive en una cookie `__Host-sid`, `HttpOnly`, `Secure`, `SameSite=Lax` | El JavaScript no puede leerla: un XSS no roba la sesión (T-A03) |
| **Nunca** se guarda un token en `localStorage` ni en `sessionStorage` | Accesibles desde cualquier script |
| El token de colaboración vive **solo en memoria** | No persiste ni se filtra |
| El token de colaboración viaja en el subprotocolo del WebSocket | No aparece en la URL, ni en registros, ni en el historial |
| El refresco se intenta **una sola vez** por respuesta 401 | Evita bucles de reintento |
| Cerrar sesión limpia el estado en memoria, IndexedDB y la caché de consultas | Evita fugas entre usuarios en un equipo compartido |

---

## 5. Almacenamiento local

| Dato | Dónde | Justificación |
|---|---|---|
| Preferencias de interfaz (tema, tamaño de fuente) | `localStorage` | No sensible |
| Documento en edición | **IndexedDB** (Yjs) | Necesario para trabajar sin conexión |
| Tokens | **En ningún sitio persistente** | — |
| Datos de otros usuarios | **Nunca** | — |

**Modo confidencial:** en un proyecto marcado como confidencial (F-268) se **desactiva la persistencia en IndexedDB**; al perder la conexión el editor pasa a solo lectura. Se prefiere la pérdida de comodidad a dejar contenido sensible en el dispositivo.

Al cerrar sesión se ejecuta `indexedDB.deleteDatabase()` sobre todas las bases del origen.

---

## 6. Endurecimiento del visor PDF

Un PDF puede contener JavaScript, formularios, enlaces externos y adjuntos.

```ts
const documento = await pdfjs.getDocument({
  url: urlFirmada,
  enableScripting: false,      // sin JavaScript embebido
  isEvalSupported: false,      // sin eval en el parseo de fuentes
  disableAutoFetch: true,
  disableRange: false,
  useWorkerFetch: false,
}).promise;
```

Además:

- El renderizado ocurre en un **Web Worker**, aislado del hilo principal.
- El PDF se sirve desde un **origen distinto** (`contenido.securtex.app`) con `Content-Disposition: attachment` y `nosniff` (RS-025).
- Los enlaces del PDF pasan por `safeUrl()` antes de activarse.
- Los adjuntos incrustados no se ofrecen para descarga.

---

## 7. Validación de entrada en el cliente

La validación del cliente es **usabilidad**, no seguridad: mejora el mensaje de error y ahorra un viaje al servidor. La validación real es la del backend.

Se comparte el **mismo esquema Zod** entre cliente y servidor (paquete `contracts`), lo que evita la divergencia que suele abrir agujeros:

```ts
export const inviteMemberSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['editor', 'reviewer', 'viewer']),   // 'owner' nunca es invitable
});
```

---

## 8. Dependencias

| Regla | Detalle |
|---|---|
| `pnpm` con lockfile e instalación estricta | Reproducibilidad |
| Toda dependencia nueva se justifica en el PR | Alternativas, mantenimiento, dependencias transitivas |
| Prohibidos los scripts de post-instalación no auditados | `pnpm` los bloquea por defecto |
| Sin CDN de terceros | La CSP lo impide; todo se sirve desde el propio origen |
| SCA en cada push | OSV-Scanner; crítico o alto bloquea el merge |

**Sin recursos externos:** ni fuentes de Google, ni analíticas de terceros, ni scripts de widgets. Cada dominio externo es un tercero con capacidad de ejecutar código en la página.

---

## 9. Suite de pruebas de seguridad del frontend

```
e2e/security/
├── csp.spec.ts                Cabeceras presentes y sin scripts en línea sin nonce
├── xss-stored.spec.ts         Payloads en nombre de proyecto, archivo, chat y comentario
├── xss-url.spec.ts            javascript:, data:, vbscript: en enlaces del usuario
├── token-leakage.spec.ts      Ningún token en localStorage, URL ni DOM
├── pdf-js-injection.spec.ts   PDF con JavaScript embebido → no se ejecuta
├── session-cleanup.spec.ts    Cerrar sesión limpia IndexedDB y la caché
├── role-ui-enforcement.spec.ts Un lector no puede escribir aunque manipule el DOM
├── offline-confidential.spec.ts Modo confidencial no persiste en IndexedDB
└── ws-close-codes.spec.ts     4403 no reintenta; 4401 renueva el token
```

---

## 10. Documentos relacionados

- [01-Arquitectura-Frontend.md](01-Arquitectura-Frontend.md)
- [`../AGENTS.md`](../AGENTS.md) — reglas obligatorias para quien escriba código aquí
- [`securtex-docs` · 05-Seguridad](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/05-Seguridad.md)
