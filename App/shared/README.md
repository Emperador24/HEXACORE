# Shared

Contratos y tipos compartidos entre servicios y frontends, si se necesitan (p. ej. esquemas de los
eventos publicados en la cola de mensajes — `ENTRADA_TRANSFERIDA` y similares — o DTOs comunes de
autenticación validados por el API Gateway).

Cada microservicio mantiene su propio modelo de datos (ADR-01); esta carpeta es solo para lo que
varios componentes necesiten acordar explícitamente, no para lógica de negocio compartida.

**Estado:** vacío hasta que el prototipo revele qué contratos conviene compartir.
