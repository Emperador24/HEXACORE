# Gateway

API Gateway + balanceador de carga (SAD §8, ADR-02).

**Responsabilidad:** punto único de entrada al backend para las cuatro interfaces del sistema.
Centraliza autenticación, autorización, validación de tokens y enrutamiento hacia el microservicio
correspondiente; distribuye tráfico entre las réplicas de cada servicio.

**ASR relacionados:** ASR-02 (disponibilidad ante caída de una instancia), ASR-03 (protección de
datos de pago y credenciales).

**Responsable:** por definir (transversal al equipo).

**Estado:** pendiente de implementación (Entrega 2).
