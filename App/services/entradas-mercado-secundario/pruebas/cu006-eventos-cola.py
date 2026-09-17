#!/usr/bin/env python3
"""
Pasos 12 y 13 del CU-006: el evento ENTRADA_TRANSFERIDA por RabbitMQ.

Comprueba las cuatro propiedades que justifican haber metido una cola en medio
(ADR-04) y haber elegido RabbitMQ sobre Kafka (ADR-10):

  1. Al completarse una reventa se publica el evento y los dos consumidores
     —notificación (paso 12) y liquidación (paso 13)— lo procesan.
  2. Un mensaje que no se puede procesar acaba en la **DLQ**, no en un bucle
     infinito ni en el olvido. Es lo que ASR-07 exige: no perder en silencio un
     evento que falló.
  3. Un evento **repetido** se descarta. RabbitMQ entrega "al menos una vez", así
     que sin esto se enviarían dos correos o se pagaría dos veces al vendedor.
  4. Con el **broker caído** la venta se completa igual. Es la prueba del
     desacoplamiento: publicar ocurre después de cerrar la venta y fuera del
     camino de respuesta, así que un fallo del broker no debe impedir vender.

Los puntos 2 y 3 se prueban publicando mensajes directamente en el exchange, que
es la única forma de fabricar un evento roto o repetido sin romper el servicio.

    docker compose -f ../../../infra/docker-compose.yml up -d
    npm run migracion:correr && npm run semilla && npm run start:dev
    python3 pruebas/cu006-eventos-cola.py
"""

import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid

from identidad import cabeceras
from redis_reventa import limpiar_reventa

API = 'http://localhost:3001/api/v1'
ANA = 'a0000001-0000-4000-8000-000000000001'
E1 = '20000000-0000-4000-8000-000000000001'
E3 = '20000000-0000-4000-8000-000000000003'
# Palco VIP de Ana. Cada prueba usa una entrada distinta: la del punto 1 queda
# vendida y su dueña ya no puede volver a publicarla.
E2 = '20000000-0000-4000-8000-000000000002'
BRUNO = 'a0000002-0000-4000-8000-000000000002'

EXCHANGE = 'reventa.eventos'
CLAVE = 'entrada.transferida'
COLA_NOTIF = 'reventa.notificaciones'
DLQ_NOTIF = 'reventa.notificaciones.dlq'


def pedir(metodo, ruta, usuario, cuerpo=None, roles=('Cliente',)):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f'{API}/{ruta}', data=datos, method=metodo,
                                 headers=cabeceras(usuario, roles))
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def rabbit(*args):
    return subprocess.run(['docker', 'exec', 'hexacore-rabbitmq', 'rabbitmqctl', *args],
                          capture_output=True, text=True).stdout


def consumidores_en(cola):
    for linea in rabbit('list_queues', 'name', 'consumers').splitlines():
        partes = linea.split('\t')
        if len(partes) == 2 and partes[0] == cola:
            return int(partes[1])
    return 0


def mensajes_en(cola):
    for linea in rabbit('list_queues', 'name', 'messages').splitlines():
        partes = linea.split('\t')
        if len(partes) == 2 and partes[0] == cola:
            return int(partes[1])
    return 0


def publicar_crudo(carga, clave=CLAVE):
    """Publica directamente en el exchange, saltándose el servicio."""
    script = (
        'const amqp = require("amqplib");'
        '(async () => {'
        f'  const c = await amqp.connect("amqp://hexacore:hexacore@localhost:5672");'
        '  const ch = await c.createConfirmChannel();'
        f'  ch.publish("{EXCHANGE}", "{clave}", Buffer.from(process.argv[1]), {{ persistent: true }});'
        '  await ch.waitForConfirms();'
        '  await ch.close(); await c.close();'
        '})();'
    )
    subprocess.run(['node', '-e', script, carga], check=True, capture_output=True)


def vender():
    """Completa una reventa y devuelve el resultado."""
    comprador = str(uuid.uuid4())
    _, pub = pedir('POST', 'reventa/publicaciones', ANA, {'entradaId': E1, 'precio': 300000})
    assert 'id' in pub, pub
    _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)
    estado, compra = pedir('POST', f"reventa/checkout/{ck['id']}/pagar", comprador,
                           {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    return estado, compra


def resembrar():
    subprocess.run(['npm', 'run', 'semilla'], capture_output=True, check=True)
    limpiar_reventa()
    for cola in (COLA_NOTIF, DLQ_NOTIF, 'reventa.liquidaciones', 'reventa.liquidaciones.dlq'):
        rabbit('purge_queue', cola)


def evento_valido(transaccion_id=None):
    ident = transaccion_id or str(uuid.uuid4())
    return {
        'evento': 'ENTRADA_TRANSFERIDA', 'version': 1, 'id': ident,
        'ocurridoEn': '2026-09-14T00:00:00.000Z',
        'entrada': {'id': E1, 'numeroTicket': 'TCK-2026-000001',
                    'eventoId': 'e0000001-0000-4000-8000-000000000001',
                    'eventoNombre': 'HEXACORE Fest 2026', 'localidadNombre': 'General',
                    'codigoQrNuevo': 'HXC-QR-prueba'},
        'transferencia': {'vendedorId': ANA, 'compradorId': str(uuid.uuid4()),
                          'publicacionId': str(uuid.uuid4()), 'transaccionId': ident,
                          'numeroTransaccion': 'TXN-PRUEBA'},
        'importes': {'precio': 300000, 'comision': 30000, 'netoVendedor': 270000,
                     'moneda': 'COP', 'referenciaPasarela': 'pas_prueba'},
    }


def publicacion_y_consumo():
    print('### 1. Una reventa publica el evento y los consumidores lo procesan')
    antes_n, antes_l = mensajes_en(COLA_NOTIF), mensajes_en('reventa.liquidaciones')
    estado, compra = vender()
    assert estado == 200, (estado, compra)
    time.sleep(2)
    # Las colas vuelven a cero: publicado, entregado, procesado y confirmado.
    assert mensajes_en(COLA_NOTIF) == antes_n and mensajes_en('reventa.liquidaciones') == antes_l
    assert mensajes_en(DLQ_NOTIF) == 0, 'algo acabó en la DLQ en el camino feliz'
    print(f"  {compra['numeroTransaccion']} · colas vacías y sin nada en la DLQ")


def mensaje_roto_va_a_la_dlq():
    print('\n### 2. Un mensaje que no se puede procesar acaba en la DLQ')

    # JSON ilegible: no se arregla reintentando, va directo.
    publicar_crudo('esto no es json')
    # Versión desconocida: tampoco mejora con el tiempo.
    futuro = evento_valido()
    futuro['version'] = 99
    publicar_crudo(json.dumps(futuro))
    time.sleep(2)

    en_dlq = mensajes_en(DLQ_NOTIF)
    assert en_dlq == 2, f'se esperaban 2 mensajes en la DLQ, hay {en_dlq}'
    # Y no quedaron dando vueltas en la cola de trabajo.
    assert mensajes_en(COLA_NOTIF) == 0, 'un mensaje rechazado se quedó en la cola'
    print(f"  JSON ilegible y versión 99 -> {en_dlq} en {DLQ_NOTIF}, 0 en la cola de trabajo")


def evento_que_siempre_falla_acaba_en_la_dlq():
    print('\n### 3. Un evento que falla siempre acaba en la DLQ, no rebotando')
    # Este evento es sintácticamente válido pero apunta a una transacción que no
    # existe: el consumidor de liquidaciones lo rechaza cada vez. Sin un límite
    # de reintentos volvería a la cola para siempre y, con prefetch(1),
    # bloquearía a los mensajes que vengan detrás.
    dlq_liq = 'reventa.liquidaciones.dlq'
    antes = mensajes_en(dlq_liq)
    publicar_crudo(json.dumps(evento_valido()))

    for _ in range(20):
        time.sleep(1)
        if mensajes_en(dlq_liq) > antes:
            break

    assert mensajes_en(dlq_liq) == antes + 1, 'el evento no llegó a la DLQ'
    assert mensajes_en('reventa.liquidaciones') == 0, 'el evento se quedó rebotando en la cola'
    print(f'  transacción inexistente -> 1 en {dlq_liq}, 0 rebotando')


def duplicado_se_descarta():
    print('\n### 4. Un evento repetido se descarta')
    ident = str(uuid.uuid4())
    carga = json.dumps(evento_valido(ident))
    publicar_crudo(carga)
    time.sleep(1)
    antes = mensajes_en(DLQ_NOTIF)
    publicar_crudo(carga)   # exactamente el mismo id
    time.sleep(2)
    # El repetido se confirma y se tira: ni se procesa otra vez ni ensucia la DLQ.
    assert mensajes_en(COLA_NOTIF) == 0
    assert mensajes_en(DLQ_NOTIF) == antes, 'el duplicado acabó en la DLQ'
    print('  mismo id dos veces -> el segundo se descarta sin reprocesar')


def venta_con_broker_caido():
    print('\n### 5. Con el broker caído, la venta se completa igual')
    subprocess.run(['docker', 'stop', 'hexacore-rabbitmq'], capture_output=True, check=True)
    try:
        time.sleep(2)
        comprador = str(uuid.uuid4())
        _, pub = pedir('POST', 'reventa/publicaciones', BRUNO, {'entradaId': E3, 'precio': 110000})
        _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)
        estado, compra = pedir('POST', f"reventa/checkout/{ck['id']}/pagar", comprador,
                               {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
        # Esta es la propiedad que justifica ADR-04: el comprador recibe su
        # entrada y su QR aunque la mensajería esté caída. Lo que se pierde es
        # la notificación, no la venta.
        assert estado == 200, (estado, compra)
        assert compra['transferida'] is True and compra['codigoQr']
        print(f"  HTTP {estado} · {compra['numeroTransaccion']} · QR {compra['codigoQr']}")
        print('  la venta se cerró sin broker; falta la notificación, no la entrada')
    finally:
        subprocess.run(['docker', 'start', 'hexacore-rabbitmq'], capture_output=True, check=True)
        # Esperar a que el servicio se reconecte solo (reintenta cada 5 s).
        for _ in range(30):
            time.sleep(2)
            if consumidores_en(COLA_NOTIF) > 0:
                break

    # No basta con que la conexión vuelva: cada reconexión crea un canal nuevo y
    # las suscripciones del anterior mueren con él. Si los consumidores no se
    # resuscriben, el servicio queda "conectado" pero mudo y las colas se llenan
    # sin que nada lo delate. Comprobarlo es el sentido de esta aserción.
    assert consumidores_en(COLA_NOTIF) == 1, 'el consumidor no se resuscribió tras la reconexión'
    assert consumidores_en('reventa.liquidaciones') == 1
    print('  el servicio se reconectó y los consumidores volvieron a suscribirse')

    # Y lo prueba de verdad: una venta nueva tiene que volver a procesarse.
    comprador = str(uuid.uuid4())
    _, pub = pedir('POST', 'reventa/publicaciones', ANA, {'entradaId': E2, 'precio': 700000})
    assert 'id' in pub, pub
    _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)
    estado, _ = pedir('POST', f"reventa/checkout/{ck['id']}/pagar", comprador,
                      {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    assert estado == 200
    time.sleep(3)
    assert mensajes_en(COLA_NOTIF) == 0, 'tras reconectar, los eventos se acumulan sin consumir'
    print('  una venta posterior vuelve a procesarse: las colas quedan vacías')


if __name__ == '__main__':
    resembrar()
    publicacion_y_consumo()
    mensaje_roto_va_a_la_dlq()
    evento_que_siempre_falla_acaba_en_la_dlq()
    duplicado_se_descarta()
    venta_con_broker_caido()
    print('\nTODAS LAS ASERCIONES PASARON')
