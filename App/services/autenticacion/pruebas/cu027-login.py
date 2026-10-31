#!/usr/bin/env python3
"""
CU-027 pasos 8-9 y flujo alterno CU-027D: inicio de sesión.

    8. El usuario inicia sesión con sus credenciales.
    9. El sistema valida las credenciales, genera un token de sesión y
       registra el inicio de sesión.

    CU-027D: si se detectan múltiples intentos fallidos, el sistema bloquea
             temporalmente la cuenta.

Además del camino feliz, comprueba lo que el CU-027 exige que NO se note: que
el correo exista o no, y que la cuenta esté bloqueada, no cambian ni la
respuesta ni el tiempo que tarda.

    docker compose -f ../../../infra/docker-compose.yml up -d
    npm run migracion:correr && npm run semilla && npm run start:dev
    python3 pruebas/cu027-login.py
"""

import base64
import concurrent.futures
import hashlib
import hmac
import json
import re
import statistics
import subprocess
import time
import urllib.error
import urllib.request
import uuid

API = 'http://localhost:3002/api/v1'
CORREO = 'http://localhost:3098'
CONTRASENA_DEMO = 'hexacore2026'
CONTRASENA = 'una frase de paso larga'
UMBRAL = 5


def pedir(url, cuerpo=None, metodo='POST', token=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    cabeceras = {'Content-Type': 'application/json'}
    if token:
        cabeceras['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=datos, method=metodo, headers=cabeceras)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def login(email, contrasena):
    return pedir(f'{API}/sesiones', {'email': email, 'contrasena': contrasena})


def cronometrar(email, contrasena):
    inicio = time.perf_counter()
    estado, cuerpo = login(email, contrasena)
    return time.perf_counter() - inicio, estado, cuerpo


def sql(consulta):
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
         '-d', 'administracion', '-tAc', consulta],
        capture_output=True, text=True).stdout.strip()


def buzon(email):
    with urllib.request.urlopen(f'{CORREO}/correos?para={email}', timeout=10) as r:
        return json.load(r)['correos']


def esperar_correo(email, asunto, segundos=10):
    for _ in range(segundos * 2):
        for correo in buzon(email):
            if asunto in correo['asunto']:
                return correo
        time.sleep(0.5)
    return None


def cuenta_activa(nombre='Prueba Login'):
    """Una cuenta nueva por el camino real: registro, correo y verificación."""
    email = f'l{uuid.uuid4().hex[:10]}@hexacore.com'
    pedir(f'{API}/cuentas/registro', {'nombre': nombre, 'email': email, 'contrasena': CONTRASENA})
    correo = esperar_correo(email, 'Verifica tu cuenta')
    assert correo, 'no llegó el correo de verificación'
    token = re.search(r'token=([\w-]+)', correo['texto']).group(1)
    estado, _ = pedir(f'{API}/cuentas/verificar', {'token': token})
    assert estado == 200
    return email


def b64(datos):
    return base64.urlsafe_b64encode(datos).rstrip(b'=').decode()


# --------------------------------------------------------------------------


def camino_feliz():
    print('### Pasos 8-9: login -> token -> sesión registrada')
    email = cuenta_activa('Lucía Login')
    estado, cuerpo = login(email, CONTRASENA)
    assert estado == 200, (estado, cuerpo)
    assert cuerpo['tipo'] == 'Bearer'
    assert cuerpo['usuario']['email'] == email
    assert cuerpo['usuario']['roles'] == ['Cliente'], cuerpo['usuario']
    token = cuerpo['token']

    # El token no lleva datos personales: solo se firma, no se cifra.
    contenido = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '=='))
    assert set(contenido) == {'sub', 'roles', 'jti', 'iat', 'exp', 'iss'}, contenido
    assert email not in token and 'Lucía' not in json.dumps(contenido)

    # Paso 9: "registra el inicio de sesión". Se guarda el jti, no el token.
    fila = sql(f"""SELECT count(*) FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
                   WHERE u.email='{email}' AND s.jti='{contenido['jti']}' AND s.revocada_en IS NULL""")
    assert fila == '1', fila
    assert sql(f"SELECT ultimo_acceso_en IS NOT NULL FROM usuarios WHERE email='{email}'") == 't'
    print('  token emitido · sin datos personales dentro · sesión y último acceso registrados')

    estado, yo = pedir(f'{API}/sesiones/actual', metodo='GET', token=token)
    assert estado == 200 and yo['email'] == email, (estado, yo)
    print('  GET /sesiones/actual reconoce el token')

    print('\n### Mayúsculas en el correo')
    estado, _ = login(email.upper(), CONTRASENA)
    assert estado == 200, estado
    print('  se entra igual escribiendo el correo en mayúsculas')
    return token


def cerrar_sesion(token):
    print('\n### Cerrar sesión revoca el token en el servidor')
    estado, _ = pedir(f'{API}/sesiones/actual', metodo='DELETE', token=token)
    assert estado == 200
    # El token sigue siendo criptográficamente válido y no ha caducado...
    estado, cuerpo = pedir(f'{API}/sesiones/actual', metodo='GET', token=token)
    # ...pero ya no se acepta.
    assert estado == 401 and cuerpo['codigo'] == 'SIN_AUTENTICAR', (estado, cuerpo)
    print('  tras cerrar sesión, el mismo token recibe 401')


def tokens_falsos():
    print('\n### Tokens falsificados')
    admin = sql("SELECT id FROM usuarios WHERE email='admin@hexacore.com'")
    ahora = int(time.time())
    contenido = {'sub': admin, 'roles': ['Administrador'], 'jti': str(uuid.uuid4()),
                 'iat': ahora, 'exp': ahora + 3600, 'iss': 'hexacore-administracion'}

    # alg: none — sin firma.
    sin_firma = f"{b64(json.dumps({'alg': 'none', 'typ': 'JWT'}).encode())}.{b64(json.dumps(contenido).encode())}."
    # Firmado con otro secreto.
    cabecera = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    cuerpo = b64(json.dumps(contenido).encode())
    firma = b64(hmac.new(b'otro-secreto', f'{cabecera}.{cuerpo}'.encode(), hashlib.sha256).digest())
    otro_secreto = f'{cabecera}.{cuerpo}.{firma}'

    for nombre, token in [('alg none', sin_firma), ('otro secreto', otro_secreto), ('basura', 'abc')]:
        estado, _ = pedir(f'{API}/sesiones/actual', metodo='GET', token=token)
        assert estado == 401, (nombre, estado)
    estado, _ = pedir(f'{API}/sesiones/actual', metodo='GET')
    assert estado == 401
    print('  alg none, otra clave, basura y sin cabecera: todos 401')


def no_revela_si_el_correo_existe():
    print('\n### Correo inexistente y contraseña incorrecta: misma respuesta, mismo tiempo')
    email = cuenta_activa()
    inexistente = f'nadie{uuid.uuid4().hex[:8]}@hexacore.com'

    e1, c1 = login(inexistente, 'lo que sea largo')
    e2, c2 = login(email, 'contraseña equivocada')
    assert (e1, c1) == (e2, c2), ((e1, c1), (e2, c2))
    assert c1['codigo'] == 'CREDENCIALES_INVALIDAS'

    # Tiempos: se alterna para que ninguno se beneficie del calentamiento.
    # Solo tres fallos sobre la cuenta real, para no llegar al bloqueo.
    t_nadie, t_real = [], []
    for _ in range(3):
        t_nadie.append(cronometrar(inexistente, 'lo que sea largo')[0])
        t_real.append(cronometrar(email, 'contraseña equivocada')[0])
    m_nadie, m_real = statistics.median(t_nadie), statistics.median(t_real)
    print(f'  inexistente {m_nadie*1000:.0f} ms · contraseña mal {m_real*1000:.0f} ms')
    # Sin el señuelo, el inexistente tardaría unos pocos ms frente a ~100.
    assert m_nadie > 0.5 * m_real, 'el correo inexistente responde demasiado rápido: se nota'


def estados_de_cuenta():
    print('\n### Cuentas sin verificar y desactivadas')
    for email, codigo in [('pendiente@hexacore.com', 'CUENTA_NO_VERIFICADA'),
                          ('desactivada@hexacore.com', 'CUENTA_DESACTIVADA')]:
        estado, cuerpo = login(email, CONTRASENA_DEMO)
        assert estado == 403 and cuerpo['codigo'] == codigo, (email, estado, cuerpo)
        # Con la contraseña mal no se cuenta nada del estado.
        estado, cuerpo = login(email, 'no es la contraseña')
        assert estado == 401 and cuerpo['codigo'] == 'CREDENCIALES_INVALIDAS', (email, estado, cuerpo)
        print(f'  {email}: {codigo} solo con la contraseña correcta')
    # Esos fallos no deben dejar las cuentas de demo a medio bloquear.
    sql("UPDATE usuarios SET intentos_fallidos = 0 WHERE email IN ('pendiente@hexacore.com','desactivada@hexacore.com')")


def bloqueo_por_fuerza_bruta():
    print(f'\n### CU-027D: {UMBRAL} fallos seguidos bloquean la cuenta')
    email = cuenta_activa('Bea Bloqueo')

    for i in range(1, UMBRAL):
        login(email, f'intento {i} equivocado')
        assert sql(f"SELECT intentos_fallidos FROM usuarios WHERE email='{email}'") == str(i)
    assert sql(f"SELECT bloqueada_hasta IS NULL FROM usuarios WHERE email='{email}'") == 't'

    estado, cuerpo_fallo = login(email, 'el quinto')
    assert estado == 401
    assert sql(f"SELECT bloqueada_hasta > now() FROM usuarios WHERE email='{email}'") == 't'
    print(f'  al {UMBRAL}º fallo la cuenta queda bloqueada')

    aviso = esperar_correo(email, 'Bloqueamos temporalmente')
    assert aviso, 'no llegó el aviso de bloqueo'
    assert 'token=' not in aviso['texto'], 'el aviso no debe llevar enlace'
    print('  el dueño recibe un correo de aviso, sin enlace')

    # Con la cuenta bloqueada, la contraseña CORRECTA da la misma respuesta que
    # una incorrecta: si no, el atacante seguiría probando y sabría cuándo acierta.
    t_ok, estado, cuerpo_ok = cronometrar(email, CONTRASENA)
    assert (estado, cuerpo_ok) == (401, cuerpo_fallo), (estado, cuerpo_ok)
    t_mal, _, _ = cronometrar(email, 'otra equivocada')
    print(f'  bloqueada: contraseña buena y mala responden igual ({t_ok*1000:.0f} / {t_mal*1000:.0f} ms)')
    assert t_ok > 0.5 * t_mal and t_mal > 0.5 * t_ok

    # Los intentos durante el bloqueo no lo alargan ni suman.
    assert sql(f"SELECT intentos_fallidos FROM usuarios WHERE email='{email}'") == '0'

    # Se simula que pasaron los minutos de bloqueo.
    sql(f"UPDATE usuarios SET bloqueada_hasta = now() - interval '1 second' WHERE email='{email}'")
    estado, _ = login(email, CONTRASENA)
    assert estado == 200, estado
    assert sql(f"SELECT intentos_fallidos || '|' || (bloqueada_hasta IS NULL)::text FROM usuarios WHERE email='{email}'") == '0|true'
    print('  pasado el bloqueo se entra con normalidad y el contador vuelve a cero')

    print('\n### Un acierto reinicia el contador')
    for _ in range(UMBRAL - 1):
        login(email, 'equivocada')
    login(email, CONTRASENA)
    login(email, 'equivocada')
    assert sql(f"SELECT intentos_fallidos FROM usuarios WHERE email='{email}'") == '1'
    print(f'  {UMBRAL - 1} fallos + acierto + fallo = 1, no {UMBRAL} (no se bloquea)')


def rafaga_simultanea():
    print('\n### CU-027D bajo concurrencia: 30 intentos a la vez')
    email = cuenta_activa('Rafa Ráfaga')
    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as pool:
        resultados = list(pool.map(lambda i: login(email, f'ráfaga {i}'), range(30)))
    assert all(e == 401 for e, _ in resultados)

    # Cada fallo se anota con un UPDATE condicional que suma y bloquea a la vez.
    # Si se leyera el contador y luego se escribiera, las 30 leerían "0 fallos",
    # cada una escribiría 1 y la cuenta NO se bloquearía: 30 contraseñas
    # probadas en vez de 5.
    fila = sql(f"""SELECT intentos_fallidos || '|' || coalesce((bloqueada_hasta > now())::text, 'sin bloqueo')
                   FROM usuarios WHERE email='{email}'""")
    assert fila == '0|true', f'la ráfaga no bloqueó la cuenta: {fila}'
    time.sleep(2)
    avisos = [c for c in buzon(email) if 'Bloqueamos' in c['asunto']]
    assert len(avisos) == 1, f'se esperaba un aviso, llegaron {len(avisos)}'
    print('  se evaluaron 5, la cuenta quedó bloqueada y el aviso salió una sola vez')


if __name__ == '__main__':
    token = camino_feliz()
    cerrar_sesion(token)
    tokens_falsos()
    no_revela_si_el_correo_existe()
    estados_de_cuenta()
    bloqueo_por_fuerza_bruta()
    rafaga_simultanea()
    print('\nOK — CU-027 pasos 8-9 y CU-027D')
