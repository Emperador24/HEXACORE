#!/usr/bin/env python3
"""
RNF-06 entre servicios: el token que emite Administración es lo único que abre
la reventa.

    RNF-06: toda petición a un microservicio pasa autenticada y autorizada por
            rol. Endpoints de negocio alcanzables sin token válido: 0 %.

A diferencia de las otras suites, esta **no fabrica tokens para entrar**: inicia
sesión de verdad en el Servicio de Administración y usa ese token aquí. Solo
fabrica los que deben ser rechazados.

Necesita los dos servicios en marcha:

    (cd ../administracion && npm run start:dev)   # :3002
    npm run start:dev                              # :3001
    python3 pruebas/rnf06-autenticacion.py
"""

import base64
import hashlib
import hmac
import json
import pathlib
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

from identidad import CLAVES, b64, contenido_para, firmar

REVENTA = 'http://localhost:3001/api/v1'
ADMIN = 'http://localhost:3002/api/v1'
CORREO = 'http://localhost:3098'
CONTRASENA_DEMO = 'hexacore2026'
ANA = 'a0000001-0000-4000-8000-000000000001'


def pedir(url, metodo='GET', token=None, cuerpo=None, cabeceras=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    todas = {'Content-Type': 'application/json', **(cabeceras or {})}
    if token:
        todas['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=datos, method=metodo, headers=todas)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def entrar(email, contrasena=CONTRASENA_DEMO):
    estado, cuerpo = pedir(f'{ADMIN}/sesiones', 'POST', cuerpo={'email': email, 'contrasena': contrasena})
    assert estado == 200, (email, estado, cuerpo)
    return cuerpo['token']


def mis_entradas(token=None, **extra):
    return pedir(f'{REVENTA}/reventa/mis-entradas', token=token, **extra)


def sql(base, consulta):
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore', '-d', base, '-tAc', consulta],
        capture_output=True, text=True).stdout.strip()


def redis(*args):
    return subprocess.run(['docker', 'exec', 'hexacore-redis', 'redis-cli', *args],
                          capture_output=True, text=True).stdout.strip()


def jti_de(token):
    return json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '=='))['jti']


def cuenta_nueva():
    """Cuenta propia para no tocar las contraseñas de la demo."""
    email = f's{uuid.uuid4().hex[:10]}@hexacore.com'
    pedir(f'{ADMIN}/cuentas/registro', 'POST', cuerpo={'nombre': 'Sofía Sesiones', 'email': email,
                                                       'contrasena': 'una frase de paso larga'})
    for _ in range(20):
        with urllib.request.urlopen(f'{CORREO}/correos?para={email}') as r:
            correos = json.load(r)['correos']
        if correos:
            break
        time.sleep(0.5)
    token = re.search(r'token=([\w-]+)', correos[0]['texto']).group(1)
    assert pedir(f'{ADMIN}/cuentas/verificar', 'POST', cuerpo={'token': token})[0] == 200
    return email


# --------------------------------------------------------------------------


def login_real_abre_la_reventa():
    print('### Un login real en Administración abre la reventa')
    token = entrar('cliente@hexacore.com')
    estado, entradas = mis_entradas(token)
    assert estado == 200, (estado, entradas)
    esperadas = sql('entradas_mercado_secundario',
                    f"SELECT count(*) FROM entradas WHERE propietario_id='{ANA}'")
    assert len(entradas) == int(esperadas) > 0, (len(entradas), esperadas)
    print(f'  Ana entra con su contraseña y ve sus {len(entradas)} entradas')

    otro = entrar('bruno@hexacore.com')
    _, de_bruno = mis_entradas(otro)
    assert {e['id'] for e in de_bruno}.isdisjoint({e['id'] for e in entradas})
    print('  con el token de Bruno se ven las de Bruno, no las de Ana')
    return token


def puertas_cerradas():
    print('\n### Lo que ya no abre la reventa')
    casos = {
        'sin token': {},
        'la antigua X-Usuario-Id': {'cabeceras': {'X-Usuario-Id': ANA}},
        'X-Usuario-Id con un token de otro': {
            'token': entrar('bruno@hexacore.com'), 'cabeceras': {'X-Usuario-Id': ANA}},
    }

    # Firmado con una clave que no es la de Administración.
    with tempfile.TemporaryDirectory() as tmp:
        ajena = pathlib.Path(tmp) / 'ajena.pem'
        subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048',
                        '-out', str(ajena)], capture_output=True, check=True)
        casos['firmado con otra clave'] = {
            'token': firmar({'alg': 'RS256', 'typ': 'JWT'}, contenido_para(ANA), clave=ajena)}

    contenido = contenido_para(ANA, roles=['Administrador'])
    casos['alg none'] = {'token': f"{b64(json.dumps({'alg': 'none'}).encode())}.{b64(json.dumps(contenido).encode())}."}

    # Confusión de algoritmo: HS256 usando la clave pública —que es pública— como secreto.
    publica = (CLAVES / 'jwt-publica.pem').read_bytes()
    entrada = f"{b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())}.{b64(json.dumps(contenido).encode())}"
    firma = b64(hmac.new(publica, entrada.encode(), hashlib.sha256).digest())
    casos['HS256 con la clave pública'] = {'token': f'{entrada}.{firma}'}

    casos['caducado'] = {'token': firmar({'alg': 'RS256'}, contenido_para(ANA, iat=int(time.time()) - 7200,
                                                                         exp=int(time.time()) - 3600))}
    casos['otro emisor'] = {'token': firmar({'alg': 'RS256'}, contenido_para(ANA, iss='otro-servicio'))}
    casos['token manipulado'] = {'token': entrar('bruno@hexacore.com')[:-4] + 'AAAA'}

    for nombre, caso in casos.items():
        estado, cuerpo = mis_entradas(caso.get('token'), cabeceras=caso.get('cabeceras'))
        if nombre == 'X-Usuario-Id con un token de otro':
            # Entra, pero como Bruno: la cabecera no suplanta a nadie.
            assert estado == 200 and all(e.get('id') for e in cuerpo), (estado, cuerpo)
            ana = sql('entradas_mercado_secundario', f"SELECT id FROM entradas WHERE propietario_id='{ANA}'").split()
            assert not set(ana) & {e['id'] for e in cuerpo}, 'la cabecera suplantó a Ana'
        else:
            assert estado == 401 and cuerpo['codigo'] == 'SIN_AUTENTICAR', (nombre, estado, cuerpo)
        print(f'  {nombre}: {"entra como Bruno, no como Ana" if estado == 200 else "401"}')

    # Todas las rutas de negocio, no solo una.
    rutas = [('GET', 'reventa/mis-entradas'), ('GET', 'reventa/publicaciones'),
             ('GET', f'reventa/publicaciones/{uuid.uuid4()}'), ('POST', 'reventa/publicaciones'),
             ('POST', f'reventa/publicaciones/{uuid.uuid4()}/checkout'), ('GET', f'reventa/checkout/{uuid.uuid4()}'),
             ('POST', f'reventa/checkout/{uuid.uuid4()}/pagar'), ('DELETE', f'reventa/checkout/{uuid.uuid4()}'),
             ('PATCH', f'reventa/publicaciones/{uuid.uuid4()}'), ('DELETE', f'reventa/publicaciones/{uuid.uuid4()}'),
             ('POST', 'reventa/mantenimiento/expirar-publicaciones')]
    abiertas = [r for r in rutas if pedir(f'{REVENTA}/{r[1]}', r[0], cuerpo={})[0] != 401]
    assert not abiertas, f'rutas alcanzables sin token: {abiertas}'
    print(f'  RNF-06: {len(rutas)} de {len(rutas)} rutas de negocio responden 401 sin token (0 % abiertas)')


def cerrar_sesion_se_propaga(token):
    print('\n### Cerrar sesión en Administración cierra la reventa')
    assert mis_entradas(token)[0] == 200
    jti = jti_de(token)
    assert pedir(f'{ADMIN}/sesiones/actual', 'DELETE', token)[0] == 200

    estado, cuerpo = mis_entradas(token)
    assert estado == 401 and cuerpo['codigo'] == 'SIN_AUTENTICAR', (estado, cuerpo)
    print('  el mismo token, sin caducar, recibe 401 en la reventa al instante')

    ttl = int(redis('TTL', f'sesion-revocada:{jti}'))
    restante = int(json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '=='))['exp'] - time.time())
    # `exp` va en segundos truncados y `expira_en` se calcula aparte al emitir:
    # entre ambos cabe un par de segundos.
    assert restante < ttl <= restante + 60 + 5, (ttl, restante)
    print(f'  en Redis la revocación dura lo que le queda al token + margen ({ttl} s)')


def cambio_de_contrasena_se_propaga():
    print('\n### Cambiar la contraseña cierra las demás sesiones también en la reventa')
    email = cuenta_nueva()
    esta, otra = entrar(email, 'una frase de paso larga'), entrar(email, 'una frase de paso larga')
    assert mis_entradas(otra) == (200, [])
    estado, _ = pedir(f'{ADMIN}/cuentas/perfil/contrasena', 'PUT', esta,
                      {'contrasenaActual': 'una frase de paso larga', 'contrasenaNueva': 'la nueva frase de paso'})
    assert estado == 200
    assert mis_entradas(otra)[0] == 401, 'la otra sesión sigue abierta en la reventa'
    assert mis_entradas(esta)[0] == 200, 'la sesión que hizo el cambio debía seguir'
    print('  la otra sesión ya no entra; la que hizo el cambio sí')


def roles():
    print('\n### Autorización por rol')
    personal = entrar('personal@hexacore.com')
    estado, cuerpo = mis_entradas(personal)
    assert estado == 403 and cuerpo['codigo'] == 'ROL_INSUFICIENTE', (estado, cuerpo)
    print('  Personal no puede usar la reventa: 403')

    url = f'{REVENTA}/reventa/mantenimiento/expirar-publicaciones'
    estado, cuerpo = pedir(url, 'POST', entrar('cliente@hexacore.com'))
    assert estado == 403 and cuerpo['codigo'] == 'ROL_INSUFICIENTE', (estado, cuerpo)
    estado, cuerpo = pedir(url, 'POST', entrar('admin@hexacore.com'))
    assert estado == 200 and 'revisadas' in json.dumps(cuerpo) or estado == 200, (estado, cuerpo)
    print('  el barrido de mantenimiento: Cliente 403, Administrador 200')


def redis_caido():
    print('\n### Si no se puede comprobar la revocación, no se entra')
    token = entrar('cliente@hexacore.com')
    subprocess.run(['docker', 'pause', 'hexacore-redis'], capture_output=True, check=True)
    try:
        estado, cuerpo = mis_entradas(token)
    finally:
        subprocess.run(['docker', 'unpause', 'hexacore-redis'], capture_output=True, check=True)
    assert estado == 503 and cuerpo['codigo'] == 'SESIONES_NO_DISPONIBLES', (estado, cuerpo)
    print('  Redis en pausa: 503 (no se acepta un token que no se puede comprobar)')
    for _ in range(20):
        if mis_entradas(token)[0] == 200:
            break
        time.sleep(0.5)
    else:
        raise AssertionError('la reventa no se recuperó al volver Redis')
    print('  al volver Redis, el mismo token vuelve a entrar')


if __name__ == '__main__':
    token = login_real_abre_la_reventa()
    puertas_cerradas()
    cerrar_sesion_se_propaga(token)
    cambio_de_contrasena_se_propaga()
    roles()
    redis_caido()
    print('\nOK — RNF-06 entre Administración y la reventa')
