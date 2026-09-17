#!/usr/bin/env python3
"""
PoC-05, segunda parte — ¿cuánto cuesta tener reintentos y cola de mensajes
muertos (DLQ) en cada broker?

La latencia sola no decide: un evento que falla al procesarse no puede
perderse en silencio. El SAD exige que las transferencias queden auditadas
(ASR-07 / RNF-11) y que la alerta de evacuación llegue sí o sí (ASR-13), así
que el broker tiene que ofrecer una forma clara de reintentar y de apartar lo
que no se pudo procesar.

Este script implementa el MISMO escenario en ambos: se publican 10 eventos, el
consumidor rechaza 3 a propósito, y se comprueba dónde terminan esos 3.

Lo que se compara no es la velocidad sino el mecanismo: qué trae el broker de
fábrica y qué hay que construir a mano.
"""
import json
import time

EVENTOS = 10
FALLAN = {2, 5, 7}  # índices que el consumidor rechazará


def rabbitmq_dlq():
    """RabbitMQ: la DLQ es una propiedad de la cola; el broker la gestiona."""
    import pika

    conn = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
    ch = conn.channel()

    # --- configuración de la DLQ: 5 líneas, todo declarativo ---
    ch.exchange_declare("dlx.entradas", exchange_type="fanout", durable=True)
    ch.queue_declare("entradas.dlq", durable=True)
    ch.queue_bind("entradas.dlq", "dlx.entradas")
    ch.queue_declare("entradas.principal", durable=True,
                     arguments={"x-dead-letter-exchange": "dlx.entradas"})
    # --- fin de la configuración ---

    ch.queue_purge("entradas.principal")
    ch.queue_purge("entradas.dlq")

    for i in range(EVENTOS):
        ch.basic_publish("", "entradas.principal",
                         json.dumps({"tipo": "ENTRADA_TRANSFERIDA", "i": i}),
                         properties=pika.BasicProperties(delivery_mode=2))

    procesados, rechazados = 0, 0
    for metodo, _, cuerpo in ch.consume("entradas.principal", inactivity_timeout=5):
        if metodo is None:
            break
        i = json.loads(cuerpo)["i"]
        if i in FALLAN:
            # requeue=False -> el broker lo manda solo a la DLQ
            ch.basic_nack(metodo.delivery_tag, requeue=False)
            rechazados += 1
        else:
            ch.basic_ack(metodo.delivery_tag)
            procesados += 1
        if procesados + rechazados >= EVENTOS:
            break
    ch.cancel()

    time.sleep(1)
    en_dlq = ch.queue_declare("entradas.dlq", durable=True, passive=True).method.message_count
    conn.close()
    return {"procesados": procesados, "rechazados": rechazados, "en_dlq": en_dlq,
            "lineas_config": 5, "mecanismo": "nativo del broker"}


def kafka_dlq():
    """Kafka: no tiene DLQ; hay que publicarla a mano en otro tópico."""
    from kafka import KafkaConsumer, KafkaProducer
    from kafka.admin import KafkaAdminClient, NewTopic

    admin = KafkaAdminClient(bootstrap_servers="localhost:9092")
    for t in ("entradas-principal", "entradas-dlq"):
        try:
            admin.create_topics([NewTopic(t, num_partitions=1, replication_factor=1)])
        except Exception:
            pass
    time.sleep(2)
    admin.close()

    productor = KafkaProducer(bootstrap_servers="localhost:9092",
                              value_serializer=lambda v: json.dumps(v).encode(), acks="all")
    consumidor = KafkaConsumer("entradas-principal", bootstrap_servers="localhost:9092",
                               auto_offset_reset="latest", consumer_timeout_ms=8000,
                               value_deserializer=lambda v: json.loads(v.decode()))
    consumidor.poll(timeout_ms=3000)

    for i in range(EVENTOS):
        productor.send("entradas-principal", {"tipo": "ENTRADA_TRANSFERIDA", "i": i})
    productor.flush()

    procesados, rechazados = 0, 0
    for msg in consumidor:
        i = msg.value["i"]
        if i in FALLAN:
            # --- "DLQ" a mano: hay que republicar el mensaje uno mismo, y
            #     decidir por cuenta propia el reintento y los metadatos ---
            productor.send("entradas-dlq", {**msg.value, "error": "fallo simulado",
                                            "origen": "entradas-principal"})
            productor.flush()
            rechazados += 1
        else:
            procesados += 1
        if procesados + rechazados >= EVENTOS:
            break
    consumidor.close()

    verificador = KafkaConsumer("entradas-dlq", bootstrap_servers="localhost:9092",
                                auto_offset_reset="earliest", consumer_timeout_ms=5000,
                                value_deserializer=lambda v: json.loads(v.decode()))
    en_dlq = sum(1 for _ in verificador)
    verificador.close()
    productor.close()
    return {"procesados": procesados, "rechazados": rechazados, "en_dlq": en_dlq,
            "lineas_config": 0, "mecanismo": "a mano (republicar en otro tópico)"}


if __name__ == "__main__":
    print(f"Publicando {EVENTOS} eventos; el consumidor rechazará {sorted(FALLAN)}\n")
    for nombre, fn in (("RabbitMQ", rabbitmq_dlq), ("Kafka", kafka_dlq)):
        try:
            r = fn()
            ok = "✓" if r["en_dlq"] >= len(FALLAN) else "✗"
            print(f"{ok} {nombre}: procesados={r['procesados']} rechazados={r['rechazados']} "
                  f"-> en DLQ={r['en_dlq']}")
            print(f"   mecanismo: {r['mecanismo']}"
                  f" | líneas de configuración del broker: {r['lineas_config']}\n")
        except Exception as e:
            print(f"✗ {nombre}: {type(e).__name__}: {e}\n")
