#!/usr/bin/env python3
"""
CU-003 — Cancelar entradas y pedir el reembolso, de extremo a extremo.

Recorre los pasos 1-9 de la ficha y sus cuatro caminos alternos:

    CU-003A   el reembolso es parcial por la cercanía del evento
    CU-003B   se cancelan solo algunas entradas de la compra
    CU-003C   la pasarela deniega el reembolso y las entradas siguen activas
    CU-003D   ninguna de las entradas indicadas se puede cancelar

Lo que se comprueba en la base es el orden que el servicio elige a propósito
(anular primero, reembolsar después) y lo que ese orden tiene que garantizar:
si el reembolso se rechaza, las entradas vuelven a estar válidas; si se
aprueba, el cupo vuelve a la venta y la compra refleja si quedó entera o a
medias.

Necesita la infraestructura y el servicio levantados:

    cd ../../infra && ./iniciar.sh
    python3 pruebas/cu003-cancelacion.py

Resiembra al empezar, así que no depende del estado que dejen otras pruebas.
"""

import sys
import uuid

from venta import (
    FEST, FEST_GENERAL, FEST_PALCO, JAZZ_TERRAZA, PORTERO, ROCK_GENERAL,
    SINFONICA_LUNETA, STANDUP_GENERAL, VOLEIBOL,
    comprar, correr, pedir, resembrar, sql, titulo,
)


def alguien():
    return str(uuid.uuid4())


def libres(localidad):
    return int(sql(f"SELECT aforo - vendidas - reservadas FROM localidades_evento "
                   f"WHERE localidad_id='{localidad}'"))


def cotizar(usuario, compra, entradas=None):
    cuerpo = {'entradaIds': entradas} if entradas else {}
    return pedir('POST', f"compras/{compra['id']}/cancelacion/cotizacion", usuario, cuerpo)


def cancelar(usuario, compra, monto, motivo='No puedo asistir', entradas=None):
    cuerpo = {'motivo': motivo, 'montoAceptado': monto}
    if entradas:
        cuerpo['entradaIds'] = entradas
    return pedir('POST', f"compras/{compra['id']}/cancelaciones", usuario, cuerpo)


def cotizacion_total():
    titulo('Pasos 2-4 — cotizar: qué se puede cancelar y cuánto se devuelve')
    comprador = alguien()
    compra = comprar(comprador, FEST_GENERAL, 2)   # el FEST está a 90 días

    estado, r = cotizar(comprador, compra)
    assert estado == 200, (estado, r)
    assert len(r['entradasCancelables']) == 2 and r['entradasRechazadas'] == []
    assert r['montoPagado'] == 360000
    assert r['porcentajeReembolso'] == 100 and r['tramo'] == 'TOTAL'
    assert r['montoReembolso'] == 360000 and r['parcial'] is False
    assert 'Se reembolsa el total' in r['mensaje']

    # Cotizar no cambia nada: es el punto de "sin cambiar nada" de la ficha.
    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'PAGADA'
    assert sql(f"SELECT count(*) FROM entradas WHERE compra_id='{compra['id']}' "
               f"AND estado='VALIDA'") == '2'
    print(f"  2 cancelables · {r['montoReembolso']} COP al 100 % · la compra sigue PAGADA")


def camino_feliz():
    titulo('Pasos 5-9 — confirmar, reembolsar, anular y devolver el cupo')
    comprador = alguien()
    antes = libres(FEST_PALCO)
    compra = comprar(comprador, FEST_PALCO, 2)
    assert libres(FEST_PALCO) == antes - 2

    _, cotizacion = cotizar(comprador, compra)
    estado, r = cancelar(comprador, compra, cotizacion['montoReembolso'])

    assert estado == 200, (estado, r)
    assert r['estado'] == 'APROBADA'
    assert r['referenciaReembolso'], 'la pasarela devuelve una referencia del abono'
    assert r['montoReembolso'] == 840000
    assert 'Reembolso aprobado' in r['mensaje']

    # Post-condiciones: entradas anuladas, compra cancelada, cupo de vuelta.
    assert sql(f"SELECT count(*) FROM entradas WHERE compra_id='{compra['id']}' "
               f"AND estado='ANULADA'") == '2'
    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'CANCELADA'
    assert libres(FEST_PALCO) == antes, 'el cupo cancelado vuelve a estar a la venta'

    # Y queda el registro con su motivo, para el histórico financiero (RNF-11).
    fila = sql(f"SELECT estado || '|' || motivo FROM cancelaciones WHERE id='{r['cancelacionId']}'")
    assert fila == 'APROBADA|No puedo asistir', fila
    print(f"  {r['montoReembolso']} COP reembolsados · compra CANCELADA · {antes} cupos de vuelta")


def reembolso_parcial():
    titulo('CU-003A — por la cercanía del evento, el reembolso es parcial')
    comprador = alguien()
    # El Stand-up está a 4 días: entre las 48 horas y los 7 días, tramo PARCIAL.
    compra = comprar(comprador, STANDUP_GENERAL, 2)

    estado, cotizacion = cotizar(comprador, compra)
    assert estado == 200, (estado, cotizacion)
    assert cotizacion['tramo'] == 'PARCIAL' and cotizacion['parcial'] is True
    assert cotizacion['porcentajeReembolso'] == 50
    assert cotizacion['montoPagado'] == 140000
    assert cotizacion['montoReembolso'] == 70000
    # La ficha pide informarlo antes de que confirme, y eso es el mensaje.
    assert 'se reembolsa el 50 %' in cotizacion['mensaje'], cotizacion['mensaje']
    assert '70000' in cotizacion['mensaje'] and '140000' in cotizacion['mensaje']

    estado, r = cancelar(comprador, compra, 70000)
    assert estado == 200 and r['montoReembolso'] == 70000, (estado, r)
    assert r['porcentajeReembolso'] == 50
    print(f"  a 4 días: 140000 pagados → {r['montoReembolso']} devueltos (50 %)")


def fuera_de_plazo():
    titulo('Paso 3 — fuera del plazo de cancelación')
    comprador = alguien()
    # El Jazz empieza en menos de un día: por debajo de las 48 horas.
    compra = comprar(comprador, JAZZ_TERRAZA, 1)

    estado, r = cotizar(comprador, compra)
    assert estado == 409 and r['codigo'] == 'CANCELACION_FUERA_DE_PLAZO', (estado, r)
    assert '48 horas antes' in r['mensaje'], r['mensaje']

    # Y cancelar directamente tampoco, no solo cotizar.
    estado, intento = cancelar(comprador, compra, 150000)
    assert estado == 409 and intento['codigo'] == 'CANCELACION_FUERA_DE_PLAZO', (estado, intento)
    assert sql(f"SELECT estado FROM entradas WHERE compra_id='{compra['id']}'") == 'VALIDA'
    print(f"  a menos de 48 h → {r['mensaje']}")


def evento_cancelado_devuelve_todo():
    titulo('Paso 3 — si el organizador cancela el evento, se devuelve todo')
    comprador = alguien()
    compra = comprar(comprador, SINFONICA_LUNETA, 1)
    # El organizador cancela el evento después de la venta.
    sql(f"UPDATE eventos_referencia SET estado='CANCELADO' WHERE evento_id='{compra['eventoId']}'")

    estado, r = cotizar(comprador, compra)
    assert estado == 200, (estado, r)
    assert r['tramo'] == 'EVENTO_CANCELADO'
    assert r['porcentajeReembolso'] == 100 and r['parcial'] is False
    assert r['montoReembolso'] == r['montoPagado'] == 70000
    print('  evento CANCELADO → 100 % sin importar la fecha')


def cancelacion_parcial_de_entradas():
    titulo('CU-003B — cancelar solo algunas entradas de la compra')
    comprador = alguien()
    antes = libres(ROCK_GENERAL)
    compra = comprar(comprador, ROCK_GENERAL, 3)
    una = compra['entradas'][0]
    otras = [e['id'] for e in compra['entradas'][1:]]

    estado, cotizacion = cotizar(comprador, compra, entradas=[una['id']])
    assert estado == 200, (estado, cotizacion)
    assert cotizacion['entradasCancelables'] == [una['id']]
    assert cotizacion['montoPagado'] == una['precioPagado']

    estado, r = cancelar(comprador, compra, cotizacion['montoReembolso'], entradas=[una['id']])
    assert estado == 200, (estado, r)
    assert sql(f"SELECT estado FROM entradas WHERE id='{una['id']}'") == 'ANULADA'
    for viva in otras:
        assert sql(f"SELECT estado FROM entradas WHERE id='{viva}'") == 'VALIDA'

    # La compra no queda cancelada: queda a medias, y eso tiene su estado.
    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'PARCIALMENTE_CANCELADA'
    assert libres(ROCK_GENERAL) == antes - 2, 'solo vuelve el cupo de la entrada cancelada'

    # Y una compra a medias todavía admite cancelar el resto.
    estado, resto = cotizar(comprador, compra)
    assert estado == 200 and sorted(resto['entradasCancelables']) == sorted(otras), resto
    # La ya anulada no se menciona cuando no se pidió explícitamente.
    assert resto['entradasRechazadas'] == [], resto
    estado, final = cancelar(comprador, compra, resto['montoReembolso'])
    assert estado == 200, (estado, final)
    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'CANCELADA'
    assert libres(ROCK_GENERAL) == antes
    print(f'  1 de 3 → PARCIALMENTE_CANCELADA · luego las otras 2 → CANCELADA · {antes} cupos de vuelta')


def ninguna_cancelable():
    titulo('CU-003D — ninguna de las entradas indicadas se puede cancelar')
    comprador = alguien()
    compra = comprar(comprador, FEST_GENERAL, 2)
    usada, otra = compra['entradas']

    # Una se usó para entrar al evento.
    estado, _ = pedir('POST', 'ingresos', PORTERO,
                      {'eventoId': FEST, 'codigoQr': usada['codigoQr']}, roles=('Personal',))
    assert estado == 200, estado

    estado, r = cotizar(comprador, compra, entradas=[usada['id']])
    assert estado == 409 and r['codigo'] == 'CU-003D', (estado, r)
    assert r['rechazadas'][0]['entradaId'] == usada['id']
    assert 'ya se usó' in r['rechazadas'][0]['motivo'], r['rechazadas']

    # Pero la otra sí se puede, y la respuesta dice cuál quedó fuera (paso 4).
    estado, mixta = cotizar(comprador, compra)
    assert estado == 200, (estado, mixta)
    assert mixta['entradasCancelables'] == [otra['id']]
    assert len(mixta['entradasRechazadas']) == 1
    assert mixta['entradasRechazadas'][0]['entradaId'] == usada['id']
    assert mixta['montoPagado'] == otra['precioPagado'], 'lo usado no entra en el reembolso'
    print(f"  solo la usada → CU-003D · la compra entera → 1 cancelable y 1 rechazada")


def entradas_que_no_son_de_la_compra():
    titulo('CU-003D — identificadores que no son de esta compra')
    comprador = alguien()
    compra = comprar(comprador, FEST_GENERAL, 1)
    ajena = comprar(alguien(), FEST_GENERAL, 1)['entradas'][0]['id']

    estado, r = cotizar(comprador, compra, entradas=[ajena])
    assert estado == 409 and r['codigo'] == 'CU-003D', (estado, r)
    assert 'no pertenece a esta compra' in r['rechazadas'][0]['motivo'], r['rechazadas']

    estado, inexistente = cotizar(comprador, compra,
                                  entradas=['20000000-0000-4000-8000-0000000000ff'])
    assert estado == 409 and inexistente['codigo'] == 'CU-003D', (estado, inexistente)
    print('  entrada de otra compra e inexistente → CU-003D, sin filtrar de quién es')


def reembolso_rechazado():
    titulo('CU-003C — la pasarela deniega el reembolso y las entradas siguen activas')
    comprador = alguien()
    antes = libres(FEST_PALCO)
    # `tok_noreemb` cobra bien, pero su cobro no admite devoluciones.
    compra = comprar(comprador, FEST_PALCO, 1, token='tok_noreemb')
    _, cotizacion = cotizar(comprador, compra)

    estado, r = cancelar(comprador, compra, cotizacion['montoReembolso'])
    assert estado == 409 and r['codigo'] == 'CU-003C', (estado, r)
    assert 'siguen activas' in r['mensaje']

    # Lo que importa: anular primero no puede dejar al cliente sin entrada
    # y sin dinero. Al rechazarse el reembolso, la entrada vuelve a valer.
    assert sql(f"SELECT estado FROM entradas WHERE compra_id='{compra['id']}'") == 'VALIDA', \
        'CU-003C: si no hay reembolso, la entrada tiene que volver a estar válida'
    assert sql(f"SELECT estado FROM compras WHERE id='{compra['id']}'") == 'PAGADA'
    assert libres(FEST_PALCO) == antes - 1, 'el cupo no vuelve: la entrada sigue siendo suya'

    # Y queda el intento registrado como rechazado, con el motivo de la pasarela.
    fila = sql(f"SELECT estado FROM cancelaciones WHERE compra_id='{compra['id']}'")
    assert fila == 'RECHAZADA', fila
    motivo = sql(f"SELECT motivo_pasarela FROM cancelaciones WHERE compra_id='{compra['id']}'")
    assert 'no admite reembolsos' in motivo, motivo
    print(f'  rechazo → CU-003C · entrada VALIDA otra vez · registrado como RECHAZADA')


def el_monto_cambio():
    titulo('Paso 5 — entre cotizar y confirmar, el monto cambió')
    comprador = alguien()
    compra = comprar(comprador, FEST_GENERAL, 2)
    _, cotizacion = cotizar(comprador, compra)

    # El usuario confirma un monto que no es el que el sistema calcula ahora.
    estado, r = cancelar(comprador, compra, cotizacion['montoReembolso'] - 1)
    assert estado == 409 and r['codigo'] == 'MONTO_REEMBOLSO_CAMBIO', (estado, r)
    assert r['montoReembolso'] == cotizacion['montoReembolso'], r
    assert 'vuelve a confirmar' in r['mensaje']

    # Nada se tocó: la ficha exige volver a preguntar, no reembolsar otra cosa.
    assert sql(f"SELECT count(*) FROM entradas WHERE compra_id='{compra['id']}' "
               f"AND estado='ANULADA'") == '0'
    assert sql(f"SELECT count(*) FROM cancelaciones WHERE compra_id='{compra['id']}'") == '0'
    print(f"  monto distinto → MONTO_REEMBOLSO_CAMBIO, informando {r['montoReembolso']}")


def compras_que_no_se_pueden_cancelar():
    titulo('Paso 2 — una compra sin pagar no se cancela, se deja vencer')
    comprador = alguien()
    _, reservada = pedir('POST', 'compras', comprador, {'localidadId': FEST_GENERAL, 'cantidad': 1})

    estado, r = pedir('POST', f"compras/{reservada['id']}/cancelacion/cotizacion", comprador, {})
    assert estado == 409 and r['codigo'] == 'COMPRA_NO_CANCELABLE', (estado, r)
    assert 'PENDIENTE' in r['mensaje'], r['mensaje']

    # Y la compra de otro no existe para mí.
    pagada = comprar(alguien(), FEST_GENERAL, 1)
    estado, ajena = cotizar(comprador, pagada)
    assert estado == 404 and ajena['codigo'] == 'COMPRA_NO_ENCONTRADA', (estado, ajena)

    # Cancelar dos veces la misma compra: la segunda no tiene qué cancelar.
    propia = comprar(comprador, FEST_GENERAL, 1)
    _, cotizacion = cotizar(comprador, propia)
    cancelar(comprador, propia, cotizacion['montoReembolso'])
    estado, otra_vez = cotizar(comprador, propia)
    assert estado == 409, (estado, otra_vez)
    assert otra_vez['codigo'] in ('CU-003D', 'COMPRA_NO_CANCELABLE'), otra_vez
    print('  PENDIENTE → NO_CANCELABLE · ajena → 404 · ya cancelada → sin nada que cancelar')


def datos_que_no_valen():
    titulo('Pasos 1 y 5 — lo que el cliente no puede mandar')
    comprador = alguien()
    compra = comprar(comprador, FEST_GENERAL, 1)
    ruta = f"compras/{compra['id']}/cancelaciones"
    for cuerpo, porque in (
        ({'montoAceptado': 180000}, 'el motivo es obligatorio (paso 1)'),
        ({'motivo': 'no', 'montoAceptado': 180000}, 'motivo demasiado corto'),
        ({'motivo': 'No puedo asistir'}, 'falta el monto que se acepta'),
        ({'motivo': 'No puedo asistir', 'montoAceptado': 0}, 'un reembolso de cero no es una cancelación'),
        ({'motivo': 'No puedo asistir', 'montoAceptado': -5}, 'monto negativo'),
        ({'motivo': 'No puedo asistir', 'montoAceptado': 1, 'entradaIds': []}, 'lista vacía'),
        ({'motivo': 'No puedo asistir', 'montoAceptado': 1, 'entradaIds': ['x']}, 'no son uuid'),
    ):
        estado, _ = pedir('POST', ruta, comprador, cuerpo)
        assert estado == 400, f'{porque}: esperaba 400 y fue {estado}'

    # Y pedir dos veces la misma entrada tampoco: `@ArrayUnique`.
    entrada = compra['entradas'][0]['id']
    estado, _ = pedir('POST', ruta, comprador,
                      {'motivo': 'No puedo asistir', 'montoAceptado': 1,
                       'entradaIds': [entrada, entrada]})
    assert estado == 400, estado
    print('  8 cuerpos inválidos, 8 respuestas 400')


def hace_falta_sesion():
    titulo('RNF-06 — cancelar exige sesión con rol Cliente')
    comprador = alguien()
    compra = comprar(comprador, FEST_GENERAL, 1)

    estado, _ = pedir('POST', f"compras/{compra['id']}/cancelacion/cotizacion", None, {})
    assert estado == 401, estado
    estado, _ = pedir('POST', f"compras/{compra['id']}/cancelacion/cotizacion", comprador, {},
                      roles=('Personal',))
    assert estado == 403, estado
    print('  sin token → 401 · con rol Personal → 403')


if __name__ == '__main__':
    resembrar()
    sys.exit(correr([
        cotizacion_total,
        camino_feliz,
        reembolso_parcial,
        fuera_de_plazo,
        evento_cancelado_devuelve_todo,
        cancelacion_parcial_de_entradas,
        ninguna_cancelable,
        entradas_que_no_son_de_la_compra,
        reembolso_rechazado,
        el_monto_cambio,
        compras_que_no_se_pueden_cancelar,
        datos_que_no_valen,
        hace_falta_sesion,
    ]))
