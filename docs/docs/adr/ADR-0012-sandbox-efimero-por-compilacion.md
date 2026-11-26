# ADR-0012 · Un sandbox por compilación

Estado: implementado y probado en Oracle; activación mediante la siguiente entrega validada. Amplía ADR-0002 y resuelve la condición previa a abrir cuentas privadas de la validación de producción.

## Contexto

El contenedor persistente sin red contenía el buzón de todos los trabajos. Los directorios de trabajo eran independientes, pero una vulnerabilidad del trabajador podía alcanzar otras peticiones del mismo volumen. La demo compartía un único documento público; las cuentas privadas requieren una frontera por compilación (T-C03, RS-052).

## Decisión

Un controlador de confianza copia bytes acotados del buzón a un subdirectorio nuevo y pide crear un contenedor por SSH. No interpreta el documento ni ejecuta TeX. La clave de control es independiente de la personal y la de CI: solo puede ejecutar `sandbox-job <SHA> <UUID>`, desde la red propia de SecureTex, sin shell ni reenvíos.

El script del host valida ambos identificadores y las etiquetas de imagen y volumen. Monta únicamente `volume-subpath=.sandbox-<UUID>` dentro de gVisor; mantiene `network=none`, raíz de solo lectura, usuario sin privilegios, capacidades vacías y límites de memoria, CPU, procesos y tiempo. Ningún socket Docker ni clave entra en la API o en el trabajador. La clave solo pertenece al controlador.

El host permite una compilación simultánea, limita la espera y elimina el contenedor en éxito, error o plazo vencido. El controlador entrega el resultado después de la destrucción, rechazando enlaces, directorios y archivos demasiado grandes. El transporte C1/C2, las claves de usuario, RLS, las opciones de TeX y la firma de PDF no cambian.

Se conserva el protocolo del buzón para permitir revertir las imágenes anteriores. Si una revisión antigua no tiene imagen de controlador, se reutiliza la última imagen de control validada, con el mismo aislamiento. Nunca se vuelve al trabajador persistente por ese motivo. La infraestructura del host sigue requiriendo revisión y actualización administrativa; el código de aplicación se publica automáticamente.

Antes de activar la primera candidata con cuentas reales se sustituye también el compilador de la versión anterior por un controlador, después de comprobar la candidata con un PDF real. Así, una reversión no devuelve el buzón compartido a un trabajador persistente: las sesiones ya emitidas por la candidata podrían seguir siendo válidas en la API anterior.

## Consecuencias

Cada compilación añade el coste de crear gVisor y de una conexión SSH local. Con concurrencia global uno, una compilación larga puede rechazar otra por ocupación; no se acumulan trabajadores junto a los demás servicios de Oracle. El controlador es un componente de confianza con acceso al buzón: una vulnerabilidad en él sigue siendo un riesgo, por lo que no analiza JSON o PDF y sus lecturas no siguen enlaces.

La cuenta del host ya puede usar Docker; su script es una frontera crítica. La clave forzada no concede acceso general a Docker. El plazo independiente del host destruye también un trabajador que deje de colaborar. Una caída de la máquina requiere recuperación operativa normal; los trabajadores no tienen política de reinicio.

## Verificación medida

El 26 de noviembre de 2026, en Oracle ARM64, tres trabajos reales verificaron: LuaLaTeX sin acceso al buzón ajeno, siguiente trabajo sin restos del anterior y bucle infinito detenido por plazo. Los tres devolvieron resultado y no quedó ningún contenedor ni archivo de trabajo. La inspección del trabajador confirmó runtime `securetex-runsc`, red `none`, raíz de solo lectura, 1536 MiB y montaje exclusivo por subdirectorio. Los 21 contenedores ajenos conservaron su estado.

Las tres pruebas del módulo de buzón pasan en Node 22/Linux; cubren límites, enlaces, directorios, resultado de fallo y publicación atómica. Windows requiere privilegio para crear enlaces simbólicos y no es el entorno de ejecución del controlador. Cada despliegue añade una compilación real conocida antes de activar la candidata. Este conjunto no acredita cobertura del 100 % ni sustituye una revisión independiente de seguridad.
