# Política de seguridad

## Divulgación responsable

Si encuentras una vulnerabilidad, comunícala **de forma privada**. No abras un *issue* público.

| | |
|---|---|
| **Contacto** | `security@texguard.app` o el asesor privado de GitHub de este repositorio |
| **Acuse de recibo** | 72 horas |
| **Evaluación inicial** | 7 días |
| **Divulgación coordinada** | 90 días, o antes si el arreglo ya está publicado |

## Qué incluir

1. Componente y versión afectados.
2. Pasos para reproducir, lo más concretos posible.
3. Impacto: qué consigue el atacante y con qué privilegios previos.
4. Prueba de concepto, si la tienes.
5. Mitigación sugerida, si la ves.

## Compromiso

No emprenderemos acciones legales contra investigación de buena fe que no acceda a datos de otros usuarios, no degrade el servicio, no use ingeniería social contra el equipo y nos dé un plazo razonable antes de publicar.

## Alcance

| En alcance | Fuera de alcance |
|---|---|
| Escape del sandbox de compilación | Denegación de servicio volumétrica |
| Acceso a proyectos ajenos (IDOR) | Ingeniería social |
| Fallos de autenticación o de sesión | Ataques físicos |
| Inyección, SSRF, XSS, CSRF | Vulnerabilidades de terceros |
| Exposición de datos personales | Salida de escáner sin análisis |
| Cadena de suministro | Falta de cabeceras sin impacto demostrable |

## Severidad y plazos de remediación

| Severidad | Ejemplos | Plazo |
|---|---|---|
| **Crítica** | Escape del sandbox, RCE, acceso masivo a datos | Mitigar ≤ 24 h · corregir ≤ 7 días |
| **Alta** | Toma de control de cuenta, acceso a proyectos ajenos | ≤ 7 días |
| **Media** | XSS almacenado, SSRF limitado | ≤ 30 días |
| **Baja** | Fuga de información sin impacto directo | ≤ 90 días |

## Modelo de amenazas

El modelo completo (61 amenazas STRIDE con sus controles y riesgo residual) está en [`texguard-docs` · 05-Seguridad](https://github.com/SecurTex-Devs/securtex-docs/blob/main/docs/05-Seguridad.md).
