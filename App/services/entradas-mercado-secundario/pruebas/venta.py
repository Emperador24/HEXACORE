"""
Lo que comparten las suites de la venta primaria (CU-001 a CU-005).

Las cuatro suites hablan con el mismo servicio por HTTP, resiembran igual y
consultan la misma base para comprobar post-condiciones, así que eso vive aquí
y no copiado cuatro veces. Los identificadores son los de
`src/persistencia/semillas/datos-demo.ts`: fijos a propósito, para poder
escribir una petición sin consultar antes la base.

Lo que NO está aquí son los asertos: cada suite dice qué espera de su caso de
uso, y eso es justo lo que hay que poder leer sin saltar de archivo.
"""

import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request

from identidad import cabeceras

API = 'http://localhost:3001/api/v1'

# --- Usuarios de la semilla --------------------------------------------------

ANA = 'a0000001-0000-4000-8000-000000000001'
BRUNO = 'a0000002-0000-4000-8000-000000000002'
CARLA = 'a0000003-0000-4000-8000-000000000003'
# El personal de puerta del CU-002 no es de la semilla: cualquier UUID sirve,
# porque quien valida el token es la clave pública, no una tabla de este
# servicio (los usuarios viven en Administración).
PORTERO = 'c0000001-0000-4000-8000-0000000000f1'

# --- Eventos -----------------------------------------------------------------

FEST = 'e0000001-0000-4000-8000-000000000001'        # a 90 días
ROCK = 'e0000002-0000-4000-8000-000000000002'        # a 45 días
GALA = 'e0000003-0000-4000-8000-000000000003'        # a 30 días · aforo lleno (CU-002B)
VERANO = 'e0000004-0000-4000-8000-000000000004'      # ya se celebró
FERIA = 'e0000005-0000-4000-8000-000000000005'       # a 16 días
SINFONICA = 'e0000006-0000-4000-8000-000000000006'   # a 50 días
CLASICO = 'e0000007-0000-4000-8000-000000000007'     # a 36 días
SALSA = 'e0000008-0000-4000-8000-000000000008'       # a 63 días · agotado
CAFE = 'e0000009-0000-4000-8000-000000000009'        # a 9 días
MAGO = 'e000000a-0000-4000-8000-00000000000a'        # BORRADOR: no debe verse
VOLEIBOL = 'e000000b-0000-4000-8000-00000000000b'    # CANCELADO: no debe verse
STANDUP = 'e000000c-0000-4000-8000-00000000000c'     # a 4 días: cancelación PARCIAL
JAZZ = 'e000000d-0000-4000-8000-00000000000d'        # a 0,8 días: fuera de plazo

# --- Localidades -------------------------------------------------------------

FEST_GENERAL = '10000001-0000-4000-8000-000000000001'    # 180 000 · 800 libres
FEST_PLATEA = '10000001-0000-4000-8000-000000000003'     # 260 000
FEST_PALCO = '10000001-0000-4000-8000-000000000002'      # 420 000 · 37 libres
ROCK_GENERAL = '10000002-0000-4000-8000-000000000001'    # 95 000
ROCK_TRIBUNA = '10000002-0000-4000-8000-000000000002'    # 140 000
GALA_PLATEA = '10000003-0000-4000-8000-000000000001'     # 300 000
VERANO_GENERAL = '10000004-0000-4000-8000-000000000001'  # evento pasado
SINFONICA_LUNETA = '10000006-0000-4000-8000-000000000001'
CLASICO_NORTE = '10000007-0000-4000-8000-000000000001'   # agotada: 12 000/12 000
CAFE_GENERAL = '10000009-0000-4000-8000-000000000001'
MAGO_PLATEA = '1000000a-0000-4000-8000-000000000001'     # de un evento en borrador
STANDUP_GENERAL = '1000000c-0000-4000-8000-000000000001' # 70 000
JAZZ_TERRAZA = '1000000d-0000-4000-8000-000000000001'    # 150 000 · solo 3 libres

# Una localidad que no existe, para el 404.
LOCALIDAD_FANTASMA = '1f000000-0000-4000-8000-0000000000ff'


def pedir(metodo, ruta, usuario=None, cuerpo=None, espera=60, roles=('Cliente',)):
    """
    Una petición al servicio. Sin `usuario`, va sin cabecera de sesión.

    La ruta se escribe legible —`cartelera?ciudad=Medellín`— y se codifica
    aquí: una petición HTTP solo admite ASCII, y sin esto una tilde revienta
    en el cliente antes de llegar al servicio.
    """
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    encabezados = cabeceras(usuario, roles) if usuario else {'Content-Type': 'application/json'}
    destino = f'{API}/{urllib.parse.quote(ruta, safe="/?&=")}'
    req = urllib.request.Request(destino, data=datos, method=metodo, headers=encabezados)
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            cuerpo_respuesta = r.read()
            return r.status, (json.loads(cuerpo_respuesta) if cuerpo_respuesta else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def sql(consulta):
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
         '-d', 'entradas_mercado_secundario', '-tAc', consulta],
        capture_output=True, text=True).stdout.strip()


def resembrar():
    """Deja la base como la describe `datos-demo.ts`. Trunca antes de insertar."""
    subprocess.run(['npm', 'run', 'semilla'], capture_output=True, check=True)


def comprar(usuario, localidad, cantidad=1, token='tok_ok', cupon=None):
    """
    Una compra pagada, que es el punto de partida de casi todo: para cancelar
    (CU-003) hace falta una compra pagada, y para validar un QR (CU-002) hace
    falta una entrada emitida.
    """
    estado, compra = pedir('POST', 'compras', usuario,
                           {'localidadId': localidad, 'cantidad': cantidad})
    assert estado == 201, (estado, compra)
    if cupon:
        estado, compra = pedir('PUT', f"compras/{compra['id']}/cupon", usuario, {'codigo': cupon})
        assert estado == 200, (estado, compra)
    estado, pagada = pedir('POST', f"compras/{compra['id']}/pagar", usuario,
                           {'metodoPago': 'TARJETA', 'token': token})
    assert estado == 200, (estado, pagada)
    return pagada


def titulo(texto):
    print(f'\n### {texto}')


def correr(pasos):
    """
    Ejecuta los pasos en orden y falla a la primera. Devuelve el código de
    salida que espera `cobertura-integracion.sh`.
    """
    for paso in pasos:
        paso()
    print(f'\nTodo bien: {len(pasos)} bloques.')
    return 0
