# ADR-0001 · Microservicios delimitados por frontera de confianza

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Líder técnico + Responsable de seguridad
- **Afecta a:** Toda la arquitectura

## Contexto

SecurTex ejecuta código arbitrario (LaTeX) suministrado por usuarios anónimos, gestiona credenciales y almacena contenido académico no publicado. La forma en que se descompone el sistema determina el **radio de explosión** de un compromiso.

Las descomposiciones habituales —por entidad de negocio, por equipo, por conveniencia de despliegue— optimizan la velocidad de desarrollo, no la contención de daños.

## Alternativas

| Opción | Ventajas | Inconvenientes |
|---|---|---|
| Monolito único | Simplicidad, menor latencia, despliegue trivial | Una ejecución de código en el compilador tendría acceso a la base de datos, a los secretos y a todos los proyectos |
| Microservicios por entidad (20+) | Máxima independencia | Complejidad operativa desproporcionada para un equipo académico; más superficie de red interna que asegurar |
| **Microservicios por frontera de confianza** | El compromiso queda contenido en su zona | Requiere disciplina en contratos y mTLS |

## Decisión

Se agrupan en un mismo servicio los componentes que **comparten nivel de confianza y datos**, y se separan estrictamente los que no. Las fronteras duras son:

1. **Compilación** (Zona 4) — ejecuta código hostil; sin red, sin acceso a datos, comunicación solo por cola.
2. **Identidad** (Keycloak) — custodia credenciales; superficie propia y endurecida.
3. **Secretos** (Vault) — custodia claves; jamás accesible desde el borde.
4. **Datos** (Zona 3) — solo alcanzable desde la zona de aplicación.

## Consecuencias

**Positivas**
- Una ejecución de código en el sandbox no alcanza credenciales, base de datos ni red interna.
- Cada servicio tiene su propio usuario de base de datos y su propio conjunto de secretos.
- Las políticas de red se derivan directamente del diagrama de zonas.

**Negativas**
- Mayor complejidad operativa: mTLS, descubrimiento de servicios, trazas distribuidas.
- Latencia adicional entre servicios (mitigada con gRPC y colocación en el mismo clúster).
- Más superficie de configuración, que debe automatizarse para no convertirse en riesgo.

**Mitigación de las negativas:** Docker Compose completo para desarrollo local; toda la infraestructura como código; observabilidad extremo a extremo desde el sprint 0.

## Relacionadas

- [ADR-0002](ADR-0002-sandbox-de-compilacion-con-gvisor.md)
- [ADR-0010](ADR-0010-criptografia-multicapa-y-modo-e2ee.md)
- [03-Arquitectura.md](../03-Arquitectura.md)
