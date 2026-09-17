#!/usr/bin/env python3
"""
RNF-01 — cero ventas duplicadas bajo concurrencia.

    "Ventas duplicadas bajo concurrencia: 0 % con 50 intentos de compra
     simultáneos sobre la misma publicación."   — SAD §3, RNF-01

Comprueba el camino de excepción CU-006H y el escenario ASR-01 en sus **dos**
momentos, porque el bloqueo puede perderse en cualquiera de ellos:

  A. Al **reservar**: cincuenta compradores piden la misma publicación a la vez
     y solo uno puede quedarse con ella.

  B. Al **pagar**, después de que la reserva caducó. Este es el caso que la
     prueba A no toca y que dejó pasar una doble venta real: un comprador que
     tarda más que el TTL pierde su bloqueo, otro lo toma, y si nadie comprueba
     de quién es el bloqueo, la entrada acaba en manos de quien ya no la tenía
     reservada.

  C. Lo mismo, pero **pagando los dos a la vez**. Es la versión más grave: con
     las dos peticiones en vuelo, ambas superan las validaciones antes de que
     ninguna escriba, y se llega a dos cobros, dos transferencias y dos códigos
     QR sobre una sola entrada.

Se hace con peticiones HTTP reales contra el servicio en marcha, y no con
pruebas unitarias sobre un doble de Redis: lo que se quiere comprobar es que el
bloqueo distribuido funcione de verdad, y un doble de prueba respondería que sí
por construcción.

Cómo correrlo (con la infraestructura y el servicio levantados):

    docker compose -f ../../../infra/docker-compose.yml up -d
    npm run migracion:correr && npm run semilla && npm run start:dev
    python3 pruebas/rnf01-concurrencia.py

Sale con código distinto de cero si algún invariante falla, para poder
encadenarlo en un pipeline.

Limitación honesta: cliente y servidor corren en la misma máquina y hay una
sola instancia del servicio. El bloqueo es distribuido y debería sostenerse con
varias réplicas (ASR-06), pero eso aquí no se está midiendo.
"""

import json
import subprocess
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

from identidad import cabeceras
from redis_reventa import limpiar_reventa

API = 'http://localhost:3001/api/v1'
ANA = 'a0000001-0000-4000-8000-000000000001'
ENTRADA = '20000000-0000-4000-8000-000000000001'   # la del camino feliz de la semilla


def pedir(metodo, ruta, usuario, cuerpo=None, roles=('Cliente',)):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f'{API}/{ruta}', data=datos, method=metodo,
                                 headers=cabeceras(usuario, roles))
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def sql(consulta):
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
         '-d', 'entradas_mercado_secundario', '-tAc', consulta],
        capture_output=True, text=True).stdout.strip()


def resembrar():
    """Deja la base y los bloqueos en un estado conocido.

    Hace falta porque otras pruebas de esta carpeta venden esta misma entrada:
    sin resembrar, este script fallaría con NO_ES_PROPIETARIO según el orden en
    que se ejecuten.
    """
    subprocess.run(['npm', 'run', 'semilla'], capture_output=True, check=True)
    limpiar_reventa()


def publicar():
    """Publica la entrada de la semilla y devuelve su publicación."""
    estado, pub = pedir('POST', 'reventa/publicaciones', ANA, {'entradaId': ENTRADA, 'precio': 300000})
    if estado != 201:
        raise SystemExit(f'No se pudo preparar la publicación: HTTP {estado} {pub}')
    return pub


def caducar_reserva(publicacion_id):
    """Simula que el TTL del bloqueo venció.

    Borrar la clave es exactamente lo que hace Redis al expirar; esperar los 120
    segundos reales solo haría la prueba más lenta, no más fiel.
    """
    subprocess.run(
        ['redis-cli', '-p', '6380', 'DEL', f'reventa:bloqueo:publicacion:{publicacion_id}'],
        capture_output=True, check=True)


def cincuenta_a_la_vez():
    print('### A. Cincuenta compradores reservan a la vez')
    resembrar()
    pub_id = publicar()['id']

    # Compradores DISTINTOS: con el mismo, el servicio le devolvería su propio
    # checkout en curso, que es el comportamiento correcto pero no lo que se
    # quiere medir aquí.
    compradores = [str(uuid.uuid4()) for _ in range(50)]

    with ThreadPoolExecutor(max_workers=50) as pool:
        resultados = list(pool.map(
            lambda c: pedir('POST', f'reventa/publicaciones/{pub_id}/checkout', c), compradores))

    ganadores = [(c, r) for c, (s, r) in zip(compradores, resultados) if s == 201]
    rechazos = [r for s, r in resultados if s != 201]

    print(f'  intentos simultáneos : {len(resultados)}')
    print(f'  checkouts abiertos   : {len(ganadores)}   <- RNF-01 exige exactamente 1')
    print(f'  rechazados           : {len(rechazos)}')

    assert len(ganadores) == 1, f'FALLO RNF-01: {len(ganadores)} checkouts simultáneos'
    assert all(r.get('codigo') == 'CU-006H' for r in rechazos), 'algún rechazo no fue CU-006H'

    ganador_id, checkout = ganadores[0]
    print(f'  ganador: {checkout["numeroTransaccion"]} · reserva {checkout["segundosRestantes"]}s')

    print('\n  --- el mismo comprador reintenta: recupera su checkout, no lo pierde ---')
    estado, otra = pedir('POST', f'reventa/publicaciones/{pub_id}/checkout', ganador_id)
    assert estado == 201 and otra['id'] == checkout['id']
    print(f'  HTTP {estado} · mismo checkout {otra["numeroTransaccion"]}')

    print('\n  --- CU-006C: al cancelar, otro comprador sí puede reservarla ---')
    pedir('DELETE', f'reventa/checkout/{checkout["id"]}', ganador_id)
    estado, nuevo = pedir('POST', f'reventa/publicaciones/{pub_id}/checkout', compradores[1])
    assert estado == 201, (estado, nuevo)
    pedir('DELETE', f'reventa/checkout/{nuevo["id"]}', compradores[1])
    print(f'  HTTP {estado} · {nuevo["numeroTransaccion"]}')

    print('\n  --- el vendedor no puede comprarse su propia entrada ---')
    estado, propia = pedir('POST', f'reventa/publicaciones/{pub_id}/checkout', ANA)
    assert estado == 409 and propia['codigo'] == 'VENDEDOR_ES_COMPRADOR'
    print(f'  HTTP {estado} · {propia["codigo"]}')


def pagar_con_la_reserva_caducada():
    """El caso que la prueba A no cubre: perder el bloqueo entre reservar y pagar.

    Es una secuencia perfectamente normal —alguien abre el checkout, se
    distrae tres minutos y vuelve a pulsar pagar—, y sin comprobar de quién es
    el bloqueo acaba en dos cobros por una sola entrada.
    """
    print('\n### B. Pagar después de que la reserva caducó')
    resembrar()
    pub_id = publicar()['id']

    ana_compra, bruno_compra = str(uuid.uuid4()), str(uuid.uuid4())

    # 1. El primer comprador reserva.
    estado, checkout_a = pedir('POST', f'reventa/publicaciones/{pub_id}/checkout', ana_compra)
    assert estado == 201, (estado, checkout_a)
    print(f'  comprador A reserva  : {checkout_a["numeroTransaccion"]}')

    # 2. Su reserva vence mientras se lo piensa.
    caducar_reserva(pub_id)
    print('  su reserva caduca    : (TTL vencido)')

    # 3. Un segundo comprador toma la publicación, ahora libre.
    estado, checkout_b = pedir('POST', f'reventa/publicaciones/{pub_id}/checkout', bruno_compra)
    assert estado == 201, f'el segundo comprador debería poder reservar: {estado} {checkout_b}'
    print(f'  comprador B reserva  : {checkout_b["numeroTransaccion"]}')

    # 4. Ambos pagan. Solo el que tiene la reserva viva —B— debe conseguirla.
    estado_a, respuesta_a = pedir('POST', f'reventa/checkout/{checkout_a["id"]}/pagar',
                                  ana_compra, {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    estado_b, respuesta_b = pedir('POST', f'reventa/checkout/{checkout_b["id"]}/pagar',
                                  bruno_compra, {'metodoPago': 'TARJETA', 'token': 'tok_ok'})

    print(f'\n  paga A (sin reserva) : HTTP {estado_a} {respuesta_a.get("codigo", "")}')
    print(f'  paga B (con reserva) : HTTP {estado_b} {respuesta_b.get("codigo", "")}')

    cobros = sql(f"""SELECT count(*) FROM transacciones_reventa
                     WHERE publicacion_id='{pub_id}' AND estado='APROBADA'""")
    transferencias = sql(f"""SELECT count(*) FROM historial_propietarios
                             WHERE entrada_id='{ENTRADA}' AND motivo='REVENTA'""")
    print(f'  cobros APROBADA      : {cobros}   <- RNF-01 exige exactamente 1')
    print(f'  transferencias       : {transferencias}')

    # El comprador cuya reserva caducó no puede pagar: la publicación ya es de
    # otro. Que su checkout siga PENDIENTE en la base no basta — la fuente de
    # verdad sobre si la reserva sigue viva es el bloqueo de Redis.
    assert estado_a != 200, (
        'FALLO RNF-01: se cobró a un comprador cuya reserva había caducado y '
        'cuya publicación ya estaba reservada por otro'
    )
    assert estado_b == 200, f'el comprador con la reserva viva debería poder pagar: {respuesta_b}'
    assert cobros == '1', f'FALLO RNF-01: {cobros} cobros aprobados sobre la misma publicación'
    assert transferencias == '1', f'FALLO RNF-01: {transferencias} transferencias de la misma entrada'

    propietario = sql(f"SELECT propietario_id FROM entradas WHERE id='{ENTRADA}'")
    assert propietario == bruno_compra, 'la entrada quedó en manos de quien no la pagó'
    print('  la entrada quedó en manos del comprador con la reserva viva')


def dos_pagos_a_la_vez():
    """La versión más grave: ambos pagan simultáneamente.

    Con las dos peticiones en vuelo, las dos leen el estado antes de que
    ninguna escriba. Si los `UPDATE` de la transferencia no comprueban que la
    publicación siga ACTIVA, la segunda escritura pisa a la primera sin error y
    quedan dos cobros sobre una entrada.
    """
    print('\n### C. Los dos pagan a la vez')
    resembrar()
    pub_id = publicar()['id']

    ana_compra, bruno_compra = str(uuid.uuid4()), str(uuid.uuid4())
    _, checkout_a = pedir('POST', f'reventa/publicaciones/{pub_id}/checkout', ana_compra)
    caducar_reserva(pub_id)
    _, checkout_b = pedir('POST', f'reventa/publicaciones/{pub_id}/checkout', bruno_compra)

    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = list(pool.map(
            lambda par: pedir('POST', f'reventa/checkout/{par[0]}/pagar', par[1],
                              {'metodoPago': 'TARJETA', 'token': 'tok_ok'}),
            [(checkout_a['id'], ana_compra), (checkout_b['id'], bruno_compra)]))

    aprobados = [s for s, _ in resultados if s == 200]
    cobros = sql(f"""SELECT count(*) FROM transacciones_reventa
                     WHERE publicacion_id='{pub_id}' AND estado='APROBADA'""")
    qr = sql(f"""SELECT count(DISTINCT codigo_qr_nuevo) FROM historial_propietarios
                 WHERE entrada_id='{ENTRADA}' AND motivo='REVENTA'""")

    print(f'  pagos aceptados : {len(aprobados)}   <- RNF-01 exige exactamente 1')
    print(f'  cobros APROBADA : {cobros}')
    print(f'  QR emitidos     : {qr}')

    assert len(aprobados) == 1, f'FALLO RNF-01: {len(aprobados)} pagos aceptados sobre la misma entrada'
    assert cobros == '1', f'FALLO RNF-01: {cobros} cobros sobre la misma entrada'
    # Dos QR válidos para una entrada es además una violación de RNF-02: el
    # anterior debe quedar invalidado al emitirse el nuevo.
    assert qr == '1', f'FALLO RNF-02: {qr} códigos QR emitidos para la misma entrada'


if __name__ == '__main__':
    cincuenta_a_la_vez()
    pagar_con_la_reserva_caducada()
    dos_pagos_a_la_vez()
    print('\nTODAS LAS ASERCIONES PASARON')
