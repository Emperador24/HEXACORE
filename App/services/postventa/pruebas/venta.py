"""
Lo que comparten las suites de integración de Postventa (CU-006).

Es una copia adaptada del mismo archivo en Ventas. Se copia y no se comparte
porque los dos servicios se despliegan por separado: una suite que importara
del árbol del otro no podría correrse sin tenerlo clonado al lado, y es
exactamente el acoplamiento que ADR-14 vino a quitar.

Lo que esta copia añade es **saber que ahora hay dos servicios y dos bases**:

- La API del CU-006 está en Postventa (`:3011`).
- La tabla `entradas` y la semilla son de Ventas (`:3001`).
- Las publicaciones y transacciones de reventa son de Postventa.

`sql()` enruta cada consulta a la base del servicio que es dueño de la tabla,
en vez de obligar a cada aserto a recordarlo.

Los identificadores son los de la semilla de Ventas
(`../entradas-mercado-secundario/src/persistencia/semillas/datos-demo.ts`):
fijos a propósito, para poder escribir una petición sin consultar antes.

Lo que NO está aquí son los asertos: cada suite dice qué espera de su caso de
uso, y eso es justo lo que hay que poder leer sin saltar de archivo.
"""

import json
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

from identidad import cabeceras

# El CU-006 lo sirve Postventa desde ADR-14.
API = 'http://localhost:3011/api/v1'
# Ventas: dueño de `entradas`. Las suites compran allí para tener algo que
# revender, que es la preparación de casi todo el CU-006.
API_VENTAS = 'http://localhost:3001/api/v1'
# Acceso QR: la puerta. Se usa como preparación —"esta entrada ya se usó"—
# para los caminos en que una entrada deja de ser revendible.
API_ACCESO = 'http://localhost:3010/api/v1'

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


def pedir(metodo, ruta, usuario=None, cuerpo=None, espera=60, roles=('Cliente',), base=None):
    """
    Una petición al servicio. Sin `usuario`, va sin cabecera de sesión.

    La ruta se escribe legible —`cartelera?ciudad=Medellín`— y se codifica
    aquí: una petición HTTP solo admite ASCII, y sin esto una tilde revienta
    en el cliente antes de llegar al servicio.
    """
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    encabezados = cabeceras(usuario, roles) if usuario else {'Content-Type': 'application/json'}
    destino = f'{base or API}/{urllib.parse.quote(ruta, safe="/?&=")}'
    req = urllib.request.Request(destino, data=datos, method=metodo, headers=encabezados)
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            cuerpo_respuesta = r.read()
            return r.status, (json.loads(cuerpo_respuesta) if cuerpo_respuesta else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


# Qué servicio es dueño de qué tabla. Es la consecuencia de ADR-14 escrita
# como dato: antes todas estaban en la misma base y `sql()` no tenía que
# elegir.
#
# `eventos_referencia` existe en las dos como proyección local. Las suites del
# CU-006 que la tocan lo hacen para cambiar la política de reventa de un
# evento, y eso lo lee Postventa, así que va a su copia.
BASE_VENTAS = 'entradas_mercado_secundario'
BASE_POSTVENTA = 'postventa'

_DUENO = {
    'entradas': BASE_VENTAS,
    'historial_propietarios': BASE_VENTAS,
    'compras': BASE_VENTAS,
    'reservas': BASE_VENTAS,
    'localidades_evento': BASE_VENTAS,
    'publicaciones_reventa': BASE_POSTVENTA,
    'transacciones_reventa': BASE_POSTVENTA,
    'eventos_referencia': BASE_POSTVENTA,
}


def sql(consulta, base=None):
    """
    Una consulta contra la base del servicio dueño de la tabla que nombra.

    Se deduce de la consulta en vez de pedírselo a quien llama porque hay
    cuarenta y cuatro asertos repartidos por las suites, y obligar a cada uno a
    recordar en qué base vive cada tabla sería una fuente de fallos silenciosos:
    una consulta contra la base equivocada no da error, da una fila vacía — y un
    aserto que compara contra vacío puede pasar sin comprobar nada.

    `base` fuerza una en los casos raros (una tabla que está en las dos).
    """
    if base is None:
        tablas = re.findall(r'(?:from|update|into|join)\s+"?([a-z_]+)"?', consulta, re.IGNORECASE)
        bases = {_DUENO[t] for t in tablas if t in _DUENO}
        if len(bases) > 1:
            raise AssertionError(
                f'La consulta cruza dos servicios {sorted(bases)}: {consulta}\n'
                'Desde ADR-14 no hay JOIN posible entre ellas. Sepárala en dos consultas.'
            )
        base = bases.pop() if bases else BASE_POSTVENTA
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
         '-d', base, '-tAc', consulta],
        capture_output=True, text=True).stdout.strip()


def resembrar():
    """
    Deja las dos bases como las describe la semilla de Ventas.

    La semilla vive en Ventas, porque las entradas son suyas. Postventa no
    tiene semilla: sus publicaciones las crean las propias suites publicando,
    que es como ocurre de verdad. Lo único que hay que limpiar aquí es lo que
    dejó la suite anterior.
    """
    subprocess.run(['npm', 'run', 'semilla'], capture_output=True, check=True,
                   cwd='../entradas-mercado-secundario')
    sql('TRUNCATE TABLE transacciones_reventa, publicaciones_reventa CASCADE',
        base=BASE_POSTVENTA)


def comprar(usuario, localidad, cantidad=1, token='tok_ok', cupon=None):
    """
    Una compra pagada **en Ventas**, que es el punto de partida de todo el
    CU-006: para revender una entrada hay que tenerla, y emitirla es suyo.
    """
    estado, compra = pedir('POST', 'compras', usuario,
                           {'localidadId': localidad, 'cantidad': cantidad}, base=API_VENTAS)
    assert estado == 201, (estado, compra)
    if cupon:
        estado, compra = pedir('PUT', f"compras/{compra['id']}/cupon", usuario, {'codigo': cupon},
                               base=API_VENTAS)
        assert estado == 200, (estado, compra)
    estado, pagada = pedir('POST', f"compras/{compra['id']}/pagar", usuario,
                           {'metodoPago': 'TARJETA', 'token': token}, base=API_VENTAS)
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
