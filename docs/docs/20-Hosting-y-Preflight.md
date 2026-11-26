# 20 · Hosting y comprobaciones previas

Revisión del **26 de noviembre de 2026**. Destino elegido: **Oracle ARM64 existente**. gVisor instalado tras la autorización del propietario. Aplicación publicada en [securetex.dayle.dev](https://securetex.dayle.dev); resultados en la [validación de producción](21-Validacion-Produccion.md).

## Evaluación gratuita

Se necesita mantener el editor disponible y compilar LaTeX sin red, con aislamiento de contenedor y límites. Una base de datos gratuita o una portada estática por separado no cubren ese requisito.

| Opción | Comprobación y decisión |
|---|---|
| [Render Free](https://render.com/docs/free) | El servicio duerme tras 15 minutos y puede tardar alrededor de un minuto en despertar. No encaja con la primera visita de 30 segundos |
| [Render Sandboxes](https://render.com/docs/sandboxes) | Sí ofrece ejecución aislada y bloqueo de salida de red. Su [lista de planes de sandbox](https://render.com/docs/compute-plans.md#sandbox-plans) no incluye `free`; además exigiría adaptar el orquestador y el intercambio de archivos |
| [Koyeb Free](https://www.koyeb.com/docs/reference/instances#free-instances) | Una instancia de 512 MB, 0,1 CPU, sin volúmenes ni workers y con suspensión por inactividad. No cubre esta pila ni su presupuesto actual de compilación |
| [Fly.io Free](https://docs.fly.io/about/free-plan) | Ofrece créditos limitados; la documentación actual indica cambio automático a facturación al agotarlos con tarjeta. No se garantiza coste cero para mantener esta pila disponible |
| [Railway Free](https://docs.railway.com/pricing/plans) | Crédito mensual de 1 USD y máximo de 0,5 GB por servicio. No garantiza la ejecución continua de esta pila dentro del crédito |
| Neon / Supabase | Resolverían el alojamiento de PostgreSQL, no el sandbox. Dividir la pila no elimina la necesidad de alojar y aislar el compilador |

No se afirma que todos los PaaS carezcan de sandbox: Render ya dispone de uno. La decisión considera los planes gratuitos actuales, la disponibilidad inicial y la arquitectura existente.

## Oracle: estado observado, sin modificaciones

| Componente | Lectura real durante el preflight inicial |
|---|---|
| Arquitectura y CPU | `aarch64`, 4 núcleos |
| Memoria | 23 988 MiB totales; 20 732 MiB disponibles en la comprobación |
| Disco | 162 GiB disponibles en `/` |
| Kernel | `5.15.0-1081-oracle` |
| Docker | 26.1.3; runtime predeterminado `runc`; sin `runsc` |
| Recarga de Docker | `CanReload=yes`; `ExecReload` envía SIGHUP |
| KVM | `/dev/kvm` ausente; se propone gVisor con `systrap` |
| Compose | No se usará; existe un `docker-compose` 1.25 antiguo, no Compose v2 |
| Directorio de aplicación | `~/securetex` todavía no existe |
| Cloudflare | Zona activa accesible mediante MCP; `securetex.dayle.dev` no tiene registro todavía |

Se leyó `~/miniwasp/deploy.sh` como referencia de `docker run`, red propia y túnel. También existen contenedores FuelOps además de los servicios indicados inicialmente; todos se consideran ajenos a SecureTex. No se cambió ningún contenedor, red, puerto o configuración del servidor.

## Runtime autorizado e instalado

El [backend exige gVisor al ejecutar código de usuario](https://github.com/SecurTex-Devs/securetex/blob/main/backend/AGENTS.md). La pila local endurecida con `runc` no acredita ese aislamiento. Se propone añadir el runtime `securetex-runsc`, sin cambiar el predeterminado ni relajar el sandbox.

El script revisable es `infra/install-gvisor.sh`, desde la raíz del repositorio. Por defecto solo muestra el plan. Su modo `--apply` requiere root en ARM64 y no instala dependencias automáticamente.

| Cambio concreto | Alcance |
|---|---|
| Paquete oficial | gVisor `20261123.1`, ARM64, archivo y SHA-512 fijados en el script |
| Binarios | `/usr/local/lib/securetex-gvisor/20261123.1/`, propiedad de root; incluye `runsc` y `gvisor-bin` |
| Configuración | Añade únicamente `runtimes.securetex-runsc` a `/etc/docker/daemon.json`; conserva el resto |
| Copia anterior | `/etc/docker/daemon.json.securetex-<fecha-UTC>.bak` |
| Activación | Valida con `dockerd --validate` y recarga con `systemctl reload docker`; no reinicia el daemon |
| Comprobación | Runtime registrado y contenedores previos con los mismos ID, fechas de arranque, reinicios, redes y puertos |
| Error | Restaura la configuración y vuelve a recargarla; los binarios nuevos quedan para revisión, sin borrar rutas de otros servicios |

La recarga de runtimes sin reinicio está documentada por [Docker](https://docs.docker.com/reference/cli/dockerd/#configuration-reload-behavior). La distribución ARM64 y sus binarios auxiliares se describen en la [instalación de gVisor](https://gvisor.dev/docs/user_guide/install/). La compatibilidad real con TeX Live y el volumen compartido debe probarse en Oracle después de instalarlo; todavía no está acreditada.

Validación local previa: SHA-512 del archivo oficial correcto, nueve binarios ELF con arquitectura ARM64, sintaxis Bash válida y modo de planificación ejecutado en un contenedor sin red. La generación de configuración se comprobó con datos sintéticos: conserva opciones de logging, runtime predeterminado y otros runtimes, y rechaza sobrescribir un `securetex-runsc` existente. El modo de aplicación no se ejecutó durante esa revisión local.

Después de esa revisión, el propietario autorizó la instalación. `runsc` reporta `release-20261123.1`; Docker se recargó y registró `securetex-runsc`. Las comprobaciones interna e independiente confirmaron que los 20 contenedores ajenos conservaron IDs, fechas de arranque, reinicios, redes y puertos. Un contenedor ARM64 efímero, sin red, reportó `aarch64` y `4.19.0-gvisor` y comprobó la ausencia de `eth0`. Se conserva `runc` como runtime predeterminado.

El `.env` de producción se generó en Oracle con claves propias y modo 600. El token del túnel se transfirió mediante RSA-OAEP con SHA-256 a una clave efímera mantenida en memoria del servidor; solo el token descifrado se añadió al `.env`. No se transportaron las claves de la base local ni sus credenciales Google/Microsoft.

La publicación inicial se limita al único proyecto público de demostración y sus identidades sintéticas, sin administrador ni seed académico. El registro está cerrado, incluidos los usuarios nuevos mediante OIDC. El compilador conserva su trabajador persistente y el protocolo tmpfs, ahora bajo gVisor: no se habilitarán cuentas privadas en esta instancia hasta disponer de aislamiento por trabajo. Así se evita mezclar documentos privados con el entorno compartido de la muestra. El riesgo residual de interferencia o lectura entre compilaciones de la misma demo pública permanece documentado; gVisor no convierte ese contenedor compartido en aislamiento entre trabajos.

La puesta en marcha y las pruebas HTTPS se completaron después de este preflight. El despliegue automático y el material de portafolio corresponden a las fases posteriores.
