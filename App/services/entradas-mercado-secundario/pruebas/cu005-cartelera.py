#!/usr/bin/env python3
"""
CU-005 — Consultar la cartelera de eventos, de extremo a extremo.

Recorre los pasos 1-8 de la ficha y sus caminos alternos:

    CU-005A   sin filtros, el listado va por fecha
    CU-005C   ningún evento encontrado

y lo que la ficha exige sin darle letra: que la cartelera sea **pública**
(única excepción a RNF-06 en este servicio, DECISIONES.md §12), que un
borrador o un cancelado no se vean, y que un filtro inválido se responda con
un 400 y no con un listado equivocado.

Necesita la infraestructura y el servicio levantados:

    cd ../../infra && ./iniciar.sh
    python3 pruebas/cu005-cartelera.py

Resiembra al empezar, así que no depende del estado que dejen otras pruebas.
"""

import sys

from venta import (
    CAFE, CLASICO, FEST, GALA, JAZZ, MAGO, ROCK, SALSA, STANDUP, VERANO, VOLEIBOL,
    correr, pedir, resembrar, titulo,
)


def ids(cartelera):
    return [e['id'] for e in cartelera['eventos']]


def listado_por_defecto():
    titulo('Pasos 1-5 · CU-005A — sin filtros, los próximos por fecha')
    estado, r = pedir('GET', 'cartelera?limite=100')

    assert estado == 200, (estado, r)
    assert r['mensaje'] is None
    fechas = [e['fechaInicio'] for e in r['eventos']]
    assert fechas == sorted(fechas), 'CU-005A: el orden por defecto es por fecha'
    assert all(e['pasado'] is False for e in r['eventos']), 'un evento ya celebrado no va en el listado'
    print(f"  {r['total']} eventos, ordenados por fecha · el primero es {r['eventos'][0]['nombre']}")


def lo_que_no_debe_verse():
    titulo('Pasos 1-5 — borrador, cancelado y pasado quedan fuera')
    _, r = pedir('GET', 'cartelera?limite=100')
    visibles = ids(r)

    assert MAGO not in visibles, 'un evento en BORRADOR no se anuncia'
    assert VOLEIBOL not in visibles, 'un evento CANCELADO no se anuncia'
    assert VERANO not in visibles, 'un evento ya celebrado no va por defecto'

    # Y su detalle responde 404, no un 200 con datos a medias.
    for evento, que in ((MAGO, 'borrador'), (VOLEIBOL, 'cancelado')):
        estado, detalle = pedir('GET', f'cartelera/{evento}')
        assert estado == 404 and detalle['codigo'] == 'EVENTO_NO_ENCONTRADO', (que, estado, detalle)
    print('  borrador y cancelado: fuera del listado y 404 en el detalle')


def incluir_pasados():
    titulo('Paso 2 — `incluirPasados` sí trae los ya celebrados')
    _, r = pedir('GET', 'cartelera?incluirPasados=true&limite=100')

    assert VERANO in ids(r), 'con incluirPasados debería aparecer el Festival de Verano'
    pasado = next(e for e in r['eventos'] if e['id'] == VERANO)
    assert pasado['pasado'] is True
    # "false" es texto, y en JavaScript cualquier texto no vacío es verdadero:
    # el DTO lo convierte a propósito para que esto no cuele.
    _, sin = pedir('GET', 'cartelera?incluirPasados=false&limite=100')
    assert VERANO not in ids(sin), '"false" debe entenderse como falso, no como "hay texto"'
    print('  incluirPasados=true lo trae · =false no · marcado pasado=True')


def filtros():
    titulo('Paso 2 — filtrar por categoría, ciudad, artista y fecha')

    _, categoria = pedir('GET', 'cartelera?categoria=Teatro&limite=100')
    assert categoria['total'] > 0
    assert all(e['categoria'] == 'Teatro' for e in categoria['eventos'])

    # Sin distinguir mayúsculas, que es lo que promete el DTO.
    _, minusculas = pedir('GET', 'cartelera?categoria=teatro&limite=100')
    assert ids(minusculas) == ids(categoria), 'el filtro no debe distinguir mayúsculas'

    _, ciudad = pedir('GET', 'cartelera?ciudad=Medellín&limite=100')
    assert ciudad['total'] > 0
    assert all(e['ciudad'] == 'Medellín' for e in ciudad['eventos'])

    # Coincidencia parcial: "niche" está dentro de "Grupo Niche".
    _, artista = pedir('GET', 'cartelera?artista=niche&limite=100')
    assert ids(artista) == [SALSA], (ids(artista),)

    # Un evento sin artista nunca debe colarse en un filtro por artista.
    _, ninguno = pedir('GET', 'cartelera?artista=zzzz&limite=100')
    assert ninguno['total'] == 0

    _, combinado = pedir('GET', 'cartelera?ciudad=Medellín&categoria=Deportes&limite=100')
    assert ids(combinado) == [CLASICO], (ids(combinado),)

    print(f"  categoría {categoria['total']} · ciudad {ciudad['total']} · artista=niche → Salsa al Parque")


def filtro_por_rango():
    titulo('Paso 2 — rango de fechas, y el rango imposible')
    # CAFE está a 9 días y JAZZ a menos de uno: un rango de los próximos 20
    # días los trae a los dos y deja fuera el FEST, que está a 90.
    _, r = pedir('GET', 'cartelera?limite=100')
    hasta = sorted(e['fechaInicio'] for e in r['eventos'])[2][:10]
    _, rango = pedir('GET', f'cartelera?hasta={hasta}&limite=100')

    assert rango['total'] >= 1
    assert all(e['fechaInicio'][:10] <= hasta for e in rango['eventos'])
    assert FEST not in ids(rango), 'el FEST está a 90 días: fuera de este rango'

    # Y el que no puede existir: "desde" después de "hasta".
    estado, error = pedir('GET', 'cartelera?desde=2026-12-01&hasta=2026-01-01')
    assert estado == 400 and error['codigo'] == 'RANGO_FECHAS_INVALIDO', (estado, error)
    print(f"  hasta={hasta} → {rango['total']} eventos · desde>hasta → 400 RANGO_FECHAS_INVALIDO")


def filtros_invalidos():
    titulo('Paso 2 — un filtro que no valida se responde 400')
    for consulta in ('artista=a',                # MinLength(2)
                     'limite=0',                 # Min(1)
                     'limite=500',               # Max(100)
                     'desplazamiento=-1',        # Min(0)
                     'orden=precio',             # fuera del enum
                     'incluirPasados=quizas',    # ni true ni false
                     'desde=el-lunes'):          # no es ISO 8601
        estado, _ = pedir('GET', f'cartelera?{consulta}')
        assert estado == 400, f'"{consulta}" debería ser 400 y fue {estado}'
    print('  7 filtros inválidos, 7 respuestas 400')


def sin_resultados():
    titulo('CU-005C — ningún evento encontrado')
    estado, r = pedir('GET', 'cartelera?ciudad=Leticia')

    assert estado == 200, 'no encontrar nada no es un error'
    assert r['total'] == 0 and r['eventos'] == []
    assert r['mensaje'] == 'Ningún evento encontrado', r['mensaje']
    print(f"  HTTP 200 · total 0 · mensaje: {r['mensaje']!r}")


def paginado():
    titulo('Paso 5 — el catálogo se pagina sin repetir ni saltarse nada')
    _, completo = pedir('GET', 'cartelera?limite=100')
    _, primera = pedir('GET', 'cartelera?limite=3&desplazamiento=0')
    _, segunda = pedir('GET', 'cartelera?limite=3&desplazamiento=3')

    assert primera['total'] == segunda['total'] == completo['total'], 'el total no depende de la página'
    assert len(primera['eventos']) == 3
    assert ids(primera) + ids(segunda) == ids(completo)[:6], 'las páginas deben encajar con el listado entero'
    assert not set(ids(primera)) & set(ids(segunda)), 'ningún evento en dos páginas'
    print(f"  {completo['total']} eventos · páginas de 3 sin solapes")


def orden_por_relevancia():
    titulo('Paso 4 — orden por relevancia: los que más se venden, primero')
    _, r = pedir('GET', 'cartelera?orden=relevancia&limite=100')

    assert r['total'] > 0
    # Salsa al Parque tiene sus dos localidades vendidas por completo: es el
    # de mayor ocupación, y por eso encabeza. El Clásico (19 100 de 20 000)
    # va detrás del Jazz (97 de 100) por el mismo criterio.
    assert ids(r)[0] == SALSA, (ids(r)[:3],)
    assert ids(r).index(JAZZ) < ids(r).index(CLASICO), (ids(r)[:4],)
    _, fecha = pedir('GET', 'cartelera?orden=fecha&limite=100')
    assert ids(r) != ids(fecha), 'relevancia y fecha no deberían dar el mismo orden'
    print(f"  el primero por relevancia es {r['eventos'][0]['nombre']}")


def agotado_y_precio_desde():
    titulo('Paso 5 — "agotado" y el precio más bajo con cupo')
    _, r = pedir('GET', 'cartelera?limite=100')
    porid = {e['id']: e for e in r['eventos']}

    # Salsa al Parque tiene sus dos localidades vendidas por completo.
    assert porid[SALSA]['agotado'] is True, 'Salsa al Parque está agotado en la semilla'
    assert porid[FEST]['agotado'] is False

    # El Clásico tiene la Norte (55 000) agotada y la Occidental (130 000) con
    # cupo: "precioDesde" debe ser el más bajo **que se puede comprar**.
    assert porid[CLASICO]['precioDesde'] == 130000, porid[CLASICO]['precioDesde']
    print(f"  Salsa agotado · Clásico desde {porid[CLASICO]['precioDesde']} (la Norte, más barata, ya no está)")


def detalle_del_evento():
    titulo('Pasos 6-8 — detalle con horarios, localidades, precios y disponibilidad')
    estado, r = pedir('GET', f'cartelera/{FEST}')

    assert estado == 200, (estado, r)
    assert r['id'] == FEST and r['nombre'] == 'HEXACORE Fest 2026'
    assert r['fechaFin'] is not None, 'el horario del paso 8 incluye el fin'
    assert r['descripcion'] and r['lugar'] == 'Movistar Arena'
    assert len(r['localidades']) == 3

    # Vienen ordenadas y cada una dice su cupo.
    general = next(l for l in r['localidades'] if l['nombre'] == 'General')
    palco = next(l for l in r['localidades'] if l['nombre'] == 'Palco VIP')
    assert general['precio'] == 180000 and general['disponibles'] == 800
    assert palco['disponibles'] == 37, palco['disponibles']
    assert r['disponiblesTotal'] == sum(l['disponibles'] for l in r['localidades'])
    assert r['precioDesde'] == 180000
    print(f"  {len(r['localidades'])} localidades · {r['disponiblesTotal']} cupos · desde {r['precioDesde']}")

    # Y el agotado de verdad: todas sus localidades en cero.
    _, salsa = pedir('GET', f'cartelera/{SALSA}')
    assert salsa['agotado'] is True and salsa['disponiblesTotal'] == 0
    assert all(l['agotada'] for l in salsa['localidades'])
    print('  Salsa al Parque: agotado, 0 cupos, todas las localidades agotadas')


def detalle_invalido():
    titulo('Pasos 6-8 — un identificador que no es un evento')
    estado, _ = pedir('GET', 'cartelera/no-es-un-uuid')
    assert estado == 400, estado

    estado, r = pedir('GET', 'cartelera/e0000099-0000-4000-8000-000000000099')
    assert estado == 404 and r['codigo'] == 'EVENTO_NO_ENCONTRADO', (estado, r)
    print('  uuid mal formado → 400 · uuid inexistente → 404')


def valores_de_los_filtros():
    titulo('Paso 2 — los desplegables se llenan del propio catálogo')
    estado, r = pedir('GET', 'cartelera/filtros')

    assert estado == 200, (estado, r)
    assert 'Bogotá' in r['ciudades'] and 'Medellín' in r['ciudades']
    assert 'Conciertos' in r['categorias'] and 'Teatro' in r['categorias']
    assert r['ciudades'] == sorted(r['ciudades']) and r['categorias'] == sorted(r['categorias'])
    # Solo de eventos que se listan: el musical en borrador no aporta su
    # categoría, y la de un evento ya celebrado tampoco.
    _, listado = pedir('GET', 'cartelera?limite=100')
    categorias_visibles = {e['categoria'] for e in listado['eventos']}
    assert set(r['categorias']) == categorias_visibles, (r['categorias'], categorias_visibles)
    print(f"  {len(r['categorias'])} categorías · {len(r['ciudades'])} ciudades, solo de lo que se anuncia")


def es_publica():
    titulo('RNF-06 (excepción, DECISIONES.md §12) — la cartelera se ve sin sesión')
    # `pedir` sin usuario no manda cabecera Authorization.
    for ruta in ('cartelera', 'cartelera/filtros', f'cartelera/{FEST}'):
        estado, _ = pedir('GET', ruta)
        assert estado == 200, (ruta, estado)

    # Y el resto del servicio sí la exige: la excepción es solo la cartelera.
    for ruta in ('compras', 'reventa/publicaciones'):
        estado, _ = pedir('GET', ruta)
        assert estado == 401, (ruta, estado)
    print('  3 rutas de cartelera sin token → 200 · compras y reventa → 401')


def cache_del_navegador():
    titulo('ASR — la cartelera se puede guardar en caché unos segundos')
    import urllib.request
    with urllib.request.urlopen(f'http://localhost:3001/api/v1/cartelera', timeout=30) as r:
        listado = r.headers.get('Cache-Control')
    with urllib.request.urlopen(f'http://localhost:3001/api/v1/cartelera/{FEST}', timeout=30) as r:
        detalle = r.headers.get('Cache-Control')

    assert listado == 'public, max-age=30', listado
    # El detalle trae la disponibilidad, así que se guarda menos tiempo.
    assert detalle == 'public, max-age=10', detalle
    print(f'  listado: {listado} · detalle: {detalle}')


if __name__ == '__main__':
    resembrar()
    sys.exit(correr([
        listado_por_defecto,
        lo_que_no_debe_verse,
        incluir_pasados,
        filtros,
        filtro_por_rango,
        filtros_invalidos,
        sin_resultados,
        paginado,
        orden_por_relevancia,
        agotado_y_precio_desde,
        detalle_del_evento,
        detalle_invalido,
        valores_de_los_filtros,
        es_publica,
        cache_del_navegador,
    ]))
