#!/usr/bin/env python3
"""
Renovación de sesiones (DECISIONES.md §21).

    Token de acceso: 15 min.   Token de renovación: 30 días sin uso, sin tope.

Comprueba:
  - que renovar da un token de acceso nuevo, de la MISMA sesión, que sirve en la reventa;
  - la rotación: usar un token de renovación ya gastado cierra la sesión entera;
  - que un token inventado no puede cerrar la sesión de nadie;
  - que renovar lee los roles actuales y comprueba que la cuenta siga activa;
  - que todo lo que ya cerraba sesiones (logout, contraseña, CU-027B) también
    impide renovar;
  - la ventana de 30 días, y que cada renovación la aplaza.

    python3 pruebas/cu027-renovacion.py
"""

import base64
import calendar
import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

API = 'http://localhost:3002/api/v1'
REVENTA = 'http://localhost:3001/api/v1'
DEMO = 'hexacore2026'


def pedir(url, metodo='GET', token=None, cuerpo=None):
    cabeceras = {'Content-Type': 'application/json'}
    if token:
        cabeceras['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, method=metodo, headers=cabeceras,
                                 data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def sql(consulta):
    salida = subprocess.run(['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
                             '-d', 'administracion', '-tAc', consulta], capture_output=True, text=True)
    return salida.stdout.strip() or salida.stderr.strip()


def cuenta(roles=('Cliente',)):
    email = f'ren{uuid.uuid4().hex[:10]}@hexacore.com'
    id_ = sql(f"""INSERT INTO usuarios (nombre, email, hash_contrasena, estado, verificado_en)
                  SELECT 'Prueba Renovación', '{email}', hash_contrasena, 'ACTIVA', now()
                  FROM usuarios WHERE email = 'cliente@hexacore.com' RETURNING id""").split()[0]
    for rol in roles:
        sql(f"INSERT INTO usuarios_roles (usuario_id, rol_id) SELECT '{id_}', id FROM roles WHERE nombre = '{rol}'")
    return id_, email


def login(email, contrasena=DEMO):
    estado, cuerpo = pedir(f'{API}/sesiones', 'POST', cuerpo={'email': email, 'contrasena': contrasena})
    assert estado == 200, (estado, cuerpo)
    return cuerpo


def renovar(token_renovacion):
    return pedir(f'{API}/sesiones/renovar', 'POST', cuerpo={'tokenRenovacion': token_renovacion})


def contenido(jwt):
    return json.loads(base64.urlsafe_b64decode(jwt.split('.')[1] + '=='))


def reventa(token):
    return pedir(f'{REVENTA}/reventa/mis-entradas', token=token)[0]


def admin_vale(token):
    return pedir(f'{API}/sesiones/actual', token=token)[0]


# --------------------------------------------------------------------------


def login_y_renovacion():
    print('### Login: acceso de 15 minutos y token de renovación de 30 días')
    _, email = cuenta()
    s = login(email)
    acceso = contenido(s['token'])
    assert 14 * 60 < acceso['exp'] - acceso['iat'] <= 15 * 60, acceso
    dias = (calendar.timegm(time.strptime(s['renovacionExpiraEn'][:19], '%Y-%m-%dT%H:%M:%S')) - time.time()) / 86400
    assert 29.9 < dias <= 30.1, dias
    assert len(s['tokenRenovacion']) == 70 and s['tokenRenovacion'] not in json.dumps(
        sql(f"SELECT row_to_json(s) FROM sesiones s WHERE jti = '{acceso['jti']}'"))
    print('  acceso 15 min · renovación 30 días · el token de renovación no está en la base')

    time.sleep(1.1)  # para que el nuevo token tenga otro `iat`
    estado, r = renovar(s['tokenRenovacion'])
    assert estado == 200, (estado, r)
    nuevo = contenido(r['token'])
    assert nuevo['jti'] == acceso['jti'], 'la renovación debe conservar la sesión (jti)'
    assert nuevo['exp'] > acceso['exp'] and r['token'] != s['token']
    assert r['tokenRenovacion'] != s['tokenRenovacion']
    assert r['roles'] == ['Cliente']
    assert reventa(r['token']) == 200 and admin_vale(r['token']) == 200
    assert sql(f"SELECT generacion_renovacion FROM sesiones WHERE jti = '{acceso['jti']}'") == '1'
    print('  renovar: token nuevo de la misma sesión, válido en la reventa; generación 1')

    # Varias renovaciones seguidas, cada una con el token de la anterior.
    token = r['tokenRenovacion']
    for _ in range(5):
        estado, r = renovar(token)
        assert estado == 200, (estado, r)
        token = r['tokenRenovacion']
    assert sql(f"SELECT generacion_renovacion FROM sesiones WHERE jti = '{acceso['jti']}'") == '6'
    assert sql(f"SELECT count(*) FROM sesiones WHERE jti = '{acceso['jti']}'") == '1'
    print('  seis renovaciones: una sola fila de sesión, generación 6')
    return s, r


def rotacion_y_robo():
    print('\n### Rotación: un token de renovación gastado cierra la sesión entera')
    _, email = cuenta()
    s = login(email)
    r1 = renovar(s['tokenRenovacion'])[1]          # la persona renueva
    assert reventa(r1['token']) == 200

    estado, cuerpo = renovar(s['tokenRenovacion'])  # alguien usa la copia vieja
    assert estado == 401 and cuerpo['codigo'] == 'SESION_CERRADA_POR_SEGURIDAD', (estado, cuerpo)
    assert reventa(r1['token']) == 401, 'el token de acceso vigente debe dejar de valer en la reventa'
    assert admin_vale(r1['token']) == 401
    estado, cuerpo = renovar(r1['tokenRenovacion'])
    assert estado == 401 and cuerpo['codigo'] == 'SESION_CERRADA_POR_SEGURIDAD', (estado, cuerpo)
    assert sql(f"SELECT motivo_revocacion FROM sesiones WHERE jti = '{contenido(r1['token'])['jti']}'") == 'REUTILIZACION'
    print('  la copia vieja cierra la sesión: el acceso vigente y el token nuevo dejan de valer')
    print('  y la persona, al renovar, recibe el aviso de seguridad (no un simple "sesión terminada")')

    print('\n### El atacante renueva primero')
    _, email = cuenta()
    s = login(email)
    robado = renovar(s['tokenRenovacion'])[1]      # el atacante se adelanta
    estado, cuerpo = renovar(s['tokenRenovacion'])  # la app de la persona, con el suyo
    assert estado == 401 and cuerpo['codigo'] == 'SESION_CERRADA_POR_SEGURIDAD'
    assert reventa(robado['token']) == 401
    assert renovar(robado['tokenRenovacion'])[0] == 401
    print('  cuando la persona vuelve, el atacante también queda fuera')

    print('\n### Dos renovaciones simultáneas con el mismo token')
    _, email = cuenta()
    s = login(email)
    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = list(pool.map(lambda _: renovar(s['tokenRenovacion']), range(2)))
    estados = sorted(e for e, _ in resultados)
    assert estados != [200, 200], 'no pueden salir dos sesiones de un mismo token'
    assert sql(f"SELECT (revocada_en IS NOT NULL)::text FROM sesiones WHERE jti = '{contenido(s['token'])['jti']}'") == 'true'
    print(f'  {estados}: se trata como reutilización y la sesión se cierra (la app no debe hacerlo)')


def tokens_falsos():
    print('\n### Un token inventado no toca ninguna sesión')
    _, email = cuenta()
    s = login(email)
    bytes_ = bytearray(base64.urlsafe_b64decode(s['tokenRenovacion'] + '=='))
    for posicion in (0, 16, 19, 30, 51):  # id, generación y firma
        alterado = bytes(bytes_[:posicion]) + bytes([bytes_[posicion] ^ 1]) + bytes(bytes_[posicion + 1:])
        estado, cuerpo = renovar(base64.urlsafe_b64encode(alterado).decode().rstrip('='))
        assert estado == 401 and cuerpo['codigo'] == 'SESION_TERMINADA', (posicion, estado, cuerpo)
    # Mismo id de sesión, generación anterior... pero sin la firma: no puede cerrarla.
    for malo in ('', 'x' * 70, s['token'], 'a' * 300):
        assert renovar(malo)[0] in (400, 401), malo
    assert pedir(f'{API}/sesiones/renovar', 'POST', cuerpo={})[0] in (400, 401)
    assert renovar(s['tokenRenovacion'])[0] == 200
    print('  cambiar cualquier byte → 401, y la sesión real sigue renovando')


def roles_y_estado():
    print('\n### Renovar lee los roles de la base')
    id_, email = cuenta(('Cliente',))
    s = login(email)
    sql(f"""INSERT INTO usuarios_roles (usuario_id, rol_id) SELECT '{id_}', id FROM roles WHERE nombre = 'Personal';
            DELETE FROM usuarios_roles WHERE usuario_id = '{id_}'
              AND rol_id = (SELECT id FROM roles WHERE nombre = 'Cliente')""")
    assert reventa(s['token']) == 200, 'el acceso vigente conserva sus roles hasta caducar'
    estado, r = renovar(s['tokenRenovacion'])
    assert estado == 200 and r['roles'] == ['Personal'], (estado, r)
    assert contenido(r['token'])['roles'] == ['Personal']
    assert reventa(r['token']) == 403
    print('  quitado el rol Cliente: el token renovado ya no entra a la reventa (403)')

    print('\n### Bloqueo por intentos (CU-027D) desde fuera: la persona sigue dentro')
    _, email = cuenta()
    s = login(email)
    for i in range(5):
        pedir(f'{API}/sesiones', 'POST', cuerpo={'email': email, 'contrasena': f'intruso {i}'})
    assert sql(f"SELECT bloqueada_hasta > now() FROM usuarios WHERE email = '{email}'") == 't'
    assert renovar(s['tokenRenovacion'])[0] == 200
    print('  la cuenta está bloqueada para logins, pero la sesión abierta renueva')


def lo_que_cierra_sesiones():
    print('\n### Lo que ya cerraba sesiones también impide renovar')
    _, email = cuenta()
    s = login(email)
    assert pedir(f'{API}/sesiones/actual', 'DELETE', s['token'])[0] == 200
    # Un cierre normal no se anuncia como incidente de seguridad.
    assert renovar(s['tokenRenovacion'])[1]['codigo'] == 'SESION_TERMINADA'
    print('  cerrar sesión')

    _, email = cuenta()
    esta, otra = login(email), login(email)
    estado, _ = pedir(f'{API}/cuentas/perfil/contrasena', 'PUT', esta['token'],
                      {'contrasenaActual': DEMO, 'contrasenaNueva': 'otra frase de paso larga'})
    assert estado == 200
    assert renovar(otra['tokenRenovacion'])[0] == 401
    assert renovar(esta['tokenRenovacion'])[0] == 200
    print('  cambiar la contraseña: la otra sesión no renueva; la que hizo el cambio sí')

    id_, email = cuenta()
    s = login(email)
    token_admin = login('admin@hexacore.com')['token']
    estado, _ = pedir(f'{API}/admin/cuentas/{id_}/desactivar', 'POST', token_admin, {'motivo': 'Prueba de renovación'})
    assert estado == 200
    assert renovar(s['tokenRenovacion'])[0] == 401
    print('  desactivar la cuenta (CU-027B)')

    # Cuenta desactivada a mano, sin cerrar sesiones: la renovación lo detecta.
    id_, email = cuenta()
    s = login(email)
    sql(f"UPDATE usuarios SET estado = 'DESACTIVADA' WHERE id = '{id_}'")
    assert renovar(s['tokenRenovacion'])[0] == 401
    assert admin_vale(s['token']) == 401
    print('  una cuenta no activa no renueva, y su sesión queda cerrada')


def ventana_de_30_dias():
    print('\n### 30 días sin uso, y cada renovación los reinicia')
    _, email = cuenta()
    s = login(email)
    jti = contenido(s['token'])['jti']
    sql(f"UPDATE sesiones SET renovacion_expira_en = now() + interval '1 hour' WHERE jti = '{jti}'")
    estado, r = renovar(s['tokenRenovacion'])
    assert estado == 200
    dias = float(sql(f"SELECT extract(epoch FROM renovacion_expira_en - now()) / 86400 FROM sesiones WHERE jti = '{jti}'"))
    assert 29.9 < dias <= 30.1, dias
    print('  a una hora de caducar, renovar la devuelve a 30 días (no hay tope absoluto)')

    sql(f"UPDATE sesiones SET renovacion_expira_en = now() - interval '1 second' WHERE jti = '{jti}'")
    estado, cuerpo = renovar(r['tokenRenovacion'])
    assert estado == 401 and cuerpo['codigo'] == 'SESION_TERMINADA', (estado, cuerpo)
    print('  pasados los 30 días sin uso: 401')


def cliente_web():
    print('\n### Clientes web: el token de renovación va en una cookie HttpOnly (§22)')
    import http.cookiejar
    _, email = cuenta()
    jar = http.cookiejar.CookieJar()
    abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def web(ruta, metodo='POST', cuerpo=None, token=None, cabecera_web=True):
        cabeceras = {'Content-Type': 'application/json', 'Origin': 'http://localhost:4200'}
        if cabecera_web:
            cabeceras['X-Hexacore-Cliente'] = 'web'
        if token:
            cabeceras['Authorization'] = f'Bearer {token}'
        req = urllib.request.Request(f'{API}/{ruta}', method=metodo, headers=cabeceras,
                                     data=json.dumps(cuerpo if cuerpo is not None else {}).encode())
        try:
            with abridor.open(req, timeout=30) as r:
                return r.status, json.load(r), r.headers
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b'{}'), e.headers

    estado, s, cab = web('sesiones', cuerpo={'email': email, 'contrasena': DEMO})
    assert estado == 200 and s['token'] and 'tokenRenovacion' not in s, s
    galleta = cab.get('Set-Cookie')
    for atributo in ('hxc_renovacion=', 'HttpOnly', 'SameSite=Strict', 'Path=/api/v1/sesiones'):
        assert atributo in galleta, galleta
    assert cab.get('Access-Control-Allow-Origin') == 'http://localhost:4200'
    assert cab.get('Access-Control-Allow-Credentials') == 'true'
    print('  login: el cuerpo no trae el token de renovación; la cookie es HttpOnly, SameSite=Strict, solo para /sesiones')

    estado, r, cab = web('sesiones/renovar')
    assert estado == 200 and 'tokenRenovacion' not in r and 'hxc_renovacion=' in cab.get('Set-Cookie', ''), (estado, r)
    assert contenido(r['token'])['jti'] == contenido(s['token'])['jti']
    print('  renovar sin cuerpo, con la cookie: token nuevo y cookie nueva')

    # Sin la cabecera web, la cookie no cuenta: otra página no puede usarla
    # (además, la cabecera obliga al navegador a una comprobación CORS previa).
    estado, r, _ = web('sesiones/renovar', cabecera_web=False)
    assert estado == 401, (estado, r)
    print('  sin X-Hexacore-Cliente, la cookie se ignora')

    acceso = web('sesiones/renovar')[1]['token']
    estado, r, cab = web('sesiones/actual', 'DELETE', token=acceso)
    assert estado == 200 and 'hxc_renovacion=;' in cab.get('Set-Cookie', ''), (estado, cab.get('Set-Cookie'))
    estado, r, _ = web('sesiones/renovar')
    assert estado == 401 and r['codigo'] == 'SIN_SESION', (estado, r)
    print('  cerrar sesión borra la cookie; renovar después: SIN_SESION (visitante)')

    # Una cookie que ya no vale se borra al primer intento, y se distingue del visitante.
    _, email = cuenta()
    jar.clear()
    web('sesiones', cuerpo={'email': email, 'contrasena': DEMO})
    otra = login(email)
    pedir(f'{API}/cuentas/perfil/contrasena', 'PUT', otra['token'],
          {'contrasenaActual': DEMO, 'contrasenaNueva': 'otra frase de paso larga'})
    estado, r, cab = web('sesiones/renovar')
    assert estado == 401 and r['codigo'] == 'SESION_TERMINADA', (estado, r)
    assert 'hxc_renovacion=;' in cab.get('Set-Cookie', '')
    print('  cookie de una sesión cerrada: SESION_TERMINADA (el portal avisa) y se borra')

    # CORS: solo los portales conocidos.
    req = urllib.request.Request(f'{API}/sesiones', method='OPTIONS', headers={
        'Origin': 'http://sitio-ajeno.com', 'Access-Control-Request-Method': 'POST'})
    with urllib.request.urlopen(req) as res:
        assert res.headers.get('Access-Control-Allow-Origin') is None
    print('  CORS: un origen ajeno no recibe permiso')


if __name__ == '__main__':
    login_y_renovacion()
    rotacion_y_robo()
    tokens_falsos()
    roles_y_estado()
    lo_que_cierra_sesiones()
    ventana_de_30_dias()
    cliente_web()
    print('\nOK — renovación de sesiones')
