"""
ASR-01 — la cola contiene el pico de una apertura de venta.

Es la prueba que justifica el servicio: con más compradores de los que Ventas
aguanta a la vez, la cola deja pasar exactamente el aforo y ordena al resto.
"""
import subprocess
import sys
import uuid

from cola import EVENTO, correr, pedir, titulo

OBSERVADOR = 'a0000001-0000-4000-8000-000000000001'


def limpiar_fila():
    """La fila vive en Redis y sobrevive entre corridas: se vacía antes de medir."""
    subprocess.run(
        ['docker', 'exec', 'hexacore-redis', 'sh', '-c',
         f"redis-cli --scan --pattern 'cola:{EVENTO}:*' | xargs -r redis-cli del"],
        capture_output=True, check=False)


def usuario():
    """Un comprador distinto cada vez: la fila va por usuario, no por petición."""
    return str(uuid.uuid4())


def admite_y_entrega_token():
    titulo('Con sitio libre, se admite y se entrega token')
    estado, r = pedir('POST', f'cola/eventos/{EVENTO}/turnos', usuario())
    assert estado in (200, 201), (estado, r)
    assert r['estado'] == 'ADMITIDO', r
    assert r['token'], r
    assert r['expiraEn'], r
    print(f"  turno entregado, caduca {r['expiraEn']}")


def exige_sesion():
    titulo('RNF-06 — pedir turno sin sesión no vale')
    estado, _ = pedir('POST', f'cola/eventos/{EVENTO}/turnos')
    assert estado == 401, estado
    print('  sin token → 401')


def el_mismo_usuario_no_ocupa_dos_sitios():
    titulo('Pedir turno dos veces NO da dos sitios')
    quien = usuario()
    _, primera = pedir('POST', f'cola/eventos/{EVENTO}/turnos', quien)
    _, segunda = pedir('POST', f'cola/eventos/{EVENTO}/turnos', quien)
    assert primera['token'] == segunda['token'], (primera, segunda)
    print('  mismo token: un comprador, un sitio')


def el_pico_se_contiene():
    titulo('El pico se contiene: nunca entran más que el aforo')
    _, antes = pedir('GET', f'cola/eventos/{EVENTO}', OBSERVADOR)
    aforo_libre = max(0, 25 - antes['comprando'])

    # Bastantes más de los que caben.
    turnos = [pedir('POST', f'cola/eventos/{EVENTO}/turnos', usuario())[1] for _ in range(aforo_libre + 20)]
    admitidos = [t for t in turnos if t['estado'] == 'ADMITIDO']
    esperando = [t for t in turnos if t['estado'] == 'EN_ESPERA']

    assert len(admitidos) == aforo_libre, (len(admitidos), aforo_libre)
    assert len(esperando) == 20, len(esperando)
    # Y los que esperan saben dónde están y cuándo volver.
    assert all(t['posicion'] >= 1 for t in esperando), esperando[:3]
    assert all(t['reintentarEnSegundos'] >= 1 for t in esperando), esperando[:3]

    _, despues = pedir('GET', f'cola/eventos/{EVENTO}', OBSERVADOR)
    assert despues['comprando'] == 25, despues
    print(f"  {len(admitidos)} admitidos hasta llenar el aforo de 25 · {len(esperando)} en fila ordenada")


def la_fila_respeta_el_orden_de_llegada():
    titulo('Volver a preguntar no manda al final de la fila')
    primero, segundo = usuario(), usuario()
    _, a = pedir('POST', f'cola/eventos/{EVENTO}/turnos', primero)
    _, b = pedir('POST', f'cola/eventos/{EVENTO}/turnos', segundo)
    assert a['estado'] == 'EN_ESPERA' and b['estado'] == 'EN_ESPERA', (a, b)
    assert a['posicion'] < b['posicion'], (a, b)

    _, a2 = pedir('POST', f'cola/eventos/{EVENTO}/turnos', primero)
    assert a2['posicion'] == a['posicion'], (a, a2)
    print(f"  el primero sigue en el puesto {a2['posicion']} tras volver a preguntar")


def la_ruta_interna_no_se_expone():
    titulo('Gastar el turno es cosa del gateway, no del cliente')
    # Por el puerto del servicio sí existe, pero exige sesión; lo que no existe
    # es por el gateway, y eso se comprueba en la suite del gateway.
    estado, _ = pedir('DELETE', f'interno/cola/turnos/{uuid.uuid4()}')
    assert estado == 401, estado
    print('  sin token → 401 también en la ruta interna')


if __name__ == '__main__':
    try:
        limpiar_fila()
        correr([
            exige_sesion,
            admite_y_entrega_token,
            el_mismo_usuario_no_ocupa_dos_sitios,
            el_pico_se_contiene,
            la_fila_respeta_el_orden_de_llegada,
            la_ruta_interna_no_se_expone,
        ])
    except AssertionError as e:
        print(f'\nFALLO: {e}', file=sys.stderr)
        sys.exit(1)
    print('\nTodo bien.')
