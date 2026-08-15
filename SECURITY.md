# Política de seguridad

## Divulgación responsable

Si encuentras una vulnerabilidad en TeXGuard —en el código, en la infraestructura o en un fallo de diseño descrito en esta documentación— comunícala de forma privada.

| | |
|---|---|
| **Contacto** | `security@texguard.app` (o el asesor privado de GitHub del repositorio afectado) |
| **Clave PGP** | Publicada en `/.well-known/security.txt` |
| **Plazo de acuse de recibo** | 72 horas |
| **Plazo de evaluación inicial** | 7 días |
| **Divulgación coordinada** | 90 días, o antes si el arreglo está publicado |

**No abras un *issue* público** para una vulnerabilidad.

## Qué incluir en el informe

1. Componente y versión afectados.
2. Pasos para reproducir, lo más concretos posible.
3. Impacto: qué consigue el atacante y con qué privilegios previos.
4. Prueba de concepto, si la tienes.
5. Mitigación sugerida, si la ves.

## Compromiso

No emprenderemos acciones legales contra investigación de buena fe que:

- no acceda, modifique ni destruya datos de otros usuarios,
- no degrade el servicio,
- no utilice ingeniería social contra el equipo,
- nos dé un plazo razonable antes de publicar.

## Alcance

| En alcance | Fuera de alcance |
|---|---|
| Escape del sandbox de compilación | Ataques de denegación de servicio volumétricos |
| Acceso a proyectos ajenos | Ingeniería social |
| Fallos de autenticación o de sesión | Ataques físicos |
| Inyección, SSRF, XSS, CSRF | Vulnerabilidades en servicios de terceros (repórtalas a ellos) |
| Exposición de datos personales | Informes automáticos de escáneres sin análisis |
| Fallos en la cadena de suministro | Falta de cabeceras sin impacto demostrable |

## Severidad y tiempos de remediación

| Severidad | Ejemplos | Remediación |
|---|---|---|
| **Crítica** | Escape del sandbox, ejecución remota de código, acceso masivo a datos | ≤ 24 h para mitigar, ≤ 7 días para corregir |
| **Alta** | Toma de control de cuenta, acceso a proyectos ajenos | ≤ 7 días |
| **Media** | XSS almacenado, SSRF limitado | ≤ 30 días |
| **Baja** | Fugas de información sin impacto directo | ≤ 90 días |

## Este repositorio

`texguard-docs` no contiene código ejecutable. Si detectas en la documentación un **fallo de diseño** —un control ausente, una amenaza no modelada, una decisión insegura— abre un *issue* normal etiquetado `seguridad/diseño`: eso sí es discusión pública y bienvenida.
