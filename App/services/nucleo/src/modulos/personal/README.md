# Módulo de Personal

SAD §9 (vista de componentes), CU-007–CU-009.

> **Sin implementar.** Este dominio nunca pasó de este README: es uno de los dos
> hechos que motivaron ADR-12. Cuando se implemente, entra aquí como módulo del
> Núcleo —no como servicio aparte—, porque no cumple ningún criterio de
> extracción: su carga es plana y su caída no compromete la seguridad física.
>
> Necesita antes su esquema de datos: la base `personal` existe y está vacía
> (`App/infra/initdb/01-bases.sql`).



**Responsabilidad:** administración y asignación de personal operativo, cambios de turno y registro
de asistencia.

**Componentes internos (SAD §9):** Controlador API, Servicio de Asignación de Personal, Validador de
Conflictos, Gestor de Turnos, Repositorio de Personal, Publicador de Eventos.

**Responsable:** Samuel Emperador.

**Base de datos:** PostgreSQL (esquema propio, ADR-01).

**Estado:** pendiente de implementación (Entrega 2).
