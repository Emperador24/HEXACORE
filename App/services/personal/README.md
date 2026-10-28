# Servicio de dominio de Personal y logística

SAD §9 (vista de componentes), CU-007–CU-009.

> **Parcialmente implementado.** CU-017 y CU-018 viven hoy en
> `eventos-emergencias/src/logistica/`. Bajo ADR-14 este dominio es un
> **servicio de dominio**, no un microservicio: no cumple ningún criterio de
> extracción, así que correrá con dos réplicas fijas sobre la base central.
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
