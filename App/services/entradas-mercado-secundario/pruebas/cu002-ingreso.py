#!/usr/bin/env python3
"""
CU-002 — Validar el QR en el ingreso, de extremo a extremo.

Recorre los pasos 1-10 de la ficha y sus cuatro caminos alternos:

    CU-002A   el QR es inválido, de otro evento o anulado
    CU-002B   el recinto alcanzó su aforo
    CU-002D   el QR ya fue utilizado
    CU-002E   el dispositivo opera sin conexión y luego sincroniza

Lo que se comprueba en la base es lo que la ficha declara como
post-condiciones: la hora de acceso queda registrada, el aforo sube y el QR
queda marcado como usado — y, en los caminos alternos, que **no** queda nada
de eso (un aforo lleno no puede dejar la entrada quemada).

RNF-08 pide que la validación no genere filas: aquí se comprueba lo que la
hace posible —que un QR solo se pueda usar una vez aunque dos puertas lo
escaneen a la vez—; el número en milisegundos lo mide `rnf07-desempeno.py`.

Necesita la infraestructura y el servicio levantados:

    cd ../../infra && ./iniciar.sh
    python3 pruebas/cu002-ingreso.py

Resiembra al empezar, así que no depende del estado que dejen otras pruebas.
"""

import concurrent.futures
import hashlib
import sys
import uuid
from datetime import datetime, timedelta, timezone

from venta import (
    CAFE_GENERAL, FEST, FEST_GENERAL, FEST_PALCO, GALA, GALA_PLATEA, PORTERO, ROCK,
    ROCK_GENERAL, SINFONICA_LUNETA, VOLEIBOL,
    comprar, correr, pedir, resembrar, sql, titulo,
)

PUERTA = ('Personal',)


def alguien():
    return str(uuid.uuid4())


def validar(codigo, evento=FEST, punto='Puerta 3', quien=PORTERO):
    return pedir('POST', 'ingresos', quien,
                 {'eventoId': evento, 'codigoQr': codigo, 'puntoAcceso': punto}, roles=PUERTA)


def asistentes(evento):
    return int(sql(f"SELECT asistentes FROM eventos_referencia WHERE evento_id='{evento}'"))


def camino_feliz():
    titulo('Pasos 1-10 — escanear, autorizar y registrar el ingreso')
    compra = comprar(alguien(), FEST_GENERAL, 1)
    entrada = compra['entradas'][0]
    antes = asistentes(FEST)

    estado, r = validar(entrada['codigoQr'])
    assert estado == 200, (estado, r)
    assert r['autorizado'] is True and r['mensaje'] == 'Ingreso autorizado'
    assert r['numeroTicket'] == entrada['numeroTicket']
    assert r['localidadNombre'] == 'General'
    assert r['eventoNombre'] == 'HEXACORE Fest 2026'
    assert r['asistentes'] == antes + 1

    # Post-condición 1: la hora de acceso queda registrada, con quién y dónde.
    fila = sql(f"SELECT validado_por || '|' || punto_acceso || '|' || origen "
               f"FROM ingresos WHERE entrada_id='{entrada['id']}'")
    assert fila == f'{PORTERO}|Puerta 3|EN_LINEA', fila
    # Post-condición 2: el aforo sube. Post-condición 3: el QR queda usado.
    assert asistentes(FEST) == antes + 1
    assert sql(f"SELECT estado FROM entradas WHERE id='{entrada['id']}'") == 'USADA'
    print(f"  {r['numeroTicket']} autorizado en Puerta 3 · aforo {antes} → {r['asistentes']}")


def qr_ya_utilizado():
    titulo('CU-002D — el mismo QR no entra dos veces')
    compra = comprar(alguien(), FEST_GENERAL, 1)
    codigo = compra['entradas'][0]['codigoQr']
    validar(codigo, punto='Puerta 1')
    antes = asistentes(FEST)

    estado, r = validar(codigo, punto='Puerta 7')
    assert estado == 409 and r['codigo'] == 'CU-002D', (estado, r)
    assert r['autorizado'] is False
    # Dice cuándo y por dónde entró la primera vez: es lo que el personal
    # necesita para resolverlo en la puerta.
    assert r['puntoAcceso'] == 'Puerta 1', r
    assert r['primerIngreso'] is not None
    assert 'Puerta 1' in r['mensaje']

    # El segundo intento no suma al aforo ni deja un segundo registro.
    assert asistentes(FEST) == antes
    assert sql(f"SELECT count(*) FROM ingresos WHERE entrada_id='{compra['entradas'][0]['id']}'") == '1'
    print(f"  segundo escaneo → CU-002D, señalando la Puerta 1 · aforo intacto en {antes}")


def qr_invalido():
    titulo('CU-002A — el QR no vale')
    antes = asistentes(FEST)

    # Un código que no existe.
    estado, inventado = validar('HXC-QR-NOEXISTE')
    assert estado == 404 and inventado['codigo'] == 'CU-002A', (estado, inventado)
    assert inventado['autorizado'] is False
    assert 'no corresponde a una entrada de este evento' in inventado['mensaje']

    # Una entrada real, pero de otro evento: en esta puerta no vale.
    compra = comprar(alguien(), ROCK_GENERAL, 1)
    estado, otro_evento = validar(compra['entradas'][0]['codigoQr'], evento=FEST)
    assert estado == 404 and otro_evento['codigo'] == 'CU-002A', (estado, otro_evento)

    # En la puerta de su propio evento sí entra: lo anterior era el evento, no la entrada.
    estado, bien = validar(compra['entradas'][0]['codigoQr'], evento=ROCK)
    assert estado == 200 and bien['autorizado'] is True, (estado, bien)

    # Un evento que no existe, y uno cancelado.
    estado, sin_evento = validar('HXC-QR-000001', evento='e0000099-0000-4000-8000-000000000099')
    assert estado == 404 and 'el evento no existe' in sin_evento['mensaje'], sin_evento
    estado, cancelado = validar('HXC-QR-000001', evento=VOLEIBOL)
    assert estado == 404 and 'el evento fue cancelado' in cancelado['mensaje'], cancelado

    assert asistentes(FEST) == antes, 'ningún rechazo puede tocar el aforo'
    print('  inexistente · de otro evento · evento inexistente · evento cancelado → CU-002A')


def qr_anulado_o_en_reventa():
    titulo('CU-002A — una entrada anulada o publicada en reventa no ingresa')
    compra = comprar(alguien(), FEST_PALCO, 1)
    entrada = compra['entradas'][0]

    sql(f"UPDATE entradas SET estado='ANULADA' WHERE id='{entrada['id']}'")
    estado, anulada = validar(entrada['codigoQr'])
    assert estado == 404 and anulada['codigo'] == 'CU-002A', (estado, anulada)
    assert 'anulada' in anulada['mensaje']

    sql(f"UPDATE entradas SET estado='EN_REVENTA' WHERE id='{entrada['id']}'")
    estado, reventa = validar(entrada['codigoQr'])
    assert estado == 404 and reventa['codigo'] == 'CU-002A', (estado, reventa)
    assert 'retirarla primero' in reventa['mensaje'], reventa
    print('  ANULADA y EN_REVENTA → CU-002A, con el motivo que el portero puede explicar')


def aforo_completo():
    titulo('CU-002B — el recinto alcanzó su aforo')
    # La Gala tiene aforo 120 y 120 asistentes ya en la semilla.
    compra = comprar(alguien(), GALA_PLATEA, 1)
    entrada = compra['entradas'][0]
    antes = asistentes(GALA)

    estado, r = validar(entrada['codigoQr'], evento=GALA)
    assert estado == 409 and r['codigo'] == 'CU-002B', (estado, r)
    assert r['autorizado'] is False
    assert '120' in r['mensaje'], r['mensaje']
    assert 'zona de espera' in r['sugerencia'] and 'coordinador' in r['sugerencia']

    # Lo que importa del camino: la transacción se deshace entera. Una entrada
    # válida que se queda fuera por aforo NO puede quedar quemada.
    assert sql(f"SELECT estado FROM entradas WHERE id='{entrada['id']}'") == 'VALIDA', \
        'CU-002B no puede dejar la entrada marcada como usada'
    assert sql(f"SELECT count(*) FROM ingresos WHERE entrada_id='{entrada['id']}'") == '0'
    assert asistentes(GALA) == antes
    print(f'  aforo 120/120 → CU-002B · la entrada sigue VALIDA y el aforo en {antes}')


def dos_puertas_a_la_vez():
    titulo('Pasos 5-8 — dos puertas escanean el mismo QR simultáneamente')
    compra = comprar(alguien(), FEST_GENERAL, 1)
    entrada = compra['entradas'][0]
    antes = asistentes(FEST)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futuros = [pool.submit(validar, entrada['codigoQr'], FEST, f'Puerta {n}') for n in (1, 2)]
        respuestas = [f.result() for f in futuros]

    codigos = sorted(estado for estado, _ in respuestas)
    assert codigos == [200, 409], codigos
    rechazo = next(cuerpo for estado, cuerpo in respuestas if estado == 409)
    assert rechazo['codigo'] == 'CU-002D', rechazo

    # Y sobre todo: un solo registro y un solo asistente, no dos.
    assert sql(f"SELECT count(*) FROM ingresos WHERE entrada_id='{entrada['id']}'") == '1'
    assert asistentes(FEST) == antes + 1
    print('  200 y 409 · 1 ingreso registrado · el aforo sube exactamente 1')


def cache_para_operar_sin_conexion():
    titulo('CU-002E — la caché de QR válidos viaja como hashes')
    compra = comprar(alguien(), SINFONICA_LUNETA, 2)
    evento = compra['eventoId']

    estado, cache = pedir('GET', f'ingresos/eventos/{evento}/cache', PORTERO, roles=PUERTA)
    assert estado == 200, (estado, cache)
    assert cache['eventoId'] == evento and cache['generadaEn']

    hashes = {q['hash'] for q in cache['validos']}
    for entrada in compra['entradas']:
        esperado = hashlib.sha256(entrada['codigoQr'].encode()).hexdigest()
        assert esperado in hashes, entrada['numeroTicket']

    # Lo importante del camino: el teléfono de la puerta no se lleva códigos
    # con los que alguien podría entrar.
    codigos = {e['codigoQr'] for e in compra['entradas']}
    bruto = str(cache)
    assert not any(c in bruto for c in codigos), 'un código en claro no puede viajar en la caché'
    assert all(set(q['hash']) <= set('0123456789abcdef') and len(q['hash']) == 64 for q in cache['validos'])
    assert all(q['numeroTicket'] and q['localidadNombre'] for q in cache['validos'])

    # Una entrada ya usada sale de la caché: no debería poder validarse offline.
    validar(compra['entradas'][0]['codigoQr'], evento=compra['eventoId'])
    _, despues = pedir('GET', f'ingresos/eventos/{evento}/cache', PORTERO, roles=PUERTA)
    usado = hashlib.sha256(compra['entradas'][0]['codigoQr'].encode()).hexdigest()
    assert usado not in {q['hash'] for q in despues['validos']}
    print(f"  {len(cache['validos'])} hashes SHA-256, ningún código en claro · la usada sale de la caché")


def sincronizar_lo_escaneado_sin_conexion():
    titulo('CU-002E — subir los ingresos hechos sin conexión')
    compra = comprar(alguien(), CAFE_GENERAL, 3)
    evento = compra['eventoId']
    antes = asistentes(evento)
    ahora = datetime.now(timezone.utc)
    iso = lambda minutos: (ahora - timedelta(minutes=minutos)).isoformat().replace('+00:00', 'Z')

    estado, r = pedir('POST', 'ingresos/sincronizacion', PORTERO, {
        'eventoId': evento,
        'ingresos': [
            {'codigoQr': compra['entradas'][0]['codigoQr'], 'escaneadoEn': iso(20), 'puntoAcceso': 'Puerta A'},
            {'codigoQr': compra['entradas'][1]['codigoQr'], 'escaneadoEn': iso(15), 'puntoAcceso': 'Puerta A'},
        ],
    }, roles=PUERTA)

    assert estado == 200, (estado, r)
    assert r['registrados'] == 2 and r['conflictos'] == 0
    assert all(x['resultado'] == 'REGISTRADO' for x in r['resultados'])
    assert asistentes(evento) == antes + 2

    # Se guarda la hora real del escaneo, no la de la subida, y marcado como
    # sincronizado: si no, el informe de la puerta mentiría.
    fila = sql(f"SELECT origen FROM ingresos WHERE entrada_id='{compra['entradas'][0]['id']}'")
    assert fila == 'SINCRONIZADO', fila
    guardada = sql(f"SELECT escaneado_en < registrado_en FROM ingresos "
                   f"WHERE entrada_id='{compra['entradas'][0]['id']}'")
    assert guardada == 't', 'la hora del escaneo es anterior a la de la subida'
    print(f'  2 ingresos subidos · origen SINCRONIZADO · hora real conservada')
    return compra, evento


def sincronizacion_con_conflictos():
    titulo('CU-002E — lo que no pasa las reglas vuelve como conflicto, no se descarta')
    compra = comprar(alguien(), CAFE_GENERAL, 2)
    evento = compra['eventoId']
    ahora = datetime.now(timezone.utc)
    iso = lambda minutos: (ahora - timedelta(minutes=minutos)).isoformat().replace('+00:00', 'Z')
    valido = compra['entradas'][0]['codigoQr']

    # Dos puertas desconectadas escanearon el mismo QR, y además llegó un
    # código que no existe.
    estado, r = pedir('POST', 'ingresos/sincronizacion', PORTERO, {
        'eventoId': evento,
        'ingresos': [
            {'codigoQr': valido, 'escaneadoEn': iso(30), 'puntoAcceso': 'Puerta A'},
            {'codigoQr': valido, 'escaneadoEn': iso(10), 'puntoAcceso': 'Puerta B'},
            {'codigoQr': 'HXC-QR-INVENTADO', 'escaneadoEn': iso(5)},
        ],
    }, roles=PUERTA)

    assert estado == 200, 'una sincronización con conflictos no es un error de la petición'
    assert r['registrados'] == 1 and r['conflictos'] == 2, r
    por_resultado = [x['resultado'] for x in r['resultados']]
    assert por_resultado.count('REGISTRADO') == 1
    assert 'CU-002D' in por_resultado and 'CU-002A' in por_resultado, por_resultado

    # El que cuenta es el primero en el tiempo, no el primero de la lista.
    fila = sql(f"SELECT punto_acceso FROM ingresos WHERE entrada_id='{compra['entradas'][0]['id']}'")
    assert fila == 'Puerta A', fila
    # Y cada conflicto vuelve con su mensaje, para que el personal lo revise.
    assert all(x['mensaje'] for x in r['resultados'])
    print('  1 registrado · 2 conflictos (CU-002D y CU-002A) · gana el escaneo más antiguo')


def sincronizacion_invalida():
    titulo('CU-002E — lo que la sincronización no acepta')
    for cuerpo, porque in (
        ({'eventoId': FEST, 'ingresos': []}, 'al menos un ingreso'),
        ({'eventoId': FEST, 'ingresos': [{'codigoQr': 'HXC-QR-000001'}]}, 'falta la hora'),
        ({'eventoId': FEST, 'ingresos': [{'codigoQr': 'HXC-QR-000001', 'escaneadoEn': 'ayer'}]}, 'no es ISO 8601'),
        ({'eventoId': 'no-uuid', 'ingresos': [{'codigoQr': 'x', 'escaneadoEn': '2026-01-01T00:00:00Z'}]}, 'uuid'),
    ):
        estado, _ = pedir('POST', 'ingresos/sincronizacion', PORTERO, cuerpo, roles=PUERTA)
        assert estado == 400, f'{porque}: esperaba 400 y fue {estado}'
    print('  4 cuerpos inválidos, 4 respuestas 400')


def solo_el_personal_valida():
    titulo('RNF-06 — validar entradas es del personal de puerta')
    compra = comprar(alguien(), FEST_GENERAL, 1)
    codigo = compra['entradas'][0]['codigoQr']

    estado, _ = pedir('POST', 'ingresos', None, {'eventoId': FEST, 'codigoQr': codigo})
    assert estado == 401, estado

    # Un cliente con sesión válida tampoco: el rol es lo que decide, no tener
    # token. (Por eso va por `pedir` y no por `validar`, que firma como Personal.)
    estado, _ = pedir('POST', 'ingresos', alguien(),
                      {'eventoId': FEST, 'codigoQr': codigo}, roles=('Cliente',))
    assert estado == 403, estado

    # Un administrador sí, para poder cubrir una puerta.
    estado, admin = pedir('POST', 'ingresos', PORTERO,
                          {'eventoId': FEST, 'codigoQr': codigo}, roles=('Administrador',))
    assert estado == 200 and admin['autorizado'] is True, (estado, admin)
    print('  sin token → 401 · rol Cliente → 403 · rol Administrador → 200')


if __name__ == '__main__':
    resembrar()
    sys.exit(correr([
        camino_feliz,
        qr_ya_utilizado,
        qr_invalido,
        qr_anulado_o_en_reventa,
        aforo_completo,
        dos_puertas_a_la_vez,
        cache_para_operar_sin_conexion,
        sincronizar_lo_escaneado_sin_conexion,
        sincronizacion_con_conflictos,
        sincronizacion_invalida,
        solo_el_personal_valida,
    ]))
