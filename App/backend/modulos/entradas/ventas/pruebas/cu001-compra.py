#!/usr/bin/env python3
"""
CU-001 (comprar entradas) y CU-004 (código promocional), de extremo a extremo.

Recorre los pasos 1-8 del CU-001 y los cuatro caminos de su ficha:

    CU-001A   no hay disponibilidad
    CU-001B   la reserva expira antes de pagar
    CU-001C   el pago es rechazado, y se puede reintentar
    (además)  la pasarela no responde: el cobro queda indeterminado

y los del CU-004, que se aplican sobre la compra ya reservada:

    CU-004A   el código no aplica a este evento o localidad
    CU-004B   el usuario retira el código y el total vuelve al original
    CU-004C   el código no existe o está vencido
    CU-004D   el código agotó su límite de usos

Comprueba en la base lo que la ficha declara como post-condiciones: el cupo
apartado se descuenta, cada entrada nace con su QR único y su historial de
emisión (RNF-11), y nunca se cobra dos veces la misma reserva.

Necesita la infraestructura y el servicio levantados:

    cd ../../infra && ./iniciar.sh
    python3 pruebas/cu001-compra.py

Resiembra al empezar, así que no depende del estado que dejen otras pruebas.
"""

import sys
import time
import uuid

from venta import (
    ANA, CLASICO_NORTE, FEST_GENERAL, FEST_PALCO, JAZZ_TERRAZA, LOCALIDAD_FANTASMA,
    MAGO_PLATEA, ROCK_GENERAL, ROCK_TRIBUNA, VERANO_GENERAL,
    correr, pedir, resembrar, sql, titulo,
)

# Un comprador nuevo por bloque: así ninguno ve las compras de otro y las
# comprobaciones sobre "mis compras" siguen valiendo aunque cambie el orden.
def alguien():
    return str(uuid.uuid4())


def libres(localidad):
    fila = sql(f"SELECT aforo - vendidas - reservadas FROM localidades_evento "
               f"WHERE localidad_id='{localidad}'")
    return int(fila)


def camino_feliz():
    titulo('Pasos 1-8 — elegir, reservar, pagar y recibir las entradas')
    comprador = alguien()
    antes = libres(FEST_GENERAL)

    # Pasos 3-4: se aparta el cupo y el servidor calcula el total.
    estado, compra = pedir('POST', 'compras', comprador,
                           {'localidadId': FEST_GENERAL, 'cantidad': 2})
    assert estado == 201, (estado, compra)
    assert compra['estado'] == 'PENDIENTE'
    assert compra['precioUnitario'] == 180000
    assert compra['subtotal'] == 360000 and compra['descuento'] == 0 and compra['total'] == 360000
    assert compra['entradas'] == [], 'las entradas no existen hasta que se paga'
    assert compra['numeroCompra'].startswith('CMP-')
    # El cupo ya está apartado aunque nadie haya pagado (CU-001A para el de al lado).
    assert libres(FEST_GENERAL) == antes - 2, 'reservar tiene que descontar el cupo'

    # Pasos 5-8: se cobra y se emite una entrada con su QR por cupo.
    estado, pagada = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                           {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    assert estado == 200, (estado, pagada)
    assert pagada['estado'] == 'PAGADA' and pagada['pagadaEn'] is not None
    assert len(pagada['entradas']) == 2

    qrs = [e['codigoQr'] for e in pagada['entradas']]
    assert len(set(qrs)) == 2, 'cada entrada lleva su propio QR'
    assert all(e['estado'] == 'VALIDA' for e in pagada['entradas'])
    assert all(e['localidadNombre'] == 'General' for e in pagada['entradas'])
    # El reparto del total entre las entradas cuadra al peso.
    assert sum(e['precioPagado'] for e in pagada['entradas']) == pagada['total']
    print(f"  {pagada['numeroCompra']} · {pagada['total']} COP · QR {qrs[0]} y {qrs[1]}")

    # Post-condición: el cupo pasa de reservado a vendido, sin cambiar el libre.
    assert libres(FEST_GENERAL) == antes - 2
    assert sql(f"SELECT reservadas FROM localidades_evento WHERE localidad_id='{FEST_GENERAL}'") \
        == sql(f"SELECT 0"), 'la reserva se confirma, no se queda colgada'

    # Post-condición y RNF-11: cada entrada nace con su asiento en el historial.
    for entrada in pagada['entradas']:
        motivo = sql(f"SELECT motivo FROM historial_propietarios WHERE entrada_id='{entrada['id']}'")
        assert motivo == 'EMISION', (entrada['numeroTicket'], motivo)
    print('  cupo confirmado · historial de emisión en las 2 entradas')
    return pagada, comprador


def consultar_mis_compras():
    titulo('Salida 2 — "mis compras" y el detalle de una')
    comprador = alguien()
    _, primera = pedir('POST', 'compras', comprador, {'localidadId': ROCK_GENERAL, 'cantidad': 1})
    _, segunda = pedir('POST', 'compras', comprador, {'localidadId': ROCK_TRIBUNA, 'cantidad': 1})
    pedir('POST', f"compras/{segunda['id']}/pagar", comprador,
          {'metodoPago': 'TARJETA', 'token': 'tok_ok'})

    estado, listado = pedir('GET', 'compras', comprador)
    assert estado == 200, (estado, listado)
    assert {c['id'] for c in listado} == {primera['id'], segunda['id']}
    assert listado[0]['id'] == segunda['id'], 'las más recientes primero'
    assert all(c['entradas'] == [] for c in listado), 'el listado va sin entradas'

    estado, detalle = pedir('GET', f"compras/{segunda['id']}", comprador)
    assert estado == 200 and len(detalle['entradas']) == 1, (estado, detalle)

    # Y la compra de otro no existe para mí: no "prohibido", que confirmaría
    # que ese identificador es de alguien.
    estado, ajena = pedir('GET', f"compras/{segunda['id']}", alguien())
    assert estado == 404 and ajena['codigo'] == 'COMPRA_NO_ENCONTRADA', (estado, ajena)
    print('  2 compras listadas · detalle con entradas · la ajena → 404')


def sin_disponibilidad():
    titulo('CU-001A — no hay disponibilidad')
    # La Norte del Clásico está vendida entera en la semilla.
    estado, r = pedir('POST', 'compras', alguien(), {'localidadId': CLASICO_NORTE, 'cantidad': 1})
    assert estado == 409 and r['codigo'] == 'CU-001A', (estado, r)
    assert r['disponibles'] == 0
    assert 'No quedan entradas' in r['mensaje'], r['mensaje']

    # Y el caso de "quedan, pero no tantas": la Terraza del Jazz tiene 3.
    estado, parcial = pedir('POST', 'compras', alguien(), {'localidadId': JAZZ_TERRAZA, 'cantidad': 4})
    assert estado == 409 and parcial['codigo'] == 'CU-001A', (estado, parcial)
    assert parcial['disponibles'] == 3, parcial
    assert 'Solo quedan 3' in parcial['mensaje'], parcial['mensaje']
    # Nada se apartó: pedir de más no debe consumir cupo.
    assert libres(JAZZ_TERRAZA) == 3
    print(f"  agotada → disponibles 0 · pidiendo 4 de 3 → {parcial['mensaje']!r}")


def evento_que_no_esta_a_la_venta():
    titulo('Paso 3 — la localidad existe pero el evento no está a la venta')
    # Un musical todavía en borrador.
    estado, borrador = pedir('POST', 'compras', alguien(), {'localidadId': MAGO_PLATEA, 'cantidad': 1})
    assert estado == 409 and borrador['codigo'] == 'EVENTO_NO_A_LA_VENTA', (estado, borrador)
    assert borrador['mensaje'] == 'El evento no está a la venta'

    # Un festival que ya se celebró.
    estado, pasado = pedir('POST', 'compras', alguien(), {'localidadId': VERANO_GENERAL, 'cantidad': 1})
    assert estado == 409 and pasado['codigo'] == 'EVENTO_NO_A_LA_VENTA', (estado, pasado)
    assert pasado['mensaje'] == 'El evento ya empezó', pasado

    # Y una localidad que no existe.
    estado, fantasma = pedir('POST', 'compras', alguien(), {'localidadId': LOCALIDAD_FANTASMA, 'cantidad': 1})
    assert estado == 404 and fantasma['codigo'] == 'LOCALIDAD_NO_ENCONTRADA', (estado, fantasma)
    print('  borrador → no está a la venta · pasado → ya empezó · inexistente → 404')


def datos_que_no_valen():
    titulo('Paso 3 — lo que el cliente no puede mandar')
    comprador = alguien()
    for cuerpo, porque in (
        ({'localidadId': FEST_GENERAL, 'cantidad': 0}, 'cantidad mínima 1'),
        ({'localidadId': FEST_GENERAL, 'cantidad': 11}, 'tope de 10 por compra'),
        ({'localidadId': FEST_GENERAL, 'cantidad': 1.5}, 'entradas enteras'),
        ({'localidadId': 'no-es-uuid', 'cantidad': 1}, 'la localidad es un uuid'),
        ({'cantidad': 1}, 'falta la localidad'),
        # El precio lo pone el servidor: un campo de más se rechaza entero.
        ({'localidadId': FEST_GENERAL, 'cantidad': 1, 'precioUnitario': 1}, 'el precio no se manda'),
    ):
        estado, _ = pedir('POST', 'compras', comprador, cuerpo)
        assert estado == 400, f'{porque}: esperaba 400 y fue {estado}'
    print('  6 cuerpos inválidos, 6 respuestas 400 (el precio lo fija el servidor)')


def pago_rechazado():
    titulo('CU-001C — el pago es rechazado y se puede reintentar')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_PALCO, 'cantidad': 1})

    estado, r = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                      {'metodoPago': 'TARJETA', 'token': 'tok_rechazo'})
    assert estado == 409 and r['codigo'] == 'CU-001C', (estado, r)
    assert r['reservaHasta'] == compra['expiraEn'], 'la reserva sigue viva'
    assert 'otro medio de pago' in r['mensaje'], r['mensaje']

    # La reserva vuelve a PENDIENTE con el motivo guardado, y el cupo sigue apartado.
    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'PENDIENTE'
    assert sql(f"SELECT intentos_rechazados FROM compras WHERE id='{compra['id']}'") == '1'

    # Reintentar con otro medio de pago funciona: es lo que promete la ficha.
    estado, pagada = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                           {'metodoPago': 'PSE', 'token': 'tok_ok'})
    assert estado == 200 and pagada['estado'] == 'PAGADA', (estado, pagada)
    assert pagada['motivo'] is None, 'al pagar se limpia el motivo del rechazo anterior'
    assert len(pagada['entradas']) == 1
    print(f"  rechazo → CU-001C (1 intento) · reintento con PSE → {pagada['numeroCompra']} pagada")


def pasarela_sin_respuesta():
    titulo('La pasarela responde 502 — el cobro queda indeterminado')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_PALCO, 'cantidad': 1})

    estado, r = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                      {'metodoPago': 'TARJETA', 'token': 'tok_error'})
    assert estado == 503 and r['codigo'] == 'PAGO_INDETERMINADO', (estado, r)
    assert r['requiereConciliacion'] is True
    assert compra['numeroCompra'] in r['mensaje'], 'el mensaje da la referencia para conciliar'

    # Se queda en PAGANDO a propósito: no se sabe si hubo cargo, así que el
    # barrido de reservas vencidas no la puede liberar por su cuenta.
    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'PAGANDO'
    assert sql(f"SELECT count(*) FROM entradas WHERE compra_id='{compra['id']}'") == '0'
    print(f"  HTTP 503 · la compra queda PAGANDO para conciliar · 0 entradas emitidas")


def no_se_cobra_dos_veces():
    titulo('Pasos 5-8 — pagar dos veces no emite entradas dos veces')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': ROCK_TRIBUNA, 'cantidad': 2})
    _, primera = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                       {'metodoPago': 'TARJETA', 'token': 'tok_ok'})

    estado, segunda = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                            {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    assert estado == 409 and segunda['codigo'] == 'COMPRA_NO_PAGABLE', (estado, segunda)
    assert segunda['estado'] == 'PAGADA'
    assert sql(f"SELECT count(*) FROM entradas WHERE compra_id='{compra['id']}'") == '2'
    print(f"  segundo intento → COMPRA_NO_PAGABLE · siguen siendo 2 entradas")


def reserva_vencida():
    titulo('CU-001B — la reserva expira antes de pagar')
    comprador = alguien()
    antes = libres(ROCK_GENERAL)
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': ROCK_GENERAL, 'cantidad': 3})
    assert libres(ROCK_GENERAL) == antes - 3

    # Esperar los diez minutos de verdad no cabe en una prueba: se adelanta el
    # reloj de esta reserva en la base, que es exactamente el estado que el
    # servicio se encontraría diez minutos después.
    sql(f"UPDATE compras SET expira_en = now() - interval '1 minute' WHERE id='{compra['id']}'")

    estado, r = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                      {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    assert estado == 409 and r['codigo'] == 'CU-001B', (estado, r)
    assert 'se agotó' in r['mensaje'] and 'Vuelve a elegir' in r['mensaje']

    # El cupo vuelve al mercado, que es el punto del caso alterno.
    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'EXPIRADA'
    assert libres(ROCK_GENERAL) == antes, 'al vencer, los 3 cupos vuelven a estar libres'

    # Y ya no admite pagos, ni siquiera el mismo error dos veces seguidas.
    estado, otra_vez = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                             {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    assert estado == 409 and otra_vez['codigo'] == 'CU-001B', (estado, otra_vez)
    print(f'  reserva vencida → CU-001B · los 3 cupos vuelven a {antes}')


def cupon_camino_feliz():
    titulo('CU-004, pasos 1-9 — aplicar un código y ver el total bajar')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 2})
    assert compra['total'] == 360000

    estado, con_cupon = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'HEXA10'})
    assert estado == 200, (estado, con_cupon)
    assert con_cupon['codigoPromocional'] == 'HEXA10'
    assert con_cupon['subtotal'] == 360000
    assert con_cupon['descuento'] == 36000, con_cupon
    assert con_cupon['total'] == 324000

    # El uso queda reservado, no confirmado: todavía no se ha pagado.
    assert sql(f"SELECT estado FROM usos_promocion WHERE compra_id='{compra['id']}'") == 'RESERVADO'
    usos_antes = int(sql("SELECT usos FROM codigos_promocionales WHERE codigo='HEXA10'"))

    estado, pagada = pedir('POST', f"compras/{compra['id']}/pagar", comprador,
                           {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    assert estado == 200 and pagada['total'] == 324000, (estado, pagada)
    # Lo emitido suma lo cobrado con descuento, no el precio de lista.
    assert sum(e['precioPagado'] for e in pagada['entradas']) == 324000
    assert sql(f"SELECT estado FROM usos_promocion WHERE compra_id='{compra['id']}'") == 'CONFIRMADO'
    print(f"  HEXA10: 360000 → 324000 (-36000) · uso RESERVADO → CONFIRMADO (llevaba {usos_antes})")


def cupon_se_escribe_como_sea():
    titulo('CU-004 — el código no distingue mayúsculas ni espacios')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 1})
    estado, r = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': '  hexa10 '})
    assert estado == 200 and r['codigoPromocional'] == 'HEXA10', (estado, r)
    print('  "  hexa10 " se guarda como HEXA10')


def cupon_no_aplica():
    titulo('CU-004A — el código no aplica a este evento o localidad')
    comprador = alguien()
    # ROCK20 es solo de Noche de Rock: en el FEST no aplica.
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 1})
    estado, r = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'ROCK20'})
    assert estado == 422 and r['codigo'] == 'CU-004A', (estado, r)
    assert r['aplicaA'] == 'el evento Noche de Rock Nacional', r
    # El precio original se mantiene, que es lo que la ficha exige.
    _, intacta = pedir('GET', f"compras/{compra['id']}", comprador)
    assert intacta['total'] == 180000 and intacta['codigoPromocional'] is None

    # VIP15 es solo del Palco VIP: en la General del mismo evento tampoco.
    estado, localidad = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'VIP15'})
    assert estado == 422 and localidad['codigo'] == 'CU-004A', (estado, localidad)
    assert localidad['aplicaA'] == 'la localidad Palco VIP de HEXACORE Fest 2026', localidad

    # Y en el Palco sí.
    _, palco = pedir('POST', 'compras', comprador, {'localidadId': FEST_PALCO, 'cantidad': 1})
    estado, bien = pedir('PUT', f"compras/{palco['id']}/cupon", comprador, {'codigo': 'VIP15'})
    assert estado == 200 and bien['descuento'] == 63000, (estado, bien)
    print(f"  ROCK20 → {r['aplicaA']} · VIP15 en General → CU-004A, en Palco → -63000")


def cupon_invalido():
    titulo('CU-004C — el código no existe o ya venció')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 1})

    estado, inexistente = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'NOEXISTE'})
    assert estado == 422 and inexistente['codigo'] == 'CU-004C', (estado, inexistente)
    assert 'no existe' in inexistente['mensaje']

    # VERANO5 es de la temporada pasada.
    estado, vencido = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'VERANO5'})
    assert estado == 422 and vencido['codigo'] == 'CU-004C', (estado, vencido)
    assert 'venció' in vencido['mensaje'], vencido

    # El total no se movió en ninguno de los dos intentos.
    _, intacta = pedir('GET', f"compras/{compra['id']}", comprador)
    assert intacta['total'] == 180000 and intacta['codigoPromocional'] is None
    print(f"  inexistente y vencido → CU-004C · el precio sigue en {intacta['total']}")


def cupon_agotado():
    titulo('CU-004D — el código alcanzó su límite de usos')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 1})
    estado, r = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'ULTIMO'})

    assert estado == 409 and r['codigo'] == 'CU-004D', (estado, r)
    assert 'límite de usos' in r['mensaje']
    print(f"  ULTIMO (1 de 1 usado) → CU-004D")


def cupon_se_quita():
    titulo('CU-004B — el usuario retira el código y el total vuelve al original')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 2})
    _, con = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'HEXA10'})
    usos_con = int(sql("SELECT usos FROM codigos_promocionales WHERE codigo='HEXA10'"))

    estado, sin = pedir('DELETE', f"compras/{compra['id']}/cupon", comprador)
    assert estado == 200, (estado, sin)
    assert sin['codigoPromocional'] is None
    assert sin['descuento'] == 0 and sin['total'] == con['subtotal'] == 360000

    # El uso vuelve al cupón: si no, retirarlo lo iría gastando.
    assert sql(f"SELECT estado FROM usos_promocion WHERE compra_id='{compra['id']}'") == 'LIBERADO'
    usos_sin = int(sql("SELECT usos FROM codigos_promocionales WHERE codigo='HEXA10'"))
    assert usos_sin == usos_con - 1, (usos_con, usos_sin)

    # Quitarlo cuando no hay ninguno no es un error.
    estado, otra_vez = pedir('DELETE', f"compras/{compra['id']}/cupon", comprador)
    assert estado == 200 and otra_vez['total'] == 360000, (estado, otra_vez)
    print(f'  retirado: total 324000 → 360000 · usos {usos_con} → {usos_sin}')


def un_cupon_por_compra():
    titulo('CU-004 — una compra admite un solo código a la vez')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 1})
    pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'HEXA10'})

    estado, r = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'VIP15'})
    assert estado == 409 and r['codigo'] == 'COMPRA_YA_TIENE_CUPON', (estado, r)
    assert 'Quítalo antes' in r['mensaje']
    print('  segundo código → COMPRA_YA_TIENE_CUPON')


def cupon_fuera_de_tiempo():
    titulo('CU-004 — los códigos se aplican antes de pagar, no después')
    comprador = alguien()
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 1})
    pedir('POST', f"compras/{compra['id']}/pagar", comprador,
          {'metodoPago': 'TARJETA', 'token': 'tok_ok'})

    estado, r = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'HEXA10'})
    assert estado == 409 and r['codigo'] == 'COMPRA_NO_ADMITE_CUPON', (estado, r)

    # Y sobre una reserva vencida, el error es el de la reserva.
    _, otra = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 1})
    sql(f"UPDATE compras SET expira_en = now() - interval '1 minute' WHERE id='{otra['id']}'")
    estado, vencida = pedir('PUT', f"compras/{otra['id']}/cupon", comprador, {'codigo': 'HEXA10'})
    assert estado == 409 and vencida['codigo'] == 'CU-001B', (estado, vencida)

    # Un código con caracteres que no admite el formato: 400 antes de llegar al servicio.
    estado, _ = pedir('PUT', f"compras/{otra['id']}/cupon", comprador, {'codigo': 'no válido!'})
    assert estado == 400, estado
    print('  pagada → NO_ADMITE_CUPON · vencida → CU-001B · formato malo → 400')


def el_barrido_libera_las_vencidas():
    titulo('CU-001B — el barrido libera las reservas que nadie pagó')
    comprador = alguien()
    antes = libres(ROCK_TRIBUNA)
    _, compra = pedir('POST', 'compras', comprador, {'localidadId': ROCK_TRIBUNA, 'cantidad': 2})
    _, con_cupon = pedir('PUT', f"compras/{compra['id']}/cupon", comprador, {'codigo': 'HEXA10'})
    usos_con = int(sql("SELECT usos FROM codigos_promocionales WHERE codigo='HEXA10'"))
    sql(f"UPDATE compras SET expira_en = now() - interval '1 minute' WHERE id='{compra['id']}'")

    # El barrido corre al segundo 0 de cada minuto, así que en el peor caso
    # hay que esperar uno entero. Este es el bloque lento de la suite, y es a
    # propósito: es la única forma de ver que el cupo vuelve solo, sin que
    # nadie toque la compra.
    for _ in range(100):
        if sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'EXPIRADA':
            break
        time.sleep(1)

    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'EXPIRADA', \
        'el barrido debería haber vencido la reserva sin que nadie la tocara'
    assert sql(f"SELECT motivo FROM compras WHERE id='{compra['id']}'") == \
        'La reserva venció sin pagarse (CU-001B)'
    assert libres(ROCK_TRIBUNA) == antes, 'los cupos vuelven al mercado'
    # Y el uso del cupón también se devuelve.
    assert int(sql("SELECT usos FROM codigos_promocionales WHERE codigo='HEXA10'")) == usos_con - 1
    print(f'  el barrido venció la reserva solo · {antes} cupos de vuelta · uso del cupón devuelto')


def hace_falta_sesion():
    titulo('RNF-06 — comprar exige sesión con rol Cliente')
    estado, _ = pedir('POST', 'compras', None, {'localidadId': FEST_GENERAL, 'cantidad': 1})
    assert estado == 401, estado

    # Un token válido pero de otro rol tampoco compra.
    estado, _ = pedir('POST', 'compras', ANA, {'localidadId': FEST_GENERAL, 'cantidad': 1},
                      roles=('Personal',))
    assert estado == 403, estado
    print('  sin token → 401 · con rol Personal → 403')


if __name__ == '__main__':
    resembrar()
    sys.exit(correr([
        camino_feliz,
        consultar_mis_compras,
        sin_disponibilidad,
        evento_que_no_esta_a_la_venta,
        datos_que_no_valen,
        pago_rechazado,
        pasarela_sin_respuesta,
        no_se_cobra_dos_veces,
        reserva_vencida,
        cupon_camino_feliz,
        cupon_se_escribe_como_sea,
        cupon_no_aplica,
        cupon_invalido,
        cupon_agotado,
        cupon_se_quita,
        un_cupon_por_compra,
        cupon_fuera_de_tiempo,
        el_barrido_libera_las_vencidas,
        hace_falta_sesion,
    ]))
