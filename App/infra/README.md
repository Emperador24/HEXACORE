# Infra

Infraestructura de soporte compartida entre microservicios (SAD §8 y §11, vista física).

**Contiene (cuando se implemente):**
- Configuración de **Redis** — bloqueo distribuido temporal (reventa de entradas, ADR-03) y datos de
  acceso rápido (aforo, ocupación, sesiones).
- Configuración de la **cola de mensajes** (RabbitMQ/Kafka, ADR-04) — desacopla generación de QR,
  notificaciones, auditoría, liquidación de pagos y alertas de emergencia.
- Definición de las **bases de datos por servicio** (una por microservicio, ADR-01): **PostgreSQL**
  para los esquemas transaccionales de todos los dominios, y **MongoDB** para el esquema documental
  de Reportes/analítica dentro de `administracion` (polyglot persistence, sección 12 del SAD).
- Manifiestos/scripts de despliegue local para los ambientes de **desarrollo** y **pruebas** (SAD
  §11): una réplica por microservicio, sin balanceo horizontal ni CDN, con Redis/cola/BD en un único
  nodo compartido — a diferencia de producción, que usa un clúster de Kubernetes (ver
  `Documentation/Work/DescripcionArquitecturaSoftware.tex`, Figura "Diagrama de despliegue").

**Estado:** pendiente de implementación (Entrega 2). El script de despliegue automatizado se entrega
junto con el prototipo funcional.
