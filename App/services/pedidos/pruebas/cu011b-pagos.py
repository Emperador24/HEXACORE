#!/usr/bin/env python3
"""
CU-011 — Lo que rodea al pago de un pedido.

`cu011-flujo-completo.py` recorre el camino que termina bien: catálogo,
checkout, reserva de inventario y pago aprobado. Esta suite cubre lo otro: las
formas en que el pago **no** puede seguir adelante, que hasta ahora no tocaba
ninguna prueba de integración.

    PEDIDO_YA_PAGADO                el pedido ya tiene un cobro aprobado
    PAGO_PENDIENTE_RESOLUCION       hay un intento sin resolver; no se cobra otra vez
    CLAVE_IDEMPOTENCIA_INCOMPATIBLE la misma clave para dos pedidos distintos
    CHECKOUT_EXPIRADO               se acabó el tiempo de pagar
    ESTADO_PEDIDO_NO_PERMITE_PAGO   el pedido ya no está esperando pago
    RESERVA_NO_ACTIVA               el inventario reservado ya se soltó
    ESTABLECIMIENTO_NO_DISPONIBLE   el local cerró antes de abrir el pedido

y el trabajo periódico que libera las reservas de los pedidos que nadie pagó,
que es lo que devuelve el inventario al mostrador.

Necesita la infraestructura y el servicio levantados:

    cd ../../infra && ./iniciar.sh
    python3 pruebas/cu011b-pagos.py

Resiembra y recarga el inventario de Redis al empezar, igual que la otra suite,
así que no depende del estado que dejen otras pruebas.
"""

import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

from identidad import cabeceras

API = 'http://localhost:3003/api/v1'

EVENTO = 'e0000001-0000-4000-8000-000000000001'
SAZON = '30000000-0000-4000-8000-000000000001'
COMAL = '30000000-0000-4000-8000-000000000002'
PIZZERIA = '30000000-0000-4000-8000-000000000003'
ESTABLECIMIENTOS = (SAZON, COMAL, PIZZERIA)

HAMBURGUESA = '40000000-0000-4000-8000-000000000001'   # inventario 20
GASEOSA = '40000000-0000-4000-8000-000000000002'       # inventario 30

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def alguien():
    return str(uuid.uuid4())


def pedir(metodo, ruta, usuario, cuerpo=None, roles=('Cliente',), espera=30, extra=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    headers = dict(cabeceras(usuario, roles))
    headers.update(extra or {})
    req = urllib.request.Request(f'{API}/{ruta}', data=datos, method=metodo, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        bruto = e.read() or b'{}'
        try:
            return e.code, json.loads(bruto)
        except json.JSONDecodeError:
            return e.code, {'crudo': bruto.decode(errors='replace')}


def sql(consulta):
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-qtA',
         '--username=hexacore', '--dbname=pedidos', '-c', consulta],
        capture_output=True, text=True, check=True).stdout.strip()


def preparar_entorno():
    """Base recién sembrada y el inventario de Redis cargado, como `iniciar.sh`."""
    subprocess.run(['npm', 'run', 'semilla'], cwd=RAIZ, capture_output=True, check=True)
    subprocess.run(
        ['docker', 'exec', 'hexacore-redis', 'sh', '-c',
         "redis-cli --scan --pattern 'pedidos:inv:*' | xargs -r redis-cli del"],
        capture_output=True, check=True)
    entorno = {**os.environ,
               'REDIS_HOST': os.environ.get('REDIS_HOST', 'localhost'),
               'REDIS_PUERTO': os.environ.get('REDIS_PUERTO', '6380')}
    for establecimiento in ESTABLECIMIENTOS:
        subprocess.run(['npx', 'ts-node', 'src/inventario/preparar-inventario.ts',
                        establecimiento, '--compras-detenidas'],
                       cwd=RAIZ, env=entorno, capture_output=True, check=True)


def checkout(cliente, productos=None, establecimiento=SAZON, evento=EVENTO):
    return pedir('POST', 'pedidos/checkout', cliente, {
        'eventoId': evento,
        'establecimientoId': establecimiento,
        'metodoEntrega': 'RECOGER_EN_PUNTO',
        'productos': productos or [{'productoId': HAMBURGUESA, 'cantidad': 1}],
    })


def pedido_nuevo(cliente=None, **kw):
    cliente = cliente or alguien()
    estado, pedido = checkout(cliente, **kw)
    assert estado == 201, (estado, pedido)
    return cliente, pedido


def pagar(cliente, pedido_id, token='tok_ok_cu011b', clave=None):
    return pedir('POST', f'pedidos/{pedido_id}/pagos', cliente, {'tokenPago': token},
                 extra={'Idempotency-Key': clave or str(uuid.uuid4())})


def caducar(pedido_id):
    """
    Deja el pedido con su plazo vencido.

    `creado_en` se mueve también porque la tabla tiene un CHECK que exige
    `expira_en > creado_en`: sin eso la actualización la rechaza la base, no el
    servicio.
    """
    sql(f"UPDATE pedidos SET creado_en = now() - interval '1 hour', "
        f"expira_en = now() - interval '30 minutes' WHERE id='{pedido_id}'")


def titulo(texto):
    print(f'\n### {texto}')


# --- Los bloques -------------------------------------------------------------

def pedido_ya_pagado():
    titulo('El pedido ya tiene un cobro aprobado')
    cliente, pedido = pedido_nuevo()
    estado, primero = pagar(cliente, pedido['id'])
    assert estado in (200, 201), (estado, primero)
    assert sql(f"SELECT estado FROM pedidos WHERE id='{pedido['id']}'") == 'CONFIRMADO'

    # Otra clave de idempotencia: es un intento nuevo, no un reintento.
    estado, r = pagar(cliente, pedido['id'])
    assert estado == 409 and r['codigo'] == 'PEDIDO_YA_PAGADO', (estado, r)

    # Y no se cobró dos veces: sigue habiendo una sola transacción aprobada.
    assert sql(f"SELECT count(*) FROM transacciones_pedido WHERE pedido_id='{pedido['id']}' "
               f"AND estado='APROBADA'") == '1'
    print('  segundo pago → PEDIDO_YA_PAGADO · sigue habiendo un solo cobro aprobado')


def pago_pendiente_de_resolucion():
    titulo('Hay un intento sin resolver: no se lanza otro cobro')
    cliente, pedido = pedido_nuevo()
    # `tok_error` deja el intento sin saber si se cobró.
    estado, _ = pagar(cliente, pedido['id'], 'tok_error_cu011b')
    assert estado in (409, 502, 503), estado
    pendientes = sql(f"SELECT estado FROM transacciones_pedido WHERE pedido_id='{pedido['id']}'")
    assert pendientes in ('PENDIENTE', 'FALLIDA'), pendientes

    estado, r = pagar(cliente, pedido['id'], 'tok_ok_cu011b')
    assert estado == 409 and r['codigo'] == 'PAGO_PENDIENTE_RESOLUCION', (estado, r)

    # Lo que importa: mientras no se resuelva el primero, no aparece un segundo
    # intento que pudiera cobrar de nuevo.
    assert sql(f"SELECT count(*) FROM transacciones_pedido "
               f"WHERE pedido_id='{pedido['id']}'") == '1'
    print(f'  intento {pendientes} sin resolver → PAGO_PENDIENTE_RESOLUCION · un solo intento en la base')


def reintentar_con_la_misma_clave():
    titulo('Reintentar con la misma clave consulta, no vuelve a cobrar')
    cliente, pedido = pedido_nuevo()
    clave = str(uuid.uuid4())
    estado, primero = pagar(cliente, pedido['id'], clave=clave)
    assert estado in (200, 201), (estado, primero)

    estado, repetido = pagar(cliente, pedido['id'], clave=clave)
    assert estado in (200, 201), (estado, repetido)
    assert repetido['transaccionId'] == primero['transaccionId']
    assert repetido['estadoPago'] == primero['estadoPago'] == 'APROBADA'
    assert repetido['referenciaPasarela'] == primero['referenciaPasarela'], \
        'el reintento tiene que devolver el mismo cobro, no uno nuevo'
    assert repetido['codigoQr'] == primero['codigoQr']
    assert sql(f"SELECT count(*) FROM transacciones_pedido "
               f"WHERE pedido_id='{pedido['id']}'") == '1'
    print(f"  misma clave dos veces → una sola transacción ({primero['referenciaPasarela']})")


def clave_reutilizada_en_otro_pedido():
    titulo('La misma clave para dos pedidos distintos')
    cliente, primero = pedido_nuevo()
    clave = str(uuid.uuid4())
    estado, _ = pagar(cliente, primero['id'], clave=clave)
    assert estado in (200, 201), estado

    _, segundo = pedido_nuevo(cliente=cliente)
    estado, r = pagar(cliente, segundo['id'], clave=clave)
    assert estado == 409 and r['codigo'] == 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE', (estado, r)
    assert sql(f"SELECT count(*) FROM transacciones_pedido "
               f"WHERE pedido_id='{segundo['id']}'") == '0'
    print('  clave de otro pedido → CLAVE_IDEMPOTENCIA_INCOMPATIBLE, sin crear intento')


def clave_que_no_vale():
    titulo('La cabecera Idempotency-Key es obligatoria y tiene forma')
    cliente, pedido = pedido_nuevo()
    estado, _ = pedir('POST', f"pedidos/{pedido['id']}/pagos", cliente, {'tokenPago': 'tok_ok_cu011b'})
    assert estado == 400, estado
    estado, _ = pagar(cliente, pedido['id'], clave='no-es-un-uuid')
    assert estado == 400, estado
    print('  sin cabecera → 400 · cabecera que no es UUID → 400')


def checkout_expirado():
    titulo('Se acabó el tiempo de pagar')
    cliente, pedido = pedido_nuevo()
    caducar(pedido['id'])

    estado, r = pagar(cliente, pedido['id'])
    assert estado == 409 and r['codigo'] == 'CHECKOUT_EXPIRADO', (estado, r)
    # El pedido queda marcado EXPIRADO antes de devolver el error: si no, cada
    # reintento volvería a evaluarlo desde cero.
    assert sql(f"SELECT estado FROM pedidos WHERE id='{pedido['id']}'") == 'EXPIRADO'
    print('  plazo vencido → CHECKOUT_EXPIRADO · el pedido queda EXPIRADO en la base')
    return cliente, pedido


def estado_que_no_admite_pago():
    titulo('El pedido ya no está esperando pago')
    cliente, pedido = pedido_nuevo()
    sql(f"UPDATE pedidos SET estado='CANCELADO', cancelado_en=now(), "
        f"motivo_cancelacion='prueba' WHERE id='{pedido['id']}'")

    estado, r = pagar(cliente, pedido['id'])
    assert estado == 409 and r['codigo'] == 'ESTADO_PEDIDO_NO_PERMITE_PAGO', (estado, r)
    print('  pedido CANCELADO → ESTADO_PEDIDO_NO_PERMITE_PAGO')


def reserva_que_ya_no_esta_activa():
    titulo('El inventario reservado ya se soltó')
    cliente, pedido = pedido_nuevo()
    sql(f"UPDATE reservas_inventario SET estado='LIBERADA' WHERE pedido_id='{pedido['id']}'")

    estado, r = pagar(cliente, pedido['id'])
    assert estado == 409 and r['codigo'] == 'RESERVA_NO_ACTIVA', (estado, r)
    # Sin reserva activa no se llama a la pasarela: no hay intento que conciliar.
    assert sql(f"SELECT count(*) FROM transacciones_pedido "
               f"WHERE pedido_id='{pedido['id']}'") == '0'
    print('  reserva LIBERADA → RESERVA_NO_ACTIVA, sin llegar a la pasarela')


def pedido_de_otro():
    titulo('El pedido de otra persona no existe para mí')
    cliente, pedido = pedido_nuevo()
    estado, r = pagar(alguien(), pedido['id'])
    assert estado == 404 and r['codigo'] == 'PEDIDO_NO_ENCONTRADO', (estado, r)

    estado, inexistente = pagar(cliente, str(uuid.uuid4()))
    assert estado == 404 and inexistente['codigo'] == 'PEDIDO_NO_ENCONTRADO', (estado, inexistente)
    print('  pedido ajeno e inexistente → 404 PEDIDO_NO_ENCONTRADO, sin distinguir cuál es cuál')


def establecimiento_no_disponible():
    titulo('El local cerró antes de que se abriera el pedido')
    sql(f"UPDATE establecimientos SET estado='CERRADO' WHERE id='{PIZZERIA}'")
    try:
        estado, r = checkout(alguien(), [{'productoId': GASEOSA, 'cantidad': 1}],
                             establecimiento=PIZZERIA)
        assert estado == 409 and r['codigo'] == 'ESTABLECIMIENTO_NO_DISPONIBLE', (estado, r)
        assert r['estado'] == 'CERRADO', r
    finally:
        sql(f"UPDATE establecimientos SET estado='DISPONIBLE' WHERE id='{PIZZERIA}'")
    print('  establecimiento CERRADO → ESTABLECIMIENTO_NO_DISPONIBLE, informando el estado')


def establecimiento_de_otro_evento():
    titulo('El establecimiento tiene que ser del evento que se pide')
    estado, _ = checkout(alguien(), evento='e0000002-0000-4000-8000-000000000002')
    assert estado in (404, 422), estado

    estado, _ = checkout(alguien(), evento=str(uuid.uuid4()))
    assert estado == 404, estado
    print('  establecimiento de otro evento → 422 · evento inexistente → 404')


def el_barrido_libera_las_reservas():
    titulo('El trabajo periódico devuelve al mostrador lo que nadie pagó')
    cliente, pedido = pedido_nuevo(productos=[{'productoId': HAMBURGUESA, 'cantidad': 2}])
    reserva = sql(f"SELECT estado FROM reservas_inventario WHERE pedido_id='{pedido['id']}'")
    assert reserva == 'ACTIVA', reserva
    caducar(pedido['id'])

    # El ciclo corre cada cinco segundos; se le dan unos cuantos de margen.
    for _ in range(30):
        if sql(f"SELECT estado FROM reservas_inventario WHERE pedido_id='{pedido['id']}'") != 'ACTIVA':
            break
        time.sleep(1)

    final = sql(f"SELECT estado FROM reservas_inventario WHERE pedido_id='{pedido['id']}'")
    assert final == 'LIBERADA', f'el barrido debería haber soltado la reserva, quedó {final}'
    assert sql(f"SELECT estado FROM pedidos WHERE id='{pedido['id']}'") == 'EXPIRADO'
    print('  reserva ACTIVA → LIBERADA y pedido EXPIRADO, sin que nadie los tocara')


def el_barrido_respeta_un_pago_en_vuelo():
    titulo('Pero no toca una reserva con un pago sin resolver')
    cliente, pedido = pedido_nuevo()
    pagar(cliente, pedido['id'], 'tok_error_cu011b')
    caducar(pedido['id'])
    time.sleep(12)

    # La reserva sigue en pie: soltarla mientras un cobro puede haber salido
    # dejaría al cliente pagado y sin producto.
    reserva = sql(f"SELECT estado FROM reservas_inventario WHERE pedido_id='{pedido['id']}'")
    assert reserva in ('ACTIVA', 'LIBERACION_PENDIENTE'), reserva
    print(f'  con un pago sin resolver, la reserva se queda en {reserva}')


def hace_falta_sesion():
    titulo('RNF-06 — pagar exige sesión con rol Cliente')
    cliente, pedido = pedido_nuevo()
    req = urllib.request.Request(f"{API}/pedidos/{pedido['id']}/pagos",
                                 data=b'{"tokenPago":"tok_ok_cu011b"}', method='POST',
                                 headers={'Content-Type': 'application/json',
                                          'Idempotency-Key': str(uuid.uuid4())})
    try:
        urllib.request.urlopen(req, timeout=30)
        raise AssertionError('sin token debería responder 401')
    except urllib.error.HTTPError as e:
        assert e.code == 401, e.code

    estado, _ = pedir('POST', f"pedidos/{pedido['id']}/pagos", cliente,
                      {'tokenPago': 'tok_ok_cu011b'}, roles=('Personal',),
                      extra={'Idempotency-Key': str(uuid.uuid4())})
    assert estado == 403, estado
    print('  sin token → 401 · con rol Personal → 403')


if __name__ == '__main__':
    preparar_entorno()
    bloques = [
        pedido_ya_pagado,
        pago_pendiente_de_resolucion,
        reintentar_con_la_misma_clave,
        clave_reutilizada_en_otro_pedido,
        clave_que_no_vale,
        checkout_expirado,
        estado_que_no_admite_pago,
        reserva_que_ya_no_esta_activa,
        pedido_de_otro,
        establecimiento_no_disponible,
        establecimiento_de_otro_evento,
        el_barrido_libera_las_reservas,
        el_barrido_respeta_un_pago_en_vuelo,
        hace_falta_sesion,
    ]
    for bloque in bloques:
        bloque()
    print(f'\nTodo bien: {len(bloques)} bloques.')
    sys.exit(0)
