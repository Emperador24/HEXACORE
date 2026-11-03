# Comunicaciones: correo existente en el Trabajador

El consumidor de Notificaciones se traslada aquí sin completar casos de uso.
Solo `apps/trabajador` lo carga; Identidad conserva su publicador. No hay SQL,
Redis, JWT, Pagos ni endpoints de negocio. Node 22.22.3 y dependencias del workspace,
sin otro package.json/lockfile ni plataforma de trabajos.

`correos/` contiene consumidor, contratos y topología originales. `config/` usa
CONFIGURACION_COMUNICACIONES y carga **.env.trabajador** en desarrollo (no el .env
de Núcleo/Boletería). `rabbitmq/` conserva la conexión y cierre originales del
consumidor; no usa la conexión del Núcleo, cuya configuración y drain son distintos.
Un proceso abre una conexión y consume con prefetch=1. Al reconectar reconstituye
canal/topología/suscripción. La salud conserva GET /api/v1/salud, puerto 3006 y
servicio=notificaciones: 200 con broker, 503 sin él; no sondea al proveedor.

| Contrato conservado | Valor |
|---|---|
| Evento | CORREO_PENDIENTE, versión 1 |
| Tipos | VERIFICACION, RECUPERACION, REGISTRO_DUPLICADO, CUENTA_BLOQUEADA, CONTRASENA_CAMBIADA |
| Exchange/clave | cuentas.eventos (topic durable) / cuenta.correo |
| Cola | cuentas.correos, durable, ack manual |
| DLX/DLQ | cuentas.muertos / cuentas.correos.dlq; routing key cuentas.correos |
| Proveedor | POST CORREO_PROVEEDOR_URL/correos, cuerpo para/asunto/texto; timeout 10 s |
| Reintentos | 4xx a DLQ sin reintento; red/timeout/5xx hasta tres intentos por instancia, nack/requeue inmediato |

Asuntos, texto y enlaces se conservan literalmente; `test/trabajador/correos-referencia.json`
fija los cinco cuerpos capturados y revisados contra el original antes de moverlo.
Los contratos/topología de Identidad siguen idénticos. Su registro y recuperación
no esperan a que el proveedor entregue. El emisor no tiene outbox de correo: si no
puede publicar, registra el fallo; esta entrega no crea recuperación nueva.

## Límites previos comprobados

- Deduplicación (Set) e intentos (Map) solo viven en memoria, sin TTL/persistencia
  ni coordinación entre réplicas. Reiniciar pierde ambos; dos instancias pueden
  enviar el mismo evento dos veces y el límite de intentos no es global.
- SIGTERM cierra canal/conexión y cancela consumo; **no espera el envío HTTP en
  vuelo**. Un mensaje sin ack vuelve a la cola. Si el proveedor ya aceptó pero
  aún no respondió, al volver puede enviarse otra vez. No hay entrega exactamente
  una vez ni deduplicación del proveedor por ID (el cuerpo no incluye esa clave).
- JSON ilegible/versiones distintas van a DLQ. La validación no es completa:
  evento/tipo desconocidos con versión 1 caen en la plantilla de registro duplicado;
  un JSON null produce error no controlado, queda sin ack y bloquea prefetch hasta
  intervención. Se conserva y documenta para el responsable; no se arregla negocio.
- DLQ no equivale a avisar al usuario del fallo persistente. No existen alertas
  operativas, canales push/SMS ni tareas de recuperación F12 en este módulo.

## Ejecutar

Desde App/backend:

```bash
nvm install && nvm use          # Node 22.22.3
npm ci
cp apps/trabajador/.env.example .env.trabajador
# Revisar solo RabbitMQ, proveedor/enlaces de correo y política de bloqueo.
npm run lint
npm run build:trabajador
npm run start:trabajador        # o start:trabajador:dev
```

Sin migraciones/semillas. En producción se inyectan variables y no se lee archivo
.env. Compose usa Dockerfile.trabajador; necesita únicamente RabbitMQ y correo,
incluido modo remoto. No montar claves ni pasar coordenadas de bases/Redis.
El gateway no publica rutas hacia Trabajador; el listener de salud es técnico.

Al cambiar una instalación existente, **antes de actualizar su checkout/Compose**,
detener el consumidor anterior con el Compose anterior (`--profile servicios stop
notificaciones`). Luego actualizar versión y arrancar trabajador. El nuevo Compose
no reconoce el nombre antiguo; dejarlo como huérfano activo ejecutaría dos consumidores.
Esta secuencia operativa se documenta; no se ejecutó sobre el entorno habitual.

Pruebas reales y comandos: [test/trabajador](../../test/trabajador/README.md).
Otros consumidores y temporizadores permanecen en sus dominios; inventario y
razones en ESTADO-MIGRACION §21. La adaptación de SQL de Núcleo/Boletería no añade SQL al Trabajador.

El arranque iniciar.sh detecta consumidores notificaciones activos (incluidos
huérfanos, reiniciando o pausados) del mismo proyecto Compose y se detiene antes
de arrancar Trabajador. Es una comprobación de lectura; no mata contenedores ni
borra colas. La parada/transición del entorno habitual no se ejecutó en esta etapa.

Observación adicional (§23): tras ECONNRESET inicial, el reintento de suscripción
y el aviso de reconexión pueden suscribir dos veces al mismo canal. Se observaron
dos consumer tags en una sola conexión; reiniciar con broker disponible volvió a
una suscripción. El código no cambió en la etapa de esquemas. F15 incluye esta
carrera previa; no se promete unicidad ante todas las secuencias de reconexión.
