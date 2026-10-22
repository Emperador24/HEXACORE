#!/usr/bin/env python3
"""
RNF-06 sobre el servicio de Pedidos: quién puede llegar a cada ruta.

El servicio **no** se fía del gateway: verifica el token él mismo. Es lo que
protege cuando alguien alcanza el puerto 3003 por dentro de la red de
contenedores, sin pasar por Nginx. Esta suite comprueba las dos mitades:

  * que se rechaza lo que hay que rechazar (sin token, mal firmado, caducado,
    revocado, o con un rol que no es el del caso de uso),
  * y que un token legítimo de Cliente sí entra.

    python3 pruebas/cu011-autenticacion.py
"""

import json
import subprocess
import urllib.error
import urllib.request
import uuid

from identidad import cabeceras, contenido_para, firmar

API = 'http://localhost:3003/api/v1'
EVENTO = 'e0000001-0000-4000-8000-000000000001'
SAZON = '30000000-0000-4000-8000-000000000001'
GASEOSA = '40000000-0000-4000-8000-000000000002'

CHECKOUT = {
    'eventoId': EVENTO,
    'establecimientoId': SAZON,
    'metodoEntrega': 'RECOGER_EN_PUNTO',
    'productos': [{'productoId': GASEOSA, 'cantidad': 1}],
}

fallos = []


def estado_de(ruta, headers, metodo='POST', cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f'{API}/{ruta}', data=datos, method=metodo,
                                 headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except urllib.error.URLError:
        return 0


def comprobar(condicion, descripcion):
    if condicion:
        print(f'  \033[32mok\033[0m    {descripcion}')
    else:
        print(f'  \033[31mFALLA\033[0m {descripcion}')
        fallos.append(descripcion)


json_simple = {'Content-Type': 'application/json'}

print('\nCU-011 · El servicio verifica la sesión por su cuenta')

comprobar(estado_de('pedidos/checkout', json_simple, cuerpo=CHECKOUT) == 401,
          'sin cabecera Authorization: 401')

comprobar(estado_de('pedidos/checkout',
                    {**json_simple, 'Authorization': 'Bearer esto-no-es-un-jwt'},
                    cuerpo=CHECKOUT) == 401,
          'con un token que ni siquiera es un JWT: 401')

# Firmado con OTRA clave: la firma no valida contra la pública del servicio.
# Es la comprobación que demuestra que no basta con que el token "parezca" uno.
otra_clave = '/tmp/hexacore-clave-intrusa.pem'
subprocess.run(['openssl', 'genrsa', '-out', otra_clave, '2048'],
               capture_output=True, check=True)
intruso = firmar({'alg': 'RS256', 'typ': 'JWT'},
                 contenido_para(str(uuid.uuid4())), clave=otra_clave)
comprobar(estado_de('pedidos/checkout',
                    {**json_simple, 'Authorization': f'Bearer {intruso}'},
                    cuerpo=CHECKOUT) == 401,
          'firmado con otra clave privada: 401')

caducado = firmar({'alg': 'RS256', 'typ': 'JWT'},
                  contenido_para(str(uuid.uuid4()), vida=-60))
comprobar(estado_de('pedidos/checkout',
                    {**json_simple, 'Authorization': f'Bearer {caducado}'},
                    cuerpo=CHECKOUT) == 401,
          'caducado: 401')

emisor_ajeno = firmar({'alg': 'RS256', 'typ': 'JWT'},
                      contenido_para(str(uuid.uuid4()), iss='otro-emisor'))
comprobar(estado_de('pedidos/checkout',
                    {**json_simple, 'Authorization': f'Bearer {emisor_ajeno}'},
                    cuerpo=CHECKOUT) == 401,
          'emitido por otro que no es Administración: 401')

# Revocado: el token sigue firmado y vigente, pero Administración anotó su
# `jti` en Redis al cerrar la sesión (App/shared/seguridad/token-sesion.md).
jti = str(uuid.uuid4())
revocado = firmar({'alg': 'RS256', 'typ': 'JWT'},
                  contenido_para(str(uuid.uuid4()), jti=jti))
subprocess.run(['docker', 'exec', 'hexacore-redis', 'redis-cli',
                'set', f'sesion-revocada:{jti}', '1', 'EX', '120'],
               capture_output=True, check=True)
comprobar(estado_de('pedidos/checkout',
                    {**json_simple, 'Authorization': f'Bearer {revocado}'},
                    cuerpo=CHECKOUT) == 401,
          'de una sesión ya cerrada: 401')

print('\nCU-011 · Y el rol correcto')

comprobar(estado_de('pedidos/checkout',
                    cabeceras(str(uuid.uuid4()), ('Personal',)),
                    cuerpo=CHECKOUT) == 403,
          'un empleado no hace pedidos de cliente: 403')

comprobar(estado_de('pedidos/checkout',
                    cabeceras(str(uuid.uuid4()), ('Administrador',)),
                    cuerpo=CHECKOUT) == 403,
          'un administrador tampoco: 403')

comprobar(estado_de('pedidos/checkout',
                    cabeceras(str(uuid.uuid4()), ('Cliente',)),
                    cuerpo=CHECKOUT) == 201,
          'un Cliente legítimo sí entra: 201')

print()
if fallos:
    print(f'\033[31m{len(fallos)} comprobaciones fallaron\033[0m')
    raise SystemExit(1)
print('\033[32mCU-011 autenticación: todas las comprobaciones pasaron\033[0m')
