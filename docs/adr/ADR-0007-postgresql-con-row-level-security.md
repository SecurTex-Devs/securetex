# ADR-0007 · Row Level Security como segunda barrera de autorización

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Decide:** Responsable de seguridad + Backend
- **Afecta a:** Todas las tablas con datos de usuario, capa de acceso a datos

## Contexto

El acceso no autorizado a recursos ajenos (**IDOR**, amenaza T-P01) es la categoría número uno del OWASP Top 10 y la más común en aplicaciones con múltiples inquilinos. Su causa habitual no es la ausencia total de control, sino **el olvido puntual**: un endpoint nuevo, una consulta interna, un trabajo de la cola que no aplica el filtro.

Confiar la autorización únicamente a la capa de aplicación significa que **cada consulta futura** debe recordar filtrar. Es una apuesta contra el error humano acumulado a lo largo de miles de líneas.

## Alternativas

| Opción | Protege ante olvido | Coste |
|---|---|---|
| Solo autorización en la capa de aplicación | ❌ | Ninguno |
| Repositorio genérico que obliga a pasar el `userId` | ⚠️ Ayuda, pero es evitable | Bajo |
| Base de datos por inquilino | ✅ | Inviable con miles de proyectos |
| **Autorización en el dominio + RLS en PostgreSQL** | ✅ | Medio |

## Decisión

Doble barrera:

1. **Política de autorización en el dominio** (`ProjectAuthorizationPolicy`), evaluada explícitamente en cada caso de uso. Es la que produce mensajes de error correctos y eventos de auditoría.
2. **Row Level Security en PostgreSQL**, activada y **forzada** (`FORCE ROW LEVEL SECURITY`) en toda tabla con datos de usuario. Es la que salva al sistema cuando la primera falla.

El contexto se establece por transacción:

```sql
SET LOCAL app.user_id = '01J9X…';
```

Si un servicio olvida establecerlo, **no ve ninguna fila**: el fallo es seguro (*fail closed*).

## Consecuencias

**Positivas**
- Un endpoint nuevo que olvide comprobar permisos devuelve un conjunto vacío en lugar de datos ajenos.
- Un fallo de inyección SQL que llegue al motor sigue estando limitado a las filas del usuario actual.
- La política queda expresada de forma declarativa y auditable en las migraciones.

**Negativas**
- Coste de rendimiento: cada consulta evalúa la política. Se mitiga con un índice dedicado sobre `project_members(user_id, project_id) WHERE revoked_at IS NULL` — el índice más caliente del sistema.
- Las políticas son código de seguridad y deben probarse como tal: existe una prueba de acceso cruzado por cada tabla.
- Los trabajos en segundo plano necesitan un rol de servicio explícito con políticas propias, no un `BYPASSRLS` genérico.

## Verificación

Por cada tabla con RLS existe un test que se conecta como un usuario ajeno e intenta leer y escribir: debe devolver 0 filas y error de política. Además, un test comprueba que **sin contexto establecido no se ve nada**.

## Relacionadas

- [06-Modelo-de-Datos.md §5](../06-Modelo-de-Datos.md)
- [12-DevSecOps-y-Testing.md §4.3](../12-DevSecOps-y-Testing.md)
</content>
</invoke>
