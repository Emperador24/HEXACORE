# PoC-05 — Cola de mensajes: RabbitMQ vs Kafka

**Desafío:** ADR-04 decía *"RabbitMQ/Kafka"* como si fueran intercambiables. No lo son: tienen
modelos distintos (cola de tareas vs registro de eventos) y elegir mal condiciona cómo se escriben
los consumidores en los seis microservicios.

**Atributos de calidad en juego:** Desacoplamiento y Disponibilidad; **Seguridad física** (ASR-13 /
RNF-17: al activarse una evacuación, ≥ 99 % del personal debe recibir su instrucción en ≤ 10 s); y
Trazabilidad (ASR-07 / RNF-11: toda transferencia auditada).

## Qué se construyó

El **evento real del proyecto**: `ENTRADA_TRANSFERIDA`, el que emite el Servicio de Entradas al
completarse una reventa (CU-006, § Vista de procesos del SAD). Se publica y se consume en ambos
brokers, midiendo la latencia de extremo a extremo —publicación → recepción—, que es lo que importa
para RNF-17; no el throughput máximo.

Ambos se levantan **en Docker** (`docker-compose.yml`) para que la comparación no dependa del método
de instalación.

Se mide con **dos configuraciones de durabilidad**, porque cambian el resultado por completo:

| Modo | RabbitMQ | Kafka | Qué significa |
|---|---|---|---|
| `rapido` | sin persistir | `acks=0` | Techo de velocidad; si el broker cae, se pierden los mensajes en vuelo |
| `duradero` | `delivery_mode=2` + *publisher confirms* | `acks=all` | El broker confirma que el mensaje quedó guardado |

**El modo relevante para este proyecto es `duradero`**: ni una transferencia de entrada ni una alerta
de evacuación pueden perderse porque el broker se reinició.

## Cómo correrlo

```bash
cd App/PoCs/poc-05-cola-mensajes
docker compose up -d                       # levanta ambos brokers
python3 -m venv .venv && .venv/bin/pip install pika kafka-python-ng

.venv/bin/python benchmark.py              # latencia (500 mensajes por combinación)
.venv/bin/python dlq.py                    # reintentos y cola de mensajes muertos
docker compose down                        # al terminar
```

## Resultado 1 — Latencia de extremo a extremo

```
broker    modo      p50_ms  p95_ms  max_ms  msg_s  perdidos
RabbitMQ  rapido    16.31   17.54   17.7    18932  0
Kafka     rapido    32.06   36.02   36.9    12418  0
RabbitMQ  duradero  162.01  282.13  295.14  1619   0
Kafka     duradero  31.60   57.91   59.35   7702   0
```

**Se invierte el ganador según el modo**, y ese es el hallazgo principal:

- **Sin durabilidad, RabbitMQ es 2× más rápido** (16 ms vs 32 ms).
- **Con durabilidad, Kafka es 5× más rápido** (31,6 ms vs 162 ms de p50; 57,9 vs 282 ms de p95) y
  sostiene 4,8× más mensajes por segundo.

La razón es estructural: RabbitMQ, al persistir, hace `fsync` por mensaje y su latencia se multiplica
por diez (16 → 162 ms). Kafka escribe a un log secuencial y apenas se inmuta (32 → 31,6 ms): la
durabilidad **le sale prácticamente gratis** porque es como está diseñado desde el principio.

**Pero los dos cumplen RNF-17 con enorme margen.** El umbral es 10 s y el peor caso medido —RabbitMQ
duradero, p95— es **282 ms**: treinta y cinco veces por debajo. Igual que en el PoC-04, la latencia
**no es el criterio que decide**.

## Resultado 2 — Reintentos y cola de mensajes muertos (DLQ)

Mismo escenario en ambos: 10 eventos publicados, el consumidor rechaza 3 a propósito.

```
✓ RabbitMQ: procesados=7 rechazados=3 -> en DLQ=3
   mecanismo: nativo del broker | líneas de configuración: 5
✓ Kafka:    procesados=7 rechazados=3 -> en DLQ=3
   mecanismo: a mano (republicar en otro tópico) | líneas de configuración: 0
```

Los dos consiguen el objetivo, pero por caminos distintos:

- **RabbitMQ trae DLQ de fábrica.** Se declara la cola con `x-dead-letter-exchange` (5 líneas) y a
  partir de ahí basta con `basic_nack(requeue=False)`: el broker mueve el mensaje solo.
- **Kafka no tiene DLQ.** Hay que escribir el reenvío a otro tópico a mano, y decidir por cuenta
  propia los metadatos del error, la política de reintentos y el control de offsets.

## Resultado 3 — Costo operativo

| | RabbitMQ | Kafka |
|---|---|---|
| Tamaño de imagen | **275 MB** | 634 MB |
| Memoria en reposo | **147 MB** | 309 MB |
| Líneas para levantarlo | **9** | 15 |
| Consola de administración | incluida (`:15672`) | no incluida |
| Conceptos que hay que entender | colas, *exchanges*, *bindings* | tópicos, particiones, offsets, *consumer groups*, retención |

## Limitaciones honestas

- **Un solo nodo de cada broker.** En producción ambos irían replicados, y ahí Kafka está diseñado
  para replicar mejor. Este PoC no mide eso.
- **Todo en la misma máquina**, sin red entre productor, broker y consumidor.
- **Volumen bajo** (500 mensajes). No se probó el comportamiento con colas de millones de mensajes,
  que es donde Kafka se separa de verdad.
- **No se midió la recuperación ante caída del broker**, que es justamente el escenario que motiva
  usar el modo duradero.

## Decisión

Ver **ADR-10** en `Documentation/Work/DescripcionArquitecturaSoftware.tex`, que cierra el ADR-04.
