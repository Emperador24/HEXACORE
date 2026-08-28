# Servicio de Entradas y Mercado Secundario

SAD §9 (vista de componentes), CU-001–CU-006.

**Responsabilidad:** consulta de eventos, compra de entradas, validación de QR en el ingreso,
cancelaciones/devoluciones, promociones (CU-001–005) y reventa segura de entradas en el mercado
secundario (CU-006, caso complejo — hilo conductor del SAD).

**Componentes internos (SAD §9):** Controlador API, Servicio de Publicación, Gestor de Concurrencia
(bloqueo en Redis), Procesador de Pagos, Generador de QR, Repositorio de Entradas, Publicador de
Eventos.

**ASR relacionados:** ASR-01 (bloqueo de doble venta), ASR-04 (respuesta bajo carga en apertura de
venta), ASR-06 (escalado independiente).

**Responsables:** Daniel Cristancho (CU-001–005), Samuel Emperador (CU-006).

**Base de datos:** PostgreSQL (esquema propio, ADR-01).

**Estado:** pendiente de implementación (Entrega 2).
