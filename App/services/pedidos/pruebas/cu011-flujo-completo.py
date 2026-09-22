#!/usr/bin/env python3
"""
CU-011 de extremo a extremo: consultar el catálogo, armar el pedido, reservar
el inventario y pagarlo.

Recorre el flujo básico y los caminos de excepción que el caso de uso declara:

    inventario insuficiente     no se puede reservar lo que no hay
    pago rechazado              el pedido no se confirma
    producto de otro local      no se mezclan establecimientos en un pedido

y comprueba contra la base de datos lo que son post-condiciones de verdad: que
la reserva de inventario se crea al abrir el checkout, que el pago aprobado
confirma el pedido y genera su QR, y que un pago rechazado deja el pedido sin
confirmar.

Necesita la infraestructura y el servicio levantados:

    cd App/infra && ./iniciar.sh
    cd App/services/pedidos
    npm run migracion:correr && npm run semilla
    python3 pruebas/cu011-flujo-completo.py

Se apoya en los identificadores fijos de la semilla, así que no depende del
estado que dejen otras pruebas.
"""

import json
import os
import pathlib
import subprocess
import urllib.error
import urllib.request
import uuid

from identidad import cabeceras

API = 'http://localhost:3003/api/v1'

EVENTO = 'e0000001-0000-4000-8000-000000000001'
SAZON = '30000000-0000-4000-8000-000000000001'
COMAL = '30000000-0000-4000-8000-000000000002'

HAMBURGUESA = '40000000-0000-4000-8000-000000000001'   # inventario 20
GASEOSA = '40000000-0000-4000-8000-000000000002'       # inventario 30
PAPAS = '40000000-0000-4000-8000-000000000003'         # inventario 1
JUGO = '40000000-0000-4000-8000-000000000004'          # inventario 0
TACOS = '40000000-0000-4000-8000-000000000005'         # otro establecimiento

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ESTABLECIMIENTOS = (SAZON, COMAL, '30000000-0000-4000-8000-000000000003')

fallos = []


def preparar_entorno():
    """Deja la base y el inventario de Redis como recién sembrados.

    Sin esto la suite solo pasa la primera vez: las reservas y los pedidos que
    deja una corrida consumen el inventario de los productos escasos, y la
    siguiente falla por agotado. El inventario de Redis se carga con el mismo
    comando de mantenimiento que se usaría en producción.
    """
    subprocess.run(['npm', 'run', 'semilla'], cwd=RAIZ,
                   capture_output=True, check=True)

    # El preparador se niega a pisar un inventario ya cargado
    # (INVENTARIO_YA_EXISTENTE), que es lo correcto en producción. Para poder
    # repetir la prueba se borran antes sus claves. Solo las del inventario:
    # las de sesiones revocadas viven en el mismo Redis y no se tocan.
    subprocess.run(
        ['docker', 'exec', 'hexacore-redis', 'sh', '-c',
         "redis-cli --scan --pattern 'pedidos:inv:*' | xargs -r redis-cli del"],
        capture_output=True, check=True)

    entorno = {**os.environ, 'REDIS_HOST': os.environ.get('REDIS_HOST', 'localhost'),
               'REDIS_PUERTO': os.environ.get('REDIS_PUERTO', '6380')}
    for establecimiento in ESTABLECIMIENTOS:
        subprocess.run(
            ['npx', 'ts-node', 'src/inventario/preparar-inventario.ts',
             establecimiento, '--compras-detenidas'],
            cwd=RAIZ, env=entorno, capture_output=True, check=True)


def pedir(metodo, ruta, usuario, cuerpo=None, roles=('Cliente',), espera=30,
          extra=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    headers = dict(cabeceras(usuario, roles))
    headers.update(extra or {})
    req = urllib.request.Request(f'{API}/{ruta}', data=datos, method=metodo,
                                 headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        cuerpo = e.read() or b'{}'
        try:
            return e.code, json.loads(cuerpo)
        except json.JSONDecodeError:
            return e.code, {'crudo': cuerpo.decode(errors='replace')}


def sql(consulta):
    """Una consulta contra la base del servicio, para comprobar efectos."""
    salida = subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-qtA', '-F', '|',
         '--username=hexacore', '--dbname=pedidos', '-c', consulta],
        capture_output=True, text=True, check=True).stdout.strip()
    return [l.split('|') for l in salida.splitlines() if l]


def comprobar(condicion, descripcion):
    if condicion:
        print(f'  \033[32mok\033[0m    {descripcion}')
    else:
        print(f'  \033[31mFALLA\033[0m {descripcion}')
        fallos.append(descripcion)


def pagar(cliente, pedido_id, token, clave=None):
    """Un pago. `Idempotency-Key` es obligatoria y tiene que ser un UUID: es
    lo que permite reintentar sin cobrar dos veces."""
    return pedir('POST', f'pedidos/{pedido_id}/pagos', cliente,
                 {'tokenPago': token},
                 extra={'Idempotency-Key': clave or str(uuid.uuid4())})


def checkout(cliente, productos, establecimiento=SAZON, evento=EVENTO,
             metodo='RECOGER_EN_PUNTO'):
    return pedir('POST', 'pedidos/checkout', cliente, {
        'eventoId': evento,
        'establecimientoId': establecimiento,
        'metodoEntrega': metodo,
        'productos': productos,
    })


# --- Flujo básico -----------------------------------------------------------

preparar_entorno()

print('\nCU-011 · Flujo básico: catálogo, checkout y pago')

cliente = str(uuid.uuid4())

estado, locales = pedir('GET', f'pedidos/eventos/{EVENTO}/establecimientos', cliente)
comprobar(estado == 200 and any(l['id'] == SAZON for l in locales),
          'el catálogo lista los establecimientos del evento')

estado, productos = pedir('GET', f'pedidos/establecimientos/{SAZON}/productos', cliente)
comprobar(estado == 200 and any(p['id'] == HAMBURGUESA for p in productos),
          'el catálogo lista los productos del establecimiento')

estado, orden = checkout(cliente, [
    {'productoId': HAMBURGUESA, 'cantidad': 2},
    {'productoId': GASEOSA, 'cantidad': 1},
])
comprobar(estado == 201, f'se abre el checkout (recibido {estado})')
comprobar(orden.get('total') == '56000.00',
          f'el total lo calcula el servidor: 2x25000 + 6000 = 56000 (dio {orden.get("total")})')
comprobar(orden.get('inventarioReservado') is True,
          'el inventario queda reservado al abrir el checkout')
comprobar(orden.get('codigoQr') is None, 'todavía no hay QR: el pedido no está pagado')

pedido_id = orden.get('id')
reservas = sql(f"SELECT count(*) FROM reservas_inventario WHERE pedido_id = '{pedido_id}'")
comprobar(reservas and int(reservas[0][0]) > 0,
          'la reserva de inventario existe en la base')

clave_pago = str(uuid.uuid4())
estado, pago = pagar(cliente, pedido_id, 'tok_ok_cu011', clave_pago)
comprobar(estado == 200, f'el pago se procesa (recibido {estado})')
comprobar(pago.get('compraConfirmada') is True,
          f'el pago aprobado confirma el pedido (estado: {pago.get("estadoPedido")})')

fila = sql(f"SELECT estado, codigo_qr IS NOT NULL FROM pedidos WHERE id = '{pedido_id}'")
comprobar(fila and fila[0][0] == 'CONFIRMADO',
          f'el pedido queda CONFIRMADO en la base (quedó {fila[0][0] if fila else "?"})')
comprobar(fila and fila[0][1] == 't',
          'el pedido confirmado tiene su código QR')

# --- Inventario insuficiente ------------------------------------------------

print('\nCU-011 · Inventario insuficiente')

estado, respuesta = checkout(str(uuid.uuid4()), [{'productoId': JUGO, 'cantidad': 1}])
comprobar(estado >= 400,
          f'un producto agotado no se puede pedir (recibido {estado})')

estado, respuesta = checkout(str(uuid.uuid4()), [{'productoId': PAPAS, 'cantidad': 5}])
comprobar(estado >= 400,
          f'no se puede pedir más de lo que hay: 5 de 1 (recibido {estado})')

# La unidad que sí existe se sigue pudiendo pedir: el rechazo anterior no
# dejó el inventario bloqueado.
estado, orden_papas = checkout(str(uuid.uuid4()), [{'productoId': PAPAS, 'cantidad': 1}])
comprobar(estado == 201,
          'el rechazo por exceso no bloquea la unidad disponible')

# --- Productos de otro establecimiento --------------------------------------

print('\nCU-011 · Un pedido no mezcla establecimientos')

estado, respuesta = checkout(str(uuid.uuid4()), [{'productoId': TACOS, 'cantidad': 1}],
                             establecimiento=SAZON)
comprobar(estado >= 400,
          f'un producto de otro local no entra en el pedido (recibido {estado})')

# --- Pago rechazado ---------------------------------------------------------

print('\nCU-011 · El pago es rechazado')

otro = str(uuid.uuid4())
estado, orden2 = checkout(otro, [{'productoId': GASEOSA, 'cantidad': 1}])
comprobar(estado == 201, 'se abre un segundo checkout')

estado, pago2 = pagar(otro, orden2['id'], 'tok_rechazo_cu011')
# Que la pasarela diga que no es un resultado de negocio, no una avería: se
# responde 200 con el detalle. Se reserva el 502 para `FALLIDA`, que es un
# error técnico y no demuestra que no hubo cobro (ver el enum
# EstadoTransaccionPedido y el controlador de pagos).
comprobar(estado == 200, f'un cobro rechazado responde 200 (recibido {estado})')
comprobar(pago2.get('estadoPago') == 'RECHAZADA',
          f'la transacción queda RECHAZADA (quedó {pago2.get("estadoPago")})')
comprobar(pago2.get('compraConfirmada') is not True,
          'un pago rechazado no confirma el pedido')

# Y el error técnico sí es 502: la distinción entre los dos casos es justo lo
# que evita dar por no cobrado algo que quizá sí se cobró.
tercero = str(uuid.uuid4())
estado, orden3 = checkout(tercero, [{'productoId': GASEOSA, 'cantidad': 1}])
comprobar(estado == 201, 'se abre un tercer checkout')
estado, pago3 = pagar(tercero, orden3['id'], 'tok_error_cu011')
comprobar(estado == 502, f'un fallo técnico de la pasarela responde 502 (recibido {estado})')

fila = sql(f"SELECT estado FROM pedidos WHERE id = '{orden2['id']}'")
comprobar(fila and fila[0][0] != 'CONFIRMADO',
          f'el pedido no queda confirmado en la base (quedó {fila[0][0] if fila else "?"})')

# --- Idempotencia del pago --------------------------------------------------

print('\nCU-011 · Reintentar un pago no cobra dos veces')

estado, repetido = pagar(cliente, pedido_id, 'tok_ok_cu011', clave_pago)
comprobar(estado == 200, f'repetir el pago con la misma clave responde 200 (dio {estado})')
comprobar(repetido.get('transaccionId') == pago.get('transaccionId'),
          'devuelve la MISMA transacción, no una nueva')

transacciones = sql(
    f"SELECT count(*) FROM transacciones_pedido WHERE pedido_id = '{pedido_id}'")
comprobar(transacciones and int(transacciones[0][0]) == 1,
          f'solo hay una transacción en la base (hay {transacciones[0][0] if transacciones else "?"})')

# --- Validación de entrada --------------------------------------------------

print('\nCU-011 · Validación de la petición')

estado, _ = checkout(str(uuid.uuid4()), [])
comprobar(estado == 400, f'un pedido sin productos se rechaza (recibido {estado})')

estado, _ = checkout(str(uuid.uuid4()), [{'productoId': HAMBURGUESA, 'cantidad': 0}])
comprobar(estado == 400, f'una cantidad de cero se rechaza (recibido {estado})')

estado, _ = pedir('GET', 'pedidos/establecimientos/no-es-un-uuid/productos',
                  str(uuid.uuid4()))
comprobar(estado == 400, f'un identificador que no es UUID se rechaza (recibido {estado})')

estado, _ = pedir('POST', f'pedidos/{pedido_id}/pagos', cliente,
                  {'tokenPago': 'tok_ok_cu011'})
comprobar(estado == 400,
          f'un pago sin Idempotency-Key se rechaza (recibido {estado})')

# --- Resultado --------------------------------------------------------------

print()
if fallos:
    print(f'\033[31m{len(fallos)} comprobaciones fallaron\033[0m')
    raise SystemExit(1)
print('\033[32mCU-011: todas las comprobaciones pasaron\033[0m')
