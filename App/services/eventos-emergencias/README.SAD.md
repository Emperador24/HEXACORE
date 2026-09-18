# Servicio de Eventos / Emergencias

SAD §9 (vista de componentes), CU-010, CU-016–CU-020, CU-026.

**Responsabilidad:** CRUD de eventos, localidades y aforo (CU-026); planificación logística,
asignación de personal operativo en campo, monitoreo del evento y gestión de incidentes
(CU-016–020); y gestión de evacuación ante emergencias (CU-010, caso complejo — segundo hilo
conductor del SAD, junto con CU-006).

**Componentes internos (SAD §9):** Controlador API, Servicio de Gestión de Eventos, Servicio de
Protocolo de Emergencia, Gestor de Zonas y Aforo (apoyado en Redis), Repositorio de Eventos,
Publicador de Eventos.

**ASR relacionados:** ASR-05 (actualización de aforo y zonas en tiempo real).

**Responsables:** Samuel Emperador (CU-010, CU-026), Diego Coronado (CU-016–020).

**Base de datos:** PostgreSQL (esquema propio, ADR-01).

**Estado:** pendiente de implementación (Entrega 2). La separación entre "gestión de eventos",
"logística" e "incidentes/emergencias" dentro de este servicio se refinará al prototipar.
