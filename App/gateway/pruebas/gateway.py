#!/usr/bin/env python3
"""
API Gateway (ADR-02) — punto único de entrada, autenticación centralizada,
enrutamiento y balanceo.

Comprueba lo que el SAD le atribuye:

  - **ADR-02 / vista de contenedores:** los clientes hablan solo con el gateway;
    él enruta a cada microservicio.
  - **RNF-06:** *"toda petición a un microservicio pasa autenticada y autorizada
    por rol desde el API Gateway"*. El gateway rechaza antes de enrutar; la
    autorización fina (el rol para cada operación) sigue en el dominio.
  - **RNF-03:** el sistema sigue atendiendo aunque caiga una instancia.
  - **RNF-10:** varias instancias del Servicio de Entradas reparten el trabajo.

    docker compose -f ../../docker-compose.yml -f ../../docker-compose.escalado.yml \
      --profile servicios up -d --scale entradas-mercado-secundario=2
    python3 pruebas/gateway.py

Con una sola instancia, las dos últimas comprobaciones se saltan y se avisa.
"""

import json
import subprocess
import urllib.error
import urllib.request
from collections import Counter

GATEWAY = 'http://localhost:8080'
API = f'{GATEWAY}/api/v1'
DEMO = 'hexacore2026'
PORTAL = 'http://localhost:4200'


def pedir(url, metodo='GET', token=None, cuerpo=None, cabeceras=None):
    todas = {'Content-Type': 'application/json', **(cabeceras or {})}
    if token:
        todas['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, method=metodo, headers=todas,
                                 data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r) if (r.headers.get('Content-Type') or '').startswith('application/json') else {}, r.headers
    except urllib.error.HTTPError as e:
        cuerpo_error = e.read()
        try:
            return e.code, json.loads(cuerpo_error or b'{}'), e.headers
        except json.JSONDecodeError:
            return e.code, {}, e.headers


def entrar(email, contrasena=DEMO):
    estado, cuerpo, _ = pedir(f'{API}/sesiones', 'POST', cuerpo={'email': email, 'contrasena': contrasena})
    assert estado == 200, (email, estado, cuerpo)
    return cuerpo['token']


def replicas():
    salida = subprocess.run(['docker', 'ps', '--filter', 'name=entradas-mercado-secundario',
                             '--filter', 'health=healthy', '--format', '{{.Names}}'],
                            capture_output=True, text=True).stdout.split()
    return salida


# --------------------------------------------------------------------------


def enruta():
    print('### Un solo punto de entrada, que enruta a cada servicio')
    estado, cuerpo, _ = pedir(f'{GATEWAY}/salud')
    assert estado == 200 and cuerpo['servicio'] == 'api-gateway', cuerpo

    # Rutas públicas del CU-027: sin ellas no habría forma de obtener un token.
    for ruta, metodo, esperado in [
        ('cuentas/registro', 'POST', 400),     # llega al servicio: valida y responde
        ('sesiones/renovar', 'POST', 401),     # llega al servicio: no hay sesión
        ('salud', 'GET', 200),                 # sonda del Servicio de Administración
    ]:
        estado, _, _ = pedir(f'{API}/{ruta}', metodo, cuerpo={} if metodo == 'POST' else None)
        assert estado == esperado, (ruta, estado, esperado)
    print('  públicas del CU-027: registro, renovación, login y sondas pasan sin token')

    token = entrar('cliente@hexacore.com')
    estado, entradas, cabeceras = pedir(f'{API}/reventa/mis-entradas', token=token)
    assert estado == 200 and isinstance(entradas, list) and entradas, (estado, entradas)
    assert cabeceras.get('X-Servidor'), 'falta la cabecera que dice qué instancia respondió'
    print(f'  login → Administración · reventa → Entradas (respondió {cabeceras["X-Servidor"]})')

    estado, cuerpo, _ = pedir(f'{API}/no-existe')
    assert estado == 404 and cuerpo['codigo'] == 'RUTA_NO_ENCONTRADA', (estado, cuerpo)
    print('  una ruta que no enruta a nadie: 404 con el mismo formato de error')


def autentica_antes_de_enrutar():
    print('\n### RNF-06: el gateway autentica antes de enrutar')
    for ruta in ('reventa/mis-entradas', 'cuentas/perfil', 'admin/cuentas'):
        estado, cuerpo, _ = pedir(f'{API}/{ruta}')
        assert estado == 401 and cuerpo['codigo'] == 'SIN_AUTENTICAR', (ruta, estado, cuerpo)
    print('  reventa, perfil y administración sin token: 401')

    # Una ruta inexistente DEL SERVICIO responde 401 y no 404: la petición no
    # llegó a él. Es la prueba de que el gateway corta antes de enrutar.
    estado, _, _ = pedir(f'{API}/reventa/ruta-que-no-existe')
    assert estado == 401, estado
    print('  una ruta inexistente del servicio también da 401: no llegó a él')

    for malo in ('no-es-un-token', 'a.b.c'):
        estado, _, _ = pedir(f'{API}/reventa/mis-entradas', token=malo)
        assert estado == 401, (malo, estado)

    # Sesión cerrada: el gateway lo consulta con Administración en cada petición.
    token = entrar('bruno@hexacore.com')
    assert pedir(f'{API}/reventa/mis-entradas', token=token)[0] == 200
    assert pedir(f'{API}/sesiones/actual', 'DELETE', token=token)[0] == 200
    assert pedir(f'{API}/reventa/mis-entradas', token=token)[0] == 401
    print('  token falsificado o de una sesión cerrada: 401')

    # La autorización por rol sigue siendo del dominio: el gateway solo dice
    # "quién eres", el servicio decide "qué puedes hacer".
    personal = entrar('personal@hexacore.com')
    estado, cuerpo, _ = pedir(f'{API}/reventa/mis-entradas', token=personal)
    assert estado == 403 and cuerpo['codigo'] == 'ROL_INSUFICIENTE', (estado, cuerpo)
    print('  con sesión válida pero rol que no toca: 403 del servicio')


def cors():
    print('\n### CORS, centralizado en el gateway')
    _, _, cab = pedir(f'{API}/reventa/mis-entradas', 'OPTIONS',
                      cabeceras={'Origin': PORTAL, 'Access-Control-Request-Method': 'GET'})
    assert cab.get('Access-Control-Allow-Origin') == PORTAL, dict(cab)
    assert cab.get('Access-Control-Allow-Credentials') == 'true'
    assert 'X-Hexacore-Cliente' in (cab.get('Access-Control-Allow-Headers') or '')
    print('  la comprobación previa del navegador se responde sin tocar los servicios')

    _, _, cab = pedir(f'{API}/reventa/mis-entradas', 'OPTIONS',
                      cabeceras={'Origin': 'http://sitio-ajeno.com', 'Access-Control-Request-Method': 'GET'})
    assert not (cab.get('Access-Control-Allow-Origin') or '').startswith('http'), dict(cab)
    print('  un origen ajeno no recibe permiso')

    estado, cuerpo, cab = pedir(f'{API}/sesiones', 'POST',
                                cabeceras={'Origin': PORTAL, 'X-Hexacore-Cliente': 'web'},
                                cuerpo={'email': 'carla@hexacore.com', 'contrasena': DEMO})
    assert estado == 200 and cab.get('Access-Control-Allow-Origin') == PORTAL
    galleta = cab.get('Set-Cookie') or ''
    assert 'hxc_renovacion=' in galleta and 'HttpOnly' in galleta and 'SameSite=Strict' in galleta, galleta
    assert 'tokenRenovacion' not in cuerpo
    print('  el login web sigue entregando la cookie HttpOnly a través del gateway')


def balanceo_y_caida():
    print('\n### RNF-10 y RNF-03: varias instancias y caída de una')
    instancias = replicas()
    if len(instancias) < 2:
        print(f'  (se omite: hay {len(instancias)} instancia del Servicio de Entradas; ver el encabezado)')
        return

    token = entrar('cliente@hexacore.com')
    quien = Counter()
    for _ in range(20):
        _, _, cab = pedir(f'{API}/reventa/mis-entradas', token=token)
        quien[cab.get('X-Servidor')] += 1
    assert len(quien) >= 2, f'todas las peticiones fueron al mismo destino: {dict(quien)}'
    print(f'  20 peticiones repartidas entre {len(quien)} instancias: {dict(quien)}')

    caida = instancias[-1]
    subprocess.run(['docker', 'stop', caida], capture_output=True, check=True)
    try:
        estados = Counter(pedir(f'{API}/reventa/mis-entradas', token=token)[0] for _ in range(20))
        assert list(estados) == [200], f'con una instancia caída hubo fallos: {dict(estados)}'
        print(f'  con {caida.split("-")[-1]} caída, 20 de 20 peticiones siguen en 200 (RNF-03)')
    finally:
        subprocess.run(['docker', 'start', caida], capture_output=True, check=True)


def servicios_tambien_validan():
    print('\n### Defensa en profundidad: los servicios no se fían del gateway')
    directo = 'http://localhost:3001/api/v1/reventa/mis-entradas'
    try:
        estado, cuerpo, _ = pedir(directo)
    except urllib.error.URLError:
        print('  (se omite: el Servicio de Entradas no publica su puerto en este arranque)')
        return
    assert estado == 401 and cuerpo['codigo'] == 'SIN_AUTENTICAR', (estado, cuerpo)
    # Y no basta con inventarse la cabecera de identidad que pone el gateway.
    estado, _, _ = pedir(directo, cabeceras={'X-Usuario-Id': 'a0000001-0000-4000-8000-000000000001',
                                             'X-Usuario-Roles': 'Cliente'})
    assert estado == 401, estado
    print('  llamando directo al servicio: 401, y su cabecera de identidad no se puede falsificar')


if __name__ == '__main__':
    enruta()
    autentica_antes_de_enrutar()
    cors()
    balanceo_y_caida()
    servicios_tambien_validan()
    print('\nOK — API Gateway')
