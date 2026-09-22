#!/usr/bin/env python3
"""
CU-006 — Gestionar la publicación en el mercado secundario.

`cu006-flujo-completo.py` recorre la venta: publicar, reservar, pagar y
transferir. Esta suite cubre lo que rodea a esa venta y que hasta ahora no
tocaba ninguna prueba de integración: los pasos 1 y 5 (el vendedor elige qué
publicar, el comprador consulta el mercado) y los flujos alternos en los que
la venta **no** llega a ocurrir:

    CU-006A   el vendedor cambia el precio antes de que la compren
    CU-006B   el vendedor retira la entrada del mercado
    CU-006D   la ventana de reventa ya se cerró
    CU-006E   la entrada no está en un estado revendible
    CU-006F   el evento no permite reventa
    CU-006H   no se puede retirar con un cobro en vuelo

Necesita la infraestructura y el servicio levantados:

    cd ../../infra && ./iniciar.sh
    python3 pruebas/cu006b-publicaciones.py

Resiembra al empezar, así que no depende del estado que dejen otras pruebas.
"""

import subprocess
import sys
import uuid

from venta import (
    ANA, BRUNO, CAFE_GENERAL, CARLA, FEST, FEST_GENERAL, FEST_PALCO, GALA_PLATEA,
    PORTERO, ROCK_GENERAL, SINFONICA_LUNETA, STANDUP_GENERAL,
    comprar, correr, pedir, resembrar, sql, titulo,
)

# Entradas de la semilla, con su dueño.
E1 = '20000000-0000-4000-8000-000000000001'   # de Ana · HEXACORE Fest · General
E2 = '20000000-0000-4000-8000-000000000002'   # de Ana · HEXACORE Fest · Palco VIP
E3 = '20000000-0000-4000-8000-000000000003'   # de Bruno · Noche de Rock
E4 = '20000000-0000-4000-8000-000000000004'   # de Carla · Noche de Rock


def alguien():
    return str(uuid.uuid4())


def publicar(vendedor, entrada, precio):
    return pedir('POST', 'reventa/publicaciones', vendedor,
                 {'entradaId': entrada, 'precio': precio})


def caducar_bloqueo(publicacion_id):
    """
    Borra el bloqueo de Redis de una publicación.

    Es exactamente el estado en que queda el sistema cuando pasan los
    `REVENTA_BLOQUEO_TTL_SEGUNDOS` (120 por defecto) sin que el comprador
    pague: Redis caduca la clave él solo. Esperar dos minutos dentro de una
    prueba no aportaría nada que esto no diga.
    """
    subprocess.run(['redis-cli', '-p', '6380', 'DEL',
                    f'reventa:bloqueo:publicacion:{publicacion_id}'],
                   capture_output=True, check=True)


def mis_entradas_del_vendedor():
    titulo('Paso 1 — las entradas propias, con el veredicto de si se pueden publicar')
    estado, r = pedir('GET', 'reventa/mis-entradas', ANA)

    assert estado == 200, (estado, r)
    assert len(r) >= 2, r
    porid = {e['id']: e for e in r}
    assert E1 in porid and E2 in porid

    entrada = porid[E1]
    assert entrada['numeroTicket'] == 'TCK-2026-000001'
    assert entrada['eventoNombre'] == 'HEXACORE Fest 2026'
    assert entrada['lugar'] == 'Movistar Arena'
    assert entrada['localidadNombre'] == 'General'
    assert entrada['estado'] == 'VALIDA'
    assert entrada['puedePublicarse'] is True
    assert entrada.get('motivoBloqueo') is None, 'sin bloqueo no hay motivo que dar'
    # El tope se calcula en el servidor y viaja ya hecho: RNF-14 pide 0 reglas
    # de negocio duplicadas en el cliente.
    assert entrada['precioMaximo'] == entrada['precioOriginal'] * 1.5, entrada
    assert entrada.get('publicacion') is None, 'todavía no está publicada'

    # Quien no tiene entradas recibe una lista vacía, no un error.
    estado, vacio = pedir('GET', 'reventa/mis-entradas', alguien())
    assert estado == 200 and vacio == [], (estado, vacio)
    print(f"  {len(r)} entradas de Ana · tope {entrada['precioMaximo']} sobre {entrada['precioOriginal']}")


def el_veredicto_explica_por_que_no():
    titulo('Paso 1 — y cuando no se puede publicar, dice por qué')
    comprador = alguien()
    # Una entrada de la Gala: ese evento no permite reventa (CU-006F).
    gala = comprar(comprador, GALA_PLATEA, 1)['entradas'][0]
    # Una entrada usada para ingresar (CU-006E).
    fest = comprar(comprador, FEST_GENERAL, 1)['entradas'][0]
    pedir('POST', 'ingresos', PORTERO,
          {'eventoId': FEST, 'codigoQr': fest['codigoQr']}, roles=('Personal',))

    _, r = pedir('GET', 'reventa/mis-entradas', comprador)
    porid = {e['id']: e for e in r}

    sin_reventa = porid[gala['id']]
    assert sin_reventa['puedePublicarse'] is False
    assert sin_reventa['motivoBloqueo'] == 'CU-006F', sin_reventa
    assert sin_reventa['detalleBloqueo'], 'el motivo va acompañado de algo que mostrar'

    usada = porid[fest['id']]
    assert usada['puedePublicarse'] is False
    assert usada['motivoBloqueo'] == 'CU-006E', usada
    assert usada['estado'] == 'USADA'
    print(f"  Gala → CU-006F ({sin_reventa['detalleBloqueo']}) · entrada usada → CU-006E")


def publicar_camino_feliz():
    titulo('Pasos 2-4 — publicar una entrada propia en el mercado')
    estado, r = publicar(ANA, E1, 300000)

    assert estado == 201, (estado, r)
    assert r['entradaId'] == E1 and r['vendedorId'] == ANA
    assert r['precio'] == 300000 and r['precioOriginal'] == 250000
    assert r['estado'] == 'ACTIVA'
    assert r['eventoNombre'] == 'HEXACORE Fest 2026' and r['localidadNombre'] == 'General'
    assert r['precioMaximo'] == 375000
    # La ventana cierra `REVENTA_MARGEN_CIERRE_MINUTOS` antes del evento, y
    # ese margen es 0 por defecto: se admite hasta que el evento empieza.
    assert r['fechaExpiracion'] <= r['fechaEvento'], (r['fechaExpiracion'], r['fechaEvento'])

    # Post-condición: la entrada queda marcada, y así no se puede usar en la
    # puerta ni cancelar mientras está a la venta.
    assert sql(f"SELECT estado FROM entradas WHERE id='{E1}'") == 'EN_REVENTA'

    # Y ahora "mis entradas" la trae con su publicación incorporada.
    _, mias = pedir('GET', 'reventa/mis-entradas', ANA)
    publicada = next(e for e in mias if e['id'] == E1)
    assert publicada['puedePublicarse'] is False
    assert publicada['publicacion']['id'] == r['id']
    assert publicada['publicacion']['precio'] == 300000
    print(f"  publicada a {r['precio']} (tope {r['precioMaximo']}) · la entrada pasa a EN_REVENTA")
    return r


def publicar_lo_que_no_se_puede():
    titulo('Pasos 2-3 — lo que no se puede publicar, y por qué')
    # No es tuya.
    estado, ajena = publicar(BRUNO, E2, 300000)
    assert estado == 403 and ajena['codigo'] == 'NO_ES_PROPIETARIO', (estado, ajena)

    # No existe.
    estado, fantasma = publicar(ANA, '20000000-0000-4000-8000-0000000000ff', 100000)
    assert estado == 404 and fantasma['codigo'] == 'ENTRADA_NO_ENCONTRADA', (estado, fantasma)

    # Ya está publicada (E1 quedó en el mercado en el bloque anterior).
    estado, repetida = publicar(ANA, E1, 310000)
    assert estado == 409 and repetida['codigo'] == 'ENTRADA_YA_PUBLICADA', (estado, repetida)

    # Por encima del tope: 1,5 × 600 000 = 900 000.
    estado, cara = publicar(ANA, E2, 900001)
    assert estado == 422 and cara['codigo'] == 'PRECIO_SOBRE_TOPE', (estado, cara)
    assert cara['precioMaximo'] == 900000, cara
    # Justo en el tope sí entra: el límite es inclusivo.
    estado, justa = publicar(ANA, E2, 900000)
    assert estado == 201 and justa['precio'] == 900000, (estado, justa)
    print('  ajena → 403 · inexistente → 404 · repetida → 409 · sobre tope → 422 · en el tope → 201')


def evento_sin_reventa():
    titulo('CU-006F — el evento no permite reventa')
    comprador = alguien()
    entrada = comprar(comprador, GALA_PLATEA, 1)['entradas'][0]

    estado, r = publicar(comprador, entrada['id'], 100000)
    assert estado == 409 and r['codigo'] == 'CU-006F', (estado, r)
    assert sql(f"SELECT estado FROM entradas WHERE id='{entrada['id']}'") == 'VALIDA'
    print(f"  Gala Benéfica → CU-006F · la entrada sigue VALIDA")


def entrada_no_revendible():
    titulo('CU-006E — la entrada no está en un estado que admita reventa')
    comprador = alguien()
    compra = comprar(comprador, FEST_GENERAL, 2)
    usada, anulada = compra['entradas']

    pedir('POST', 'ingresos', PORTERO,
          {'eventoId': FEST, 'codigoQr': usada['codigoQr']}, roles=('Personal',))
    estado, r = publicar(comprador, usada['id'], 200000)
    assert estado == 409 and r['codigo'] == 'CU-006E', (estado, r)
    assert 'USADA' in str(r), r

    sql(f"UPDATE entradas SET estado='ANULADA' WHERE id='{anulada['id']}'")
    estado, r2 = publicar(comprador, anulada['id'], 200000)
    assert estado == 409 and r2['codigo'] == 'CU-006E', (estado, r2)
    print('  USADA y ANULADA → CU-006E')


def ventana_cerrada():
    titulo('CU-006D — la ventana de reventa ya se cerró')
    comprador = alguien()
    # El Stand-up está a 4 días, así que su ventana sigue abierta. La ventana
    # cierra cuando el evento empieza (`REVENTA_MARGEN_CIERRE_MINUTOS` es 0),
    # así que se adelanta el evento a hace un minuto: es el estado que el
    # servicio se encontraría con el telón ya levantado.
    entrada = comprar(comprador, STANDUP_GENERAL, 1)['entradas'][0]
    evento = sql(f"SELECT evento_id FROM entradas WHERE id='{entrada['id']}'")
    original = sql(f"SELECT fecha_inicio FROM eventos_referencia WHERE evento_id='{evento}'")
    sql(f"UPDATE eventos_referencia SET fecha_inicio = now() - interval '1 minute' "
        f"WHERE evento_id='{evento}'")
    try:
        estado, r = publicar(comprador, entrada['id'], 50000)
        assert estado == 409 and r['codigo'] == 'CU-006D', (estado, r)

        # Y el veredicto del paso 1 dice lo mismo, sin tener que intentarlo.
        _, mias = pedir('GET', 'reventa/mis-entradas', comprador)
        propia = next(e for e in mias if e['id'] == entrada['id'])
        assert propia['puedePublicarse'] is False and propia['motivoBloqueo'] == 'CU-006D', propia
    finally:
        sql(f"UPDATE eventos_referencia SET fecha_inicio = '{original}' WHERE evento_id='{evento}'")
    print('  evento ya empezado → CU-006D, tanto al publicar como en el veredicto')


def consultar_el_mercado():
    titulo('Paso 5 — el comprador consulta el mercado')
    comprador = alguien()
    estado, r = pedir('GET', 'reventa/publicaciones', comprador)

    assert estado == 200, (estado, r)
    assert r['total'] >= 2 and r['limite'] == 20 and r['desplazamiento'] == 0
    una = r['publicaciones'][0]
    assert una['eventoNombre'] and una['lugar'] and una['ciudad'] and una['localidadNombre']
    assert una['precio'] and una['precioOriginal']
    assert una['estado'] == 'ACTIVA'
    assert una['esPropia'] is False

    # Lo que NO viaja: la identidad del vendedor. Un comprador no tiene por qué
    # saber de quién es la entrada.
    assert 'vendedorId' not in una, una
    print(f"  {r['total']} publicaciones · con evento, lugar y precio · sin vendedorId")


def el_mercado_no_muestra_lo_propio():
    titulo('Paso 5 — nadie se compra su propia entrada')
    _, deAna = pedir('GET', 'reventa/publicaciones', ANA)
    _, deOtro = pedir('GET', 'reventa/publicaciones', alguien())

    suyas = {p['id'] for p in deAna['publicaciones']}
    todas = {p['id'] for p in deOtro['publicaciones']}
    assert suyas < todas, 'Ana no debería ver las suyas y el resto sí'
    assert all(p['esPropia'] is False for p in deAna['publicaciones'])
    print(f"  otro ve {len(todas)} · Ana ve {len(suyas)}, sin las que ella publicó")


def filtrar_y_ordenar_el_mercado():
    titulo('Paso 5 — filtrar por evento y ordenar')
    comprador = alguien()
    # Bruno y Carla publican del mismo evento, a precios distintos.
    publicar(BRUNO, E3, 100000)
    publicar(CARLA, E4, 180000)

    _, rock = pedir('GET', f'reventa/publicaciones?eventoId={sql(f"SELECT evento_id FROM entradas WHERE id=\'{E3}\'")}',
                    comprador)
    assert rock['total'] == 2, rock
    assert all(p['eventoNombre'] == 'Noche de Rock Nacional' for p in rock['publicaciones'])

    _, barato = pedir('GET', 'reventa/publicaciones?orden=precio_asc&limite=100', comprador)
    precios = [p['precio'] for p in barato['publicaciones']]
    assert precios == sorted(precios), precios

    _, caro = pedir('GET', 'reventa/publicaciones?orden=precio_desc&limite=100', comprador)
    assert [p['precio'] for p in caro['publicaciones']] == sorted(precios, reverse=True)

    _, proximo = pedir('GET', 'reventa/publicaciones?orden=evento_proximo&limite=100', comprador)
    fechas = [p['fechaEvento'] for p in proximo['publicaciones']]
    assert fechas == sorted(fechas), fechas

    _, recientes = pedir('GET', 'reventa/publicaciones?orden=recientes&limite=100', comprador)
    publicadas = [p['fechaPublicacion'] for p in recientes['publicaciones']]
    assert publicadas == sorted(publicadas, reverse=True), publicadas

    # Paginado sin solapes, como la cartelera.
    _, p1 = pedir('GET', 'reventa/publicaciones?limite=2&desplazamiento=0', comprador)
    _, p2 = pedir('GET', 'reventa/publicaciones?limite=2&desplazamiento=2', comprador)
    assert not {p['id'] for p in p1['publicaciones']} & {p['id'] for p in p2['publicaciones']}

    # Un filtro que no vale: 400, no un listado equivocado.
    for consulta in ('eventoId=no-uuid', 'orden=barato', 'limite=0', 'limite=101', 'desplazamiento=-1'):
        estado, _ = pedir('GET', f'reventa/publicaciones?{consulta}', comprador)
        assert estado == 400, f'"{consulta}" debería ser 400 y fue {estado}'
    print(f"  4 órdenes · filtro por evento ({rock['total']}) · paginado sin solapes · 5 filtros malos → 400")


def detalle_de_una_publicacion():
    titulo('Paso 5 — el detalle de una publicación, incluso si ya no está activa')
    vendedor, comprador = alguien(), alguien()
    entrada = comprar(vendedor, SINFONICA_LUNETA, 1)['entradas'][0]
    _, pub = publicar(vendedor, entrada['id'], 80000)

    estado, r = pedir('GET', f"reventa/publicaciones/{pub['id']}", comprador)
    assert estado == 200, (estado, r)
    assert r['id'] == pub['id'] and r['precio'] == 80000
    assert r['esPropia'] is False
    # Para el vendedor, la misma publicación sí es suya.
    _, suya = pedir('GET', f"reventa/publicaciones/{pub['id']}", vendedor)
    assert suya['esPropia'] is True, suya

    # Y aquí sí salen las que ya no están activas, con su estado: si el
    # comprador tenía la pantalla abierta, "ya se vendió" es mejor respuesta
    # que un 404 que parece un fallo de la app.
    pedir('DELETE', f"reventa/publicaciones/{pub['id']}", vendedor)
    estado, retirada = pedir('GET', f"reventa/publicaciones/{pub['id']}", comprador)
    assert estado == 200 and retirada['estado'] == 'RETIRADA', (estado, retirada)
    _, mercado = pedir('GET', 'reventa/publicaciones?limite=100', comprador)
    assert pub['id'] not in {x['id'] for x in mercado['publicaciones']}, \
        'el listado sí la esconde; solo el detalle la sigue mostrando'

    estado, fantasma = pedir('GET', f'reventa/publicaciones/{uuid.uuid4()}', comprador)
    assert estado == 404 and fantasma['codigo'] == 'PUBLICACION_NO_ENCONTRADA', (estado, fantasma)
    print('  detalle visible · esPropia según quién pregunta · retirada visible en detalle, no en el listado')


def cambiar_precio():
    titulo('CU-006A — el vendedor cambia el precio antes de que la compren')
    comprador = alguien()
    entrada = comprar(comprador, SINFONICA_LUNETA, 1)['entradas'][0]
    _, pub = publicar(comprador, entrada['id'], 80000)

    estado, r = pedir('PATCH', f"reventa/publicaciones/{pub['id']}", comprador, {'precio': 65000})
    assert estado == 200, (estado, r)
    assert r['precio'] == 65000 and r['estado'] == 'ACTIVA'
    assert sql(f"SELECT precio FROM publicaciones_reventa WHERE id='{pub['id']}'") == '65000.00'

    # El tope se revalida al cambiar: si no, bastaría publicar barato y subirlo
    # después para saltárselo.
    estado, cara = pedir('PATCH', f"reventa/publicaciones/{pub['id']}", comprador, {'precio': 999999})
    assert estado == 422 and cara['codigo'] == 'PRECIO_SOBRE_TOPE', (estado, cara)
    assert sql(f"SELECT precio FROM publicaciones_reventa WHERE id='{pub['id']}'") == '65000.00'

    # Y no es de quien lo intente.
    estado, ajena = pedir('PATCH', f"reventa/publicaciones/{pub['id']}", alguien(), {'precio': 1000})
    assert estado == 403 and ajena['codigo'] == 'NO_ES_PROPIETARIO', (estado, ajena)

    # Precios que el DTO no admite.
    for precio in (0, -1, 1.005):
        estado, _ = pedir('PATCH', f"reventa/publicaciones/{pub['id']}", comprador, {'precio': precio})
        assert estado == 400, (precio, estado)
    print('  80000 → 65000 · sobre tope → 422 sin tocar el precio · ajena → 403 · 3 precios inválidos → 400')
    return comprador, pub


def retirar_del_mercado():
    titulo('CU-006B — el vendedor retira la entrada del mercado')
    comprador = alguien()
    entrada = comprar(comprador, SINFONICA_LUNETA, 1)['entradas'][0]
    _, pub = publicar(comprador, entrada['id'], 80000)
    assert sql(f"SELECT estado FROM entradas WHERE id='{entrada['id']}'") == 'EN_REVENTA'

    estado, r = pedir('DELETE', f"reventa/publicaciones/{pub['id']}", comprador)
    assert estado == 200, (estado, r)
    assert r['estado'] == 'RETIRADA'

    # La entrada vuelve a ser suya sin más: retirar no transfiere nada, así que
    # no genera un QR nuevo ni una fila de historial.
    assert sql(f"SELECT estado FROM entradas WHERE id='{entrada['id']}'") == 'VALIDA'
    assert sql(f"SELECT count(*) FROM historial_propietarios WHERE entrada_id='{entrada['id']}'") == '1'
    assert sql(f"SELECT codigo_qr FROM entradas WHERE id='{entrada['id']}'") == entrada['codigoQr']

    # Ya no está en el mercado.
    _, mercado = pedir('GET', 'reventa/publicaciones?limite=100', alguien())
    assert pub['id'] not in {p['id'] for p in mercado['publicaciones']}

    # Y retirarla dos veces no vale: ya no está activa.
    estado, otra_vez = pedir('DELETE', f"reventa/publicaciones/{pub['id']}", comprador)
    assert estado == 409 and otra_vez['codigo'] == 'PUBLICACION_NO_ACTIVA', (estado, otra_vez)
    assert otra_vez['estado'] == 'RETIRADA', otra_vez

    # Cambiar el precio de una retirada tampoco.
    estado, precio = pedir('PATCH', f"reventa/publicaciones/{pub['id']}", comprador, {'precio': 1000})
    assert estado == 409 and precio['codigo'] == 'PUBLICACION_NO_ACTIVA', (estado, precio)

    # Y se puede volver a publicar, que es el sentido de retirarla.
    estado, otra = publicar(comprador, entrada['id'], 90000)
    assert estado == 201, (estado, otra)
    print('  retirada · entrada VALIDA con su QR de siempre · sin historial nuevo · republicable')


def no_se_retira_con_un_cobro_en_vuelo():
    titulo('CU-006H — no se puede retirar mientras alguien la está pagando')
    vendedor, comprador = alguien(), alguien()
    entrada = comprar(vendedor, SINFONICA_LUNETA, 1)['entradas'][0]
    _, pub = publicar(vendedor, entrada['id'], 80000)

    # El comprador abre el checkout: eso toma el bloqueo de Redis.
    estado, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)
    assert estado == 201, (estado, ck)

    estado, r = pedir('DELETE', f"reventa/publicaciones/{pub['id']}", vendedor)
    assert estado == 409 and r['codigo'] == 'CU-006H', (estado, r)
    assert sql(f"SELECT estado FROM publicaciones_reventa WHERE id='{pub['id']}'") == 'ACTIVA'

    # Cuando el comprador abandona, el vendedor ya puede retirarla.
    estado, _ = pedir('DELETE', f"reventa/checkout/{ck['id']}", comprador)
    assert estado == 200, estado
    estado, retirada = pedir('DELETE', f"reventa/publicaciones/{pub['id']}", vendedor)
    assert estado == 200 and retirada['estado'] == 'RETIRADA', (estado, retirada)
    print('  con checkout abierto → CU-006H · al abandonarlo, se retira sin problema')


def detalle_del_checkout():
    titulo('Pasos 6-8 — consultar el checkout abierto')
    vendedor, comprador = alguien(), alguien()
    entrada = comprar(vendedor, SINFONICA_LUNETA, 1)['entradas'][0]
    _, pub = publicar(vendedor, entrada['id'], 80000)
    _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)

    estado, r = pedir('GET', f"reventa/checkout/{ck['id']}", comprador)
    assert estado == 200, (estado, r)
    assert r['id'] == ck['id'] and r['precio'] == 80000
    # El reparto cuadra: precio = comisión + neto del vendedor.
    assert r['comision'] + r['netoVendedor'] == r['precio'], r
    assert r['segundosRestantes'] > 0 and r['reservaHasta']
    assert r['publicacion']['id'] == pub['id']

    # El checkout de otro no se consulta.
    estado, ajeno = pedir('GET', f"reventa/checkout/{ck['id']}", alguien())
    assert estado in (403, 404), estado
    print(f"  {r['precio']} = {r['comision']} + {r['netoVendedor']} · quedan {r['segundosRestantes']} s")


def pagar_un_checkout_caducado():
    titulo('Pasos 6-8 — pagar cuando la reserva ya caducó')
    vendedor, comprador = alguien(), alguien()
    entrada = comprar(vendedor, SINFONICA_LUNETA, 1)['entradas'][0]
    _, pub = publicar(vendedor, entrada['id'], 80000)
    _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)

    caducar_bloqueo(pub['id'])

    estado, r = pedir('POST', f"reventa/checkout/{ck['id']}/pagar", comprador,
                      {'metodoPago': 'TARJETA', 'token': 'tok_ok'})
    assert estado == 409 and r['codigo'] == 'CHECKOUT_NO_VIGENTE', (estado, r)
    assert 'caducó' in r['mensaje'], r['mensaje']

    # Lo importante: no se llegó a cobrar. La publicación sigue en el mercado
    # y la entrada no cambió de dueño.
    assert sql(f"SELECT propietario_id FROM entradas WHERE id='{entrada['id']}'") == vendedor
    assert sql(f"SELECT estado FROM publicaciones_reventa WHERE id='{pub['id']}'") == 'ACTIVA'
    assert sql(f"SELECT referencia_pasarela FROM transacciones_reventa WHERE id='{ck['id']}'") == ''

    # Y otra persona puede reservarla, que es lo que la reserva caducada libera.
    estado, otro = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", alguien())
    assert estado == 201, (estado, otro)
    print('  reserva caducada → CHECKOUT_NO_VIGENTE sin cobrar · otra persona ya puede reservarla')


def hace_falta_sesion():
    titulo('RNF-06 — todo el mercado secundario exige sesión')
    for metodo, ruta in (('GET', 'reventa/mis-entradas'),
                         ('GET', 'reventa/publicaciones'),
                         ('POST', 'reventa/publicaciones')):
        estado, _ = pedir(metodo, ruta, None, {} if metodo == 'POST' else None)
        assert estado == 401, (ruta, estado)
    print('  3 rutas sin token → 401')


if __name__ == '__main__':
    resembrar()
    sys.exit(correr([
        mis_entradas_del_vendedor,
        el_veredicto_explica_por_que_no,
        publicar_camino_feliz,
        publicar_lo_que_no_se_puede,
        evento_sin_reventa,
        entrada_no_revendible,
        ventana_cerrada,
        consultar_el_mercado,
        el_mercado_no_muestra_lo_propio,
        filtrar_y_ordenar_el_mercado,
        detalle_de_una_publicacion,
        cambiar_precio,
        retirar_del_mercado,
        no_se_retira_con_un_cobro_en_vuelo,
        detalle_del_checkout,
        pagar_un_checkout_caducado,
        hace_falta_sesion,
    ]))
