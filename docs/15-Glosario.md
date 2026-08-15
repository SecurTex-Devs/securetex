# 14 — Glosario

> Términos, acrónimos y decisiones de vocabulario del proyecto TeXGuard.

---

## A — Arquitectura y desarrollo

| Término | Definición |
|---|---|
| **ADR** | *Architecture Decision Record*. Documento breve que registra una decisión arquitectónica, su contexto, las alternativas y sus consecuencias. |
| **Arquitectura hexagonal** | Patrón de puertos y adaptadores: el dominio no conoce la infraestructura. Permite sustituir base de datos, transporte o proveedor criptográfico sin tocar la lógica de negocio. |
| **BFF** | *Backend For Frontend*. Capa que agrega y adapta los servicios internos a las necesidades del cliente. |
| **C4** | Modelo de documentación de arquitectura en cuatro niveles: contexto, contenedores, componentes y código. |
| **CRDT** | *Conflict-free Replicated Data Type*. Estructura de datos cuyas operaciones son conmutativas e idempotentes, de modo que todas las réplicas convergen sin coordinación central. Base de la edición colaborativa de TeXGuard (Yjs). |
| **DTO** | *Data Transfer Object*. Objeto que define la forma exacta de una petición o respuesta; en TeXGuard es también la definición de validación y de documentación. |
| **Objeto de valor** | Tipo del dominio que encapsula una regla de validación: si el objeto existe, el dato es válido. Ejemplo: `SafeFileName`, `Email`. |
| **OT** | *Operational Transformation*. Algoritmo alternativo al CRDT para edición concurrente; descartado en TeXGuard (ver ADR-0004). |
| **Monorepo** | Un repositorio con varios paquetes gestionados conjuntamente. TeXGuard usa un monorepo **dentro de cada** repositorio (backend y frontend), no entre ellos. |

---

## B — Seguridad

| Término | Definición |
|---|---|
| **Argon2id** | Función de derivación de clave ganadora del *Password Hashing Competition*. Resistente a ataques con GPU y a canales laterales. Usada para contraseñas y tokens. |
| **ASVS** | *Application Security Verification Standard* de OWASP. Catálogo de requisitos de seguridad verificables, en tres niveles. |
| **Casos de abuso** | *Misuse cases*. Modelado del atacante como actor: qué quiere lograr y qué caso de uso legítimo amenaza. |
| **Crypto-shredding** | Borrado definitivo de datos mediante la destrucción de la clave que los cifra, en lugar de (o además de) borrar los datos. |
| **CSP** | *Content Security Policy*. Cabecera que restringe qué recursos puede cargar y ejecutar una página. En TeXGuard es estricta y basada en *nonce*. |
| **Defensa en profundidad** | Múltiples controles independientes para la misma amenaza, de modo que el fallo de uno no implique compromiso. |
| **Denegar por defecto** | Todo está prohibido salvo lo explícitamente permitido: rutas, puertos, *capabilities*, políticas. |
| **DEK / KEK** | *Data Encryption Key* / *Key Encryption Key*. Clave que cifra los datos y clave que cifra a la anterior. Base del cifrado sobre envolvente. |
| **Envelope encryption** | Cifrado en capas: los datos se cifran con una DEK, la DEK con una KEK, y la KEK con una clave maestra que nunca sale del gestor de claves. |
| **Fail closed** | Ante un fallo o una ambigüedad, el sistema deniega. Lo contrario (*fail open*) es la causa habitual de brechas. |
| **Frontera de confianza** | Límite en el que el nivel de confianza de los datos cambia. Todo cruce debe validar, autenticar y registrar. |
| **gVisor** | Kernel de espacio de usuario escrito en Go que intercepta las llamadas al sistema del contenedor. Aísla el compilador LaTeX del kernel real. |
| **HIBP** | *Have I Been Pwned*. Servicio que permite comprobar si una contraseña aparece en filtraciones conocidas, mediante k-anonimato (solo se envía el prefijo del hash). |
| **IDOR** | *Insecure Direct Object Reference*. Acceder a un recurso ajeno cambiando su identificador. Amenaza principal de la gestión de proyectos. |
| **LFI** | *Local File Inclusion*. Lectura de ficheros arbitrarios del servidor. En LaTeX, mediante `\input`. |
| **mTLS** | TLS mutuo: ambos extremos presentan certificado. Usado en toda la comunicación interna. |
| **PKCE** | *Proof Key for Code Exchange*. Extensión de OAuth 2.0 que impide la interceptación del código de autorización. |
| **RCE** | *Remote Code Execution*. La amenaza de mayor severidad del sistema, inherente a compilar LaTeX. |
| **RLS** | *Row Level Security*. Políticas de PostgreSQL que filtran las filas visibles por usuario, aplicadas por el motor de base de datos. Segunda barrera de autorización. |
| **SAST / DAST / SCA** | Análisis estático del código / análisis dinámico de la aplicación en ejecución / análisis de composición de dependencias. |
| **SBOM** | *Software Bill of Materials*. Inventario firmado de todos los componentes de una versión. |
| **Seccomp** | Mecanismo del kernel Linux que limita las llamadas al sistema que un proceso puede realizar. |
| **Security Champion** | Persona del equipo con responsabilidad explícita sobre la seguridad del producto. |
| **Shell escape** | Capacidad de LaTeX (`\write18`) de ejecutar comandos del sistema. **Deshabilitada de forma permanente e inviolable** en TeXGuard. |
| **SLSA** | *Supply-chain Levels for Software Artifacts*. Marco de niveles de garantía sobre la cadena de suministro. |
| **SSRF** | *Server-Side Request Forgery*. Hacer que el servidor realice peticiones a destinos elegidos por el atacante. Amenaza de la función "crear archivo desde URL". |
| **STRIDE** | Taxonomía de amenazas: *Spoofing*, *Tampering*, *Repudiation*, *Information disclosure*, *Denial of service*, *Elevation of privilege*. |
| **WebAuthn / Passkeys** | Estándar de autenticación con criptografía asimétrica vinculada al origen; resistente al phishing por diseño. |
| **Zip-slip** | Vulnerabilidad al extraer archivos comprimidos con rutas que escapan del directorio destino (`../`). |

---

## C — LaTeX y composición

| Término | Definición |
|---|---|
| **Biber / BibTeX** | Procesadores de bibliografía. `biber` es el moderno, usado con BibLaTeX. |
| **chktex** | Analizador de estilo y errores comunes de LaTeX; alimenta los avisos del editor. |
| **CTAN** | *Comprehensive TeX Archive Network*. Repositorio central de paquetes LaTeX. |
| **latexmk** | Orquestador que ejecuta las pasadas necesarias de compilación hasta que las referencias convergen. |
| **LuaLaTeX** | Motor que embebe un intérprete Lua. Potente y, por lo mismo, un riesgo de seguridad: se ejecuta en modo restringido. |
| **pdfLaTeX / XeLaTeX** | Motores de compilación. XeLaTeX admite fuentes del sistema y Unicode nativo. |
| **SyncTeX** | Mecanismo que asocia cada posición del PDF con su línea del fuente, y viceversa. |
| **TeX Live** | Distribución completa de TeX. TeXGuard embarca el esquema `full` para cubrir todos los comandos y paquetes. |
| **texcount** | Utilidad que cuenta palabras en un documento LaTeX ignorando el marcado. |
| **`texmf.cnf`** | Fichero de configuración de la distribución TeX. En TeXGuard contiene los controles de seguridad no modificables por el usuario. |

---

## D — Producto

| Término | Definición |
|---|---|
| **Colaborador** | Usuario con acceso a un proyecto que no es su propietario. Puede ser editor, revisor o lector. |
| **Control de cambios** | Modo en el que las modificaciones se registran como sugerencias con autoría, para ser aceptadas o rechazadas. |
| **Documento principal** | Archivo `.tex` que se pasa al compilador; los demás se incluyen desde él. |
| **Enlace de compartición** | Token que concede acceso a un proyecto sin invitación nominal. Revocable y regenerable. |
| **Modo confidencial** | Modo de proyecto que desactiva enlaces públicos, exige MFA a todos los colaboradores y marca el PDF. Añadido de TeXGuard, no existe en Overleaf. |
| **Modo visual** | Edición con formato enriquecido y matemáticas renderizadas, frente al modo código. |
| **Plantilla** | Proyecto publicado para que otros lo usen como punto de partida. Es código que otros ejecutarán: se modera y se analiza. |
| **Revisor** | Rol que puede comentar y sugerir, pero no modificar el documento aceptado. |

---

## E — Convenciones de vocabulario del proyecto

| Se dice | No se dice | Motivo |
|---|---|---|
| "el sistema **deniega**" | "el sistema no permite" | Precisión: la denegación es un acto registrado |
| "**usuario no confiable**" | "usuario malicioso" | Todo usuario es no confiable por defecto, sin juicio de intención |
| "**contener** el impacto" | "evitar el ataque" | El sandbox no evita el intento; contiene el resultado |
| "**riesgo residual**" | "riesgo eliminado" | Ningún control elimina el riesgo por completo |
| "**construcción peligrosa**" | "código malicioso" | El analizador detecta patrones, no intenciones |
| "identificador" (UUIDv7) | "ID numérico" | Los identificadores secuenciales están prohibidos |

---

## F — Referencias externas

| Recurso | Uso en el proyecto |
|---|---|
| OWASP Top 10 (2021) | Cobertura verificada en [05-Seguridad.md §6](05-Seguridad.md) |
| OWASP ASVS 5.0 | Línea base de requisitos de seguridad |
| OWASP SAMM | Madurez del proceso |
| NIST SP 800-218 (SSDF) | Prácticas de desarrollo seguro, mapeadas en [12-DevSecOps-y-Testing.md §8](12-DevSecOps-y-Testing.md) |
| ISO/IEC/IEEE 29148:2018 | Estructura de la especificación de requisitos |
| ISO/IEC 27001 Anexo A | Controles organizativos aplicables |
| MITRE ATT&CK | Referencia de técnicas para las reglas de detección |
| RFC 9457 | Formato de los errores de la API |
| RFC 6238 / 4226 | TOTP y HOTP |
| CIS Benchmarks | Endurecimiento de Kubernetes y del sistema operativo |
