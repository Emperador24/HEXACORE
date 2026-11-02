#!/usr/bin/env python3
"""
CU-027A (recuperación de contraseña) y CU-027C (edición del perfil).

    CU-027A: si el usuario olvida su contraseña, el sistema envía un enlace de
             recuperación de un solo uso con expiración.
    CU-027C: si el usuario edita su perfil, el sistema valida los nuevos datos
             antes de guardarlos.

    docker compose -f ../../../infra/docker-compose.yml up -d
    npm run migracion:correr && npm run semilla && npm run start:dev
    python3 pruebas/cu027-recuperacion-perfil.py
"""

import concurrent.futures
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
CONTRASENA = 'una frase de paso larga'
NUEVA = 'otra frase distinta y larga'
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


def sql(consulta):
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
         '-d', 'administracion', '-tAc', consulta],
        capture_output=True, text=True).stdout.strip()


def correos(email, asunto):
    with urllib.request.urlopen(f'{CORREO}/correos?para={email}', timeout=10) as r:
        return [c for c in json.load(r)['correos'] if asunto in c['asunto']]


def esperar_correo(email, asunto, cuantos=1, segundos=10):
    for _ in range(segundos * 2):
        encontrados = correos(email, asunto)
        if len(encontrados) >= cuantos:
            return encontrados[0]
        time.sleep(0.5)
    return None


def token_de(correo):
    return re.search(r'token=([\w-]+)', correo['texto']).group(1)


def login(email, contrasena):
    return pedir(f'{API}/sesiones', {'email': email, 'contrasena': contrasena})


def entrar(email, contrasena=CONTRASENA):
    estado, cuerpo = login(email, contrasena)
    assert estado == 200, (estado, cuerpo)
    return cuerpo['token']


def vigente(token):
    return pedir(f'{API}/sesiones/actual', metodo='GET', token=token)[0] == 200


def nueva_cuenta(verificar=True, nombre='Prueba Perfil'):
    email = f'r{uuid.uuid4().hex[:10]}@hexacore.com'
    pedir(f'{API}/cuentas/registro', {'nombre': nombre, 'email': email, 'contrasena': CONTRASENA})
    correo = esperar_correo(email, 'Verifica tu cuenta')
    assert correo, 'no llegó el correo de verificación'
    if verificar:
        assert pedir(f'{API}/cuentas/verificar', {'token': token_de(correo)})[0] == 200
    return email


def solicitar(email):
    return pedir(f'{API}/cuentas/recuperacion', {'email': email})


def pedir_enlace(email):
    estado, _ = solicitar(email)
    assert estado == 202
    correo = esperar_correo(email, 'Restablece tu contraseña')
    assert correo, 'no llegó el correo de recuperación'
    return token_de(correo)


def restablecer(token, contrasena=NUEVA):
    return pedir(f'{API}/cuentas/restablecer', {'token': token, 'contrasenaNueva': contrasena})


def permitir_otro_enlace(email):
    """Simula que pasó el minuto de espera entre enlaces."""
    sql(f"""UPDATE tokens_cuenta SET creado_en = creado_en - interval '2 minutes'
            WHERE usuario_id = (SELECT id FROM usuarios WHERE email='{email}')""")


# ----------------------------------------------------------------- CU-027A


def solicitud_no_revela_nada():
    print('### CU-027A: la solicitud responde igual exista o no la cuenta')
    email = nueva_cuenta()
    casos = {
        'existe': email,
        'no existe': f'nadie{uuid.uuid4().hex[:8]}@hexacore.com',
        'desactivada': 'desactivada@hexacore.com',
    }
    respuestas = {k: solicitar(v) for k, v in casos.items()}
    assert len({json.dumps(r) for r in respuestas.values()}) == 1, respuestas
    assert respuestas['existe'][0] == 202

    assert esperar_correo(email, 'Restablece tu contraseña'), 'no llegó el enlace a la cuenta real'
    for _ in range(5):
        solicitar(email)
    time.sleep(1)
    assert not correos('desactivada@hexacore.com', 'Restablece'), 'una cuenta desactivada no se recupera'
    # Seis solicitudes para la cuenta real, pero un solo correo: la espera de un minuto.
    assert len(correos(email, 'Restablece tu contraseña')) == 1
    print('  solo la cuenta activa recibe enlace, y uno solo aunque se pida seis veces')

    # Tiempos. Antes de cada solicitud sobre la cuenta real se levanta la
    # espera de un minuto: si no, no se haría ningún trabajo y la medida no
    # probaría nada. Esperando al trabajo antes de responder, la cuenta real
    # tarda ~5,5 ms frente a ~1,9 (medido); respondiendo antes, lo mismo.
    tiempos = {k: [] for k in casos}
    for _ in range(15):
        permitir_otro_enlace(email)
        for k, v in casos.items():
            inicio = time.perf_counter()
            solicitar(v)
            tiempos[k].append(time.perf_counter() - inicio)
    medianas = {k: statistics.median(v) * 1000 for k, v in tiempos.items()}
    print('  ' + ' · '.join(f'{k} {m:.1f} ms' for k, m in medianas.items()))
    assert max(medianas.values()) - min(medianas.values()) < 2, medianas
    print('  creando un enlace de verdad en cada solicitud, los tres tardan lo mismo')


def restablecimiento_completo():
    print('\n### CU-027A: enlace -> contraseña nueva')
    email = nueva_cuenta()
    sesion_vieja = entrar(email)
    token = pedir_enlace(email)

    vida = sql(f"""SELECT round(extract(epoch FROM expira_en - creado_en) / 60) FROM tokens_cuenta
                   WHERE tipo='RECUPERACION' AND usuario_id=(SELECT id FROM usuarios WHERE email='{email}')""")
    assert vida == '30', vida
    assert sql(f"SELECT count(*) FROM tokens_cuenta WHERE hash_token='{token}'") == '0'
    print('  el enlace caduca a los 30 min y en la base solo está su hash')

    # Una contraseña débil no gasta el enlace.
    estado, cuerpo = restablecer(token, 'corta')
    assert estado == 422 and cuerpo['codigo'] == 'CONTRASENA_DEBIL', (estado, cuerpo)

    estado, cuerpo = restablecer(token)
    assert estado == 200, (estado, cuerpo)
    print('  una contraseña débil se rechaza sin gastar el enlace; la buena se acepta')

    assert login(email, CONTRASENA)[0] == 401
    assert login(email, NUEVA)[0] == 200
    print('  la contraseña vieja ya no entra; la nueva sí')

    assert not vigente(sesion_vieja), 'la sesión abierta antes del cambio sigue viva'
    print('  la sesión abierta antes del cambio quedó cerrada')

    assert esperar_correo(email, 'Tu contraseña de HEXACORE ha cambiado'), 'no llegó el aviso de cambio'
    print('  llega el aviso de "tu contraseña ha cambiado"')

    estado, cuerpo = restablecer(token, 'y otra frase más larga')
    assert estado == 422 and cuerpo['codigo'] == 'ENLACE_NO_VALIDO', (estado, cuerpo)
    print('  el enlace no sirve dos veces')


def enlaces_invalidos():
    print('\n### CU-027A: enlaces que no deben servir')
    email = nueva_cuenta()
    primero = pedir_enlace(email)
    permitir_otro_enlace(email)
    segundo = pedir_enlace_nuevo(email, primero)

    estado, cuerpo = restablecer(primero)
    assert estado == 422 and cuerpo['codigo'] == 'ENLACE_NO_VALIDO', (estado, cuerpo)
    print('  pedir un enlace nuevo invalida el anterior')

    sql(f"""UPDATE tokens_cuenta SET expira_en = now() - interval '1 second', creado_en = creado_en - interval '1 hour'
            WHERE usuario_id=(SELECT id FROM usuarios WHERE email='{email}') AND usado_en IS NULL""")
    estado, cuerpo = restablecer(segundo)
    assert estado == 422 and cuerpo['codigo'] == 'ENLACE_NO_VALIDO', (estado, cuerpo)
    print('  un enlace caducado se rechaza')

    # Un enlace de VERIFICACIÓN no sirve para restablecer.
    otra = f'r{uuid.uuid4().hex[:10]}@hexacore.com'
    pedir(f'{API}/cuentas/registro', {'nombre': 'Otra', 'email': otra, 'contrasena': CONTRASENA})
    verificacion = token_de(esperar_correo(otra, 'Verifica tu cuenta'))
    estado, cuerpo = restablecer(verificacion)
    assert estado == 422 and cuerpo['codigo'] == 'ENLACE_NO_VALIDO', (estado, cuerpo)
    assert sql(f"SELECT estado FROM usuarios WHERE email='{otra}'") == 'PENDIENTE_VERIFICACION'
    print('  un enlace de verificación no sirve para cambiar la contraseña')


def pedir_enlace_nuevo(email, anterior):
    assert solicitar(email)[0] == 202
    for _ in range(20):
        encontrados = correos(email, 'Restablece tu contraseña')
        if encontrados and token_de(encontrados[0]) != anterior:
            return token_de(encontrados[0])
        time.sleep(0.5)
    raise AssertionError('no llegó el segundo enlace')


def uso_simultaneo():
    print('\n### CU-027A: el mismo enlace usado dos veces a la vez')
    email = nueva_cuenta()
    token = pedir_enlace(email)
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        estados = sorted(e for e, _ in pool.map(lambda i: restablecer(token, f'frase simultánea número {i}'), range(10)))
    assert estados.count(200) == 1, estados
    print(f'  10 peticiones: {estados.count(200)} aceptada, {estados.count(422)} rechazadas')


def desbloquea_y_activa():
    print('\n### CU-027A: saca del bloqueo y de la cuenta sin verificar')
    email = nueva_cuenta()
    for i in range(UMBRAL):
        login(email, f'equivocada {i}')
    assert sql(f"SELECT bloqueada_hasta > now() FROM usuarios WHERE email='{email}'") == 't'
    assert restablecer(pedir_enlace(email))[0] == 200
    assert login(email, NUEVA)[0] == 200
    print('  una cuenta bloqueada por CU-027D vuelve a entrar tras restablecer')

    pendiente = nueva_cuenta(verificar=False)
    assert login(pendiente, CONTRASENA)[1]['codigo'] == 'CUENTA_NO_VERIFICADA'
    assert restablecer(pedir_enlace(pendiente))[0] == 200
    assert sql(f"SELECT estado || '|' || (verificado_en IS NOT NULL)::text FROM usuarios WHERE email='{pendiente}'") == 'ACTIVA|true'
    assert login(pendiente, NUEVA)[0] == 200
    print('  una cuenta sin verificar queda activa: el enlace demostró que el correo es suyo')

    # Desactivada entre la solicitud y el uso del enlace.
    email = nueva_cuenta()
    token = pedir_enlace(email)
    sql(f"UPDATE usuarios SET estado='DESACTIVADA' WHERE email='{email}'")
    estado, cuerpo = restablecer(token)
    assert estado == 422 and cuerpo['codigo'] == 'ENLACE_NO_VALIDO', (estado, cuerpo)
    print('  una cuenta desactivada no se recupera ni con un enlace ya enviado')


# ----------------------------------------------------------------- CU-027C


def perfil_y_validacion():
    print('\n### CU-027C: ver y editar el perfil')
    assert pedir(f'{API}/cuentas/perfil', metodo='GET')[0] == 401
    email = nueva_cuenta(nombre='Pablo Perfil')
    token = entrar(email)

    estado, perfil = pedir(f'{API}/cuentas/perfil', metodo='GET', token=token)
    assert estado == 200 and perfil['email'] == email and perfil['nombre'] == 'Pablo Perfil', perfil
    assert perfil['ultimoAccesoEn'] and perfil['roles'] == ['Cliente']
    assert 'hashContrasena' not in perfil and 'intentosFallidos' not in perfil
    print('  sin token 401; con token, el perfil sin datos internos')

    estado, perfil = pedir(f'{API}/cuentas/perfil', {'nombre': '  Pablo Pérez  '}, 'PATCH', token)
    assert estado == 200 and perfil['nombre'] == 'Pablo Pérez', (estado, perfil)
    assert sql(f"SELECT nombre FROM usuarios WHERE email='{email}'") == 'Pablo Pérez'
    print('  el nombre se guarda recortado')

    malos = [
        ({'nombre': 'P'}, 400, 'entre 2 y 160'),
        ({'nombre': 'x' * 161}, 400, 'entre 2 y 160'),
        ({'nombre': 'Pablo\nAdmin: sí'}, 400, 'no permitidos'),
        ({'nombre': 'Pablo‮oklP'}, 400, 'no permitidos'),
        ({}, 400, 'obligatorio'),
        ({'nombre': 42}, 400, 'obligatorio'),
        ({'nombre': 'Pablo', 'email': 'otro@hexacore.com'}, 422, 'correo no se puede cambiar'),
        ({'nombre': 'Pablo', 'rol': 'Administrador'}, 400, None),
    ]
    for cuerpo, esperado, texto in malos:
        estado, respuesta = pedir(f'{API}/cuentas/perfil', cuerpo, 'PATCH', token)
        mensaje = json.dumps(respuesta, ensure_ascii=False)
        assert estado == esperado, (cuerpo, estado, respuesta)
        assert texto is None or texto in mensaje, (cuerpo, mensaje)
    assert sql(f"SELECT nombre || '|' || email FROM usuarios WHERE email='{email}'") == f'Pablo Pérez|{email}'
    print(f'  {len(malos)} ediciones inválidas rechazadas; nada cambió en la base')

    # El registro usa la misma validación del nombre.
    estado, _ = pedir(f'{API}/cuentas/registro',
                      {'nombre': 'Ana\nOtra', 'email': f'x{uuid.uuid4().hex[:8]}@hexacore.com', 'contrasena': CONTRASENA})
    assert estado == 400
    print('  el registro rechaza lo mismo: no se puede colar un nombre por el otro camino')


def cambio_de_contrasena():
    print('\n### CU-027C: cambiar la contraseña desde la sesión')
    email = nueva_cuenta()
    actual = entrar(email)
    otra = entrar(email)
    url = f'{API}/cuentas/perfil/contrasena'

    casos = [
        ({'contrasenaActual': CONTRASENA, 'contrasenaNueva': 'corta'}, 'CONTRASENA_DEBIL'),
        ({'contrasenaActual': CONTRASENA, 'contrasenaNueva': CONTRASENA}, 'CONTRASENA_DEBIL'),
    ]
    for cuerpo, codigo in casos:
        estado, r = pedir(url, cuerpo, 'PUT', actual)
        assert estado == 422 and r['codigo'] == codigo, (estado, r)
    assert sql(f"SELECT intentos_fallidos FROM usuarios WHERE email='{email}'") == '0'
    print('  nueva débil o igual a la actual: 422, y no cuenta como intento fallido')

    estado, r = pedir(url, {'contrasenaActual': 'no es esta', 'contrasenaNueva': NUEVA}, 'PUT', actual)
    assert estado == 422 and r['codigo'] == 'CONTRASENA_ACTUAL_INCORRECTA', (estado, r)
    assert sql(f"SELECT intentos_fallidos FROM usuarios WHERE email='{email}'") == '1'
    print('  actual incorrecta: 422 (no 401) y sí cuenta como intento fallido')

    estado, r = pedir(url, {'contrasenaActual': CONTRASENA, 'contrasenaNueva': NUEVA}, 'PUT', actual)
    assert estado == 200, (estado, r)
    # Acertar la actual limpia el fallo anterior.
    assert sql(f"SELECT intentos_fallidos FROM usuarios WHERE email='{email}'") == '0'
    assert vigente(actual), 'la sesión desde la que se cambió debe seguir viva'
    assert not vigente(otra), 'las demás sesiones deben cerrarse'
    assert login(email, NUEVA)[0] == 200 and login(email, CONTRASENA)[0] == 401
    assert esperar_correo(email, 'ha cambiado'), 'no llegó el aviso'
    print('  cambiada: esta sesión sigue, la otra se cerró, y llega el aviso por correo')


def fuerza_bruta_desde_la_sesion():
    print('\n### CU-027D desde el perfil: un token robado no permite probar contraseñas sin límite')
    email = nueva_cuenta()
    robado = entrar(email)
    legitima = entrar(email)
    url = f'{API}/cuentas/perfil/contrasena'

    estados = [pedir(url, {'contrasenaActual': f'adivina {i}', 'contrasenaNueva': NUEVA}, 'PUT', robado)[0]
               for i in range(UMBRAL)]
    assert estados == [422] * (UMBRAL - 1) + [429], estados
    assert not vigente(robado) and not vigente(legitima)
    print(f'  {UMBRAL - 1} × 422 y luego 429; todas las sesiones de la cuenta quedaron cerradas')

    assert login(email, CONTRASENA)[0] == 401
    assert esperar_correo(email, 'Bloqueamos temporalmente'), 'no llegó el aviso de bloqueo'
    print('  el login también queda bloqueado y el dueño recibe el aviso')


if __name__ == '__main__':
    solicitud_no_revela_nada()
    restablecimiento_completo()
    enlaces_invalidos()
    uso_simultaneo()
    desbloquea_y_activa()
    perfil_y_validacion()
    cambio_de_contrasena()
    fuerza_bruta_desde_la_sesion()
    print('\nOK — CU-027A y CU-027C')
