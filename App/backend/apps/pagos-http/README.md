# Envoltura HTTP temporal de Pagos

Es el servidor Pagos actual trasladado al workspace. Reutiliza una sola
implementación en modulos/finanzas/pagos; no hay otro servidor añadido al
ambiente. Sigue siendo un proceso separado hasta el siguiente hito.

Conserva `/api/v1/pagos` (POST), `/pagos/reembolsos` (POST),
`/pagos/webhook` (POST) y `/salud` (GET). Cobro/reembolso responden 200 con el DTO
original y requieren JWT válido y no revocado. Webhook responde 204, verifica
HMAC-SHA256 de los bytes originales (`rawBody: true`) y publica en pagos.eventos.
Firma inválida: 401; operación desconocida: 404; incompatible: 409; publicación
no confirmada: 503. Mantiene ValidationPipe y Swagger de desarrollo.

La salud conserva su respuesta y decide disponibilidad solo por PostgreSQL.
JWT es solo verificación pública; Redis y RabbitMQ pertenecen a la envoltura,
con tokens/configuración propios. La firma sigue en Identidad. SIGTERM cierra
conexiones; no se introducen consumidores ni temporizadores de negocio.

Desde App/backend con Node **22.22.3**, tras instalar con `npm ci` y revisar
los destinos del .env:

```bash
npm run migracion:pagos:estado
npm run migracion:pagos:correr
npm run build:pagos
PUERTO=3008 npm run start:pagos
```

La base pagos debe existir. `POSTGRES_BD_PAGOS=pagos` selecciona el libro. Solo
este arranque conserva el alias antiguo POSTGRES_BASE cuando no se especifica
POSTGRES_BD_PAGOS. La CLI y el módulo reutilizable usan la variable nombrada;
no heredan la base de otro dominio. La imagen Dockerfile.pagos aplica la migración
existente antes de ejecutar `dist/apps/pagos-http/main.js`. No debe competir con
otras réplicas al migrar; ejecutar migraciones como tarea única de despliegue.

Configuración propia CONFIGURACION_PAGOS_HTTP, Redis CLIENTE_REDIS_PAGOS_HTTP,
nombres de conexión pagos-http/hexacore-pagos-http. El proceso recibe clave pública
y PASARELA_SECRETO_WEBHOOK; en producción sigue rechazando secreto ausente y
clave JWT de desarrollo. No recibe ni necesita la clave privada.

Para retirarla en el **hito siguiente**: sustituir los clientes HTTP por la API
pública de Pagos preservando validación/autorización, mantener un único webhook
explícito con HMAC y las topologías existentes, repetir los flujos reales y
retirar servicio/contexto/imagen/host pagos de Compose/gateway/scripts/CI/CD.
No retirar este servidor mientras los llamantes lo necesiten. F12 seguirá
siendo deuda funcional hasta que su responsable implemente la recuperación;
esta extracción no la convierte en requisito para terminar la migración.
