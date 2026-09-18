#!/usr/bin/env python3
"""
PoC-05 — RabbitMQ vs Kafka para la cola de mensajes del sistema.

Publica y consume el evento real del proyecto, ENTRADA_TRANSFERIDA (el que
emite el Servicio de Entradas al completarse una reventa, CU-006), y mide la
latencia de extremo a extremo: desde que el productor lo publica hasta que el
consumidor lo recibe.

Por qué esa métrica y no el throughput: el escenario que de verdad aprieta es
ASR-13 / RNF-17 —al activarse una evacuación, el personal debe recibir su
instrucción en ≤ 10 s—, y ahí lo que importa es cuánto tarda UN mensaje en
llegar, no cuántos caben por segundo.

Se mide con dos configuraciones de durabilidad, porque cambian el resultado
por completo:
  - rapido   : sin confirmación de escritura (RabbitMQ sin persistencia,
               Kafka acks=0). Es el techo de velocidad, pero un broker que se
               cae pierde mensajes en vuelo.
  - duradero : el broker confirma que el mensaje quedó guardado (RabbitMQ con
               delivery_mode=2 + publisher confirms, Kafka acks=all). Es lo que
               exige un evento que no se puede perder, como una evacuación.

Uso:  python3 benchmark.py           (500 mensajes por combinación)
      MENSAJES=2000 python3 benchmark.py
"""
import json
import os
import statistics
import time
from pathlib import Path

MENSAJES = int(os.environ.get("MENSAJES", "500"))
DIR = Path(__file__).parent

# El evento tal como lo define el SAD (§ Vista de procesos, CU-006).
def evento(i):
    return {
        "tipo": "ENTRADA_TRANSFERIDA",
        "entradaId": f"ent-{i}",
        "eventoId": "evt-1",
        "propietarioAnterior": "usr-cliente-2",
        "propietarioNuevo": "usr-cliente-1",
        "numeroTransaccion": f"TXN-2026-{i:06d}",
        "publicadoEn": time.time(),  # marca de tiempo para medir la latencia
    }


def percentil(valores, p):
    return round(statistics.quantiles(sorted(valores), n=1000)[int(p * 10) - 1], 2)


def resumen(nombre, modo, latencias, segundos, perdidos):
    return {
        "broker": nombre,
        "modo": modo,
        "p50_ms": round(statistics.median(latencias), 2) if latencias else None,
        "p95_ms": percentil(latencias, 95) if len(latencias) > 10 else None,
        "max_ms": round(max(latencias), 2) if latencias else None,
        "msg_s": round(len(latencias) / segundos) if segundos > 0 else 0,
        "perdidos": perdidos,
    }


# --------------------------------------------------------------------------
def probar_rabbitmq(modo):
    import pika

    duradero = modo == "duradero"
    params = pika.ConnectionParameters("localhost", heartbeat=30)
    conn = pika.BlockingConnection(params)
    ch = conn.channel()
    cola = f"entradas.transferidas.{modo}"
    ch.queue_declare(queue=cola, durable=duradero)
    ch.queue_purge(cola)
    if duradero:
        ch.confirm_delivery()  # el broker confirma cada publicación

    props = pika.BasicProperties(delivery_mode=2 if duradero else 1)

    latencias = []
    inicio = time.perf_counter()
    for i in range(MENSAJES):
        ch.basic_publish("", cola, json.dumps(evento(i)), properties=props)

    recibidos = 0
    for metodo, _, cuerpo in ch.consume(cola, inactivity_timeout=15):
        if metodo is None:
            break
        latencias.append((time.time() - json.loads(cuerpo)["publicadoEn"]) * 1000)
        ch.basic_ack(metodo.delivery_tag)
        recibidos += 1
        if recibidos >= MENSAJES:
            break
    segundos = time.perf_counter() - inicio

    ch.cancel()
    conn.close()
    return resumen("RabbitMQ", modo, latencias, segundos, MENSAJES - recibidos)


# --------------------------------------------------------------------------
def probar_kafka(modo):
    from kafka import KafkaConsumer, KafkaProducer
    from kafka.admin import KafkaAdminClient, NewTopic

    duradero = modo == "duradero"
    topico = f"entradas-transferidas-{modo}"

    admin = KafkaAdminClient(bootstrap_servers="localhost:9092")
    try:
        admin.create_topics([NewTopic(topico, num_partitions=1, replication_factor=1)])
        time.sleep(2)
    except Exception:
        pass  # ya existe
    admin.close()

    productor = KafkaProducer(
        bootstrap_servers="localhost:9092",
        value_serializer=lambda v: json.dumps(v).encode(),
        acks="all" if duradero else 0,
        linger_ms=0,  # sin agrupar: se quiere latencia, no throughput
    )
    consumidor = KafkaConsumer(
        topico,
        bootstrap_servers="localhost:9092",
        auto_offset_reset="latest",
        value_deserializer=lambda v: json.loads(v.decode()),
        consumer_timeout_ms=15000,
        enable_auto_commit=True,
    )
    # Forzar la asignación de particiones antes de publicar: si no, el
    # consumidor se pierde los primeros mensajes y la medición sale corta.
    consumidor.poll(timeout_ms=3000)

    latencias = []
    inicio = time.perf_counter()
    for i in range(MENSAJES):
        productor.send(topico, evento(i))
    productor.flush()

    recibidos = 0
    for msg in consumidor:
        latencias.append((time.time() - msg.value["publicadoEn"]) * 1000)
        recibidos += 1
        if recibidos >= MENSAJES:
            break
    segundos = time.perf_counter() - inicio

    productor.close()
    consumidor.close()
    return resumen("Kafka", modo, latencias, segundos, MENSAJES - recibidos)


# --------------------------------------------------------------------------
def main():
    filas = []
    for modo in ("rapido", "duradero"):
        for nombre, fn in (("RabbitMQ", probar_rabbitmq), ("Kafka", probar_kafka)):
            print(f"== {nombre} / {modo} ==")
            try:
                fila = fn(modo)
                filas.append(fila)
                print(f"   p50={fila['p50_ms']}ms  p95={fila['p95_ms']}ms  "
                      f"{fila['msg_s']} msg/s  perdidos={fila['perdidos']}")
            except Exception as e:
                print(f"   ERROR: {type(e).__name__}: {e}")

    cols = ["broker", "modo", "p50_ms", "p95_ms", "max_ms", "msg_s", "perdidos"]
    ancho = {c: max(len(c), *(len(str(f[c])) for f in filas)) for c in cols}
    lineas = ["  ".join(c.ljust(ancho[c]) for c in cols)]
    lineas += ["  ".join(str(f[c]).ljust(ancho[c]) for c in filas_c) for filas_c in [cols] for f in filas]
    lineas += ["", f"{MENSAJES} mensajes por combinación · evento ENTRADA_TRANSFERIDA",
               "rapido   = sin confirmación de escritura (RabbitMQ sin persistir, Kafka acks=0)",
               "duradero = el broker confirma el guardado (RabbitMQ delivery_mode=2 + confirms, Kafka acks=all)"]
    texto = "\n".join(lineas)
    (DIR / "resultados.txt").write_text(texto + "\n", encoding="utf-8")
    print("\n" + texto)


if __name__ == "__main__":
    main()
