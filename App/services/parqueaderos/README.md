# Servicio de dominio de Parqueaderos

SAD §9 (vista de componentes), CU-021–CU-025.

> **Sin implementar.** Este dominio nunca pasó de este README: es uno de los dos
> hechos que motivaron ADR-12. Bajo ADR-14 es un **servicio de dominio**, no un
> microservicio: no cumple ningún criterio de extracción —su carga es plana y
> su caída no compromete la seguridad física—, así que correrá con dos réplicas
> fijas sobre la base central.
>
> Necesita antes su esquema de datos: la base `parqueaderos` existe y está vacía
> (`App/infra/initdb/01-bases.sql`).



**Responsabilidad:** reserva previa de espacios, ingreso/salida de vehículos y asignación de
espacios (CU-021–023); cobro y control de ocupación en tiempo real (CU-024–025).

**Componentes internos (SAD §9):** Controlador API, Servicio de Reservas, Gestor de Ocupación
(Redis), Procesador de Cobro, Repositorio de Espacios, Publicador de Eventos.

**Responsables:** Daniel Cristancho (CU-021–023), Samuel Emperador (CU-024–025).

**Base de datos:** PostgreSQL (esquema propio, ADR-01).

**Estado:** pendiente de implementación (Entrega 2).
