#!/usr/bin/env python3
"""
CU-027 pasos 1-4: registro de una cuenta.

Comprueba las cuatro propiedades del registro, y sobre todo la que no se ve
mirando el código: que **el formulario no sirva para averiguar qué correos
están registrados**, ni por la respuesta ni por el tiempo que tarda.

    1. Registro correcto: crea la cuenta PENDIENTE_VERIFICACION con rol Cliente.
    2. Correo repetido: responde exactamente lo mismo y no crea nada.
    3. Validaciones del paso 2 con mensajes claros.
    4. El tiempo de respuesta no distingue un correo existente de uno nuevo.

El punto 4 es el menos evidente. El servicio cifra la contraseña **antes** de
mirar si el correo existe, aunque parezca trabajo desperdiciado: scrypt tarda
~100 ms a propósito, así que si solo se cifrara cuando el correo está libre, un
correo ya registrado respondería mucho más rápido y esa diferencia revelaría
quién tiene cuenta.

    docker compose -f ../../../infra/docker-compose.yml up -d
    npm run migracion:correr && npm run semilla && npm run start:dev
    python3 pruebas/cu027-registro.py
"""

import json
import statistics
import subprocess
import time
import urllib.error
import urllib.request
import uuid

API = 'http://localhost:3002/api/v1'
RESPUESTA_ESPERADA = 'Si el correo no estaba registrado, te enviamos un enlace para verificar tu cuenta.'


def registrar(cuerpo):
    datos = json.dumps(cuerpo).encode()
    req = urllib.request.Request(f'{API}/cuentas/registro', data=datos, method='POST',
                                 headers={'Content-Type': 'application/json'})
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


def resembrar():
    subprocess.run(['npm', 'run', 'semilla'], capture_output=True, check=True)


def correo_nuevo():
    return f'{uuid.uuid4().hex[:12]}@hexacore.com'


def registro_correcto():
    print('### 1. Registro correcto (pasos 1-4)')
    email = correo_nuevo()
    estado, cuerpo = registrar({'nombre': 'Diego Coronado', 'email': email,
                                'contrasena': 'una frase de paso larga'})

    assert estado == 202, (estado, cuerpo)
    assert cuerpo['mensaje'] == RESPUESTA_ESPERADA

    fila = sql(f"""SELECT u.estado || '|' || r.nombre || '|' || coalesce(u.verificado_en::text,'null')
                   FROM usuarios u JOIN usuarios_roles ur ON ur.usuario_id = u.id
                   JOIN roles r ON r.id = ur.rol_id WHERE u.email = '{email}'""")
    cuenta_estado, rol, verificado = fila.split('|')

    # Paso 4: "crea la cuenta con el rol correspondiente (Cliente por defecto)".
    assert rol == 'Cliente', rol
    # La cuenta nace sin verificar: no podrá iniciar sesión hasta los pasos 5-7.
    assert cuenta_estado == 'PENDIENTE_VERIFICACION', cuenta_estado
    assert verificado == 'null'

    # Y lo más importante del paso 4: la contraseña no se guarda.
    hash_guardado = sql(f"SELECT hash_contrasena FROM usuarios WHERE email = '{email}'")
    assert hash_guardado.startswith('scrypt$'), hash_guardado
    assert 'frase de paso' not in hash_guardado

    print(f'  cuenta PENDIENTE_VERIFICACION · rol Cliente · hash scrypt (sin la contraseña)')


def correo_repetido_no_se_nota():
    print('\n### 2. Un correo ya registrado responde EXACTAMENTE igual')
    email = correo_nuevo()
    registrar({'nombre': 'Original', 'email': email, 'contrasena': 'una frase de paso larga'})

    # Segundo intento con el mismo correo, otro nombre y otra contraseña.
    estado, cuerpo = registrar({'nombre': 'Impostor', 'email': email,
                                'contrasena': 'otra frase de paso distinta'})
    assert estado == 202, (estado, cuerpo)
    assert cuerpo['mensaje'] == RESPUESTA_ESPERADA, 'la respuesta delata que el correo existe'

    # Y con otra capitalización: el paso 3 no debe saltarse con una mayúscula.
    estado, cuerpo = registrar({'nombre': 'Impostor', 'email': email.upper(),
                                'contrasena': 'otra frase de paso distinta'})
    assert estado == 202 and cuerpo['mensaje'] == RESPUESTA_ESPERADA

    assert sql(f"SELECT count(*) FROM usuarios WHERE email = '{email}'") == '1'
    # Y el impostor no pisó la cuenta de nadie.
    assert sql(f"SELECT nombre FROM usuarios WHERE email = '{email}'") == 'Original'

    print('  misma respuesta · 1 sola cuenta · el nombre original intacto')


def validaciones_con_mensajes_claros():
    print('\n### 3. Validaciones del paso 2')
    casos = [
        ('sin contraseña', {'nombre': 'X Y', 'email': correo_nuevo()}, 400, 'obligatoria'),
        ('contraseña corta', {'nombre': 'X Y', 'email': correo_nuevo(), 'contrasena': 'corta'}, 422, 'al menos'),
        ('contraseña común', {'nombre': 'X Y', 'email': correo_nuevo(), 'contrasena': 'password123'}, 422, 'común'),
        ('correo inválido', {'nombre': 'X Y', 'email': 'nope', 'contrasena': 'una frase de paso larga'}, 400, 'formato'),
        ('nombre de una letra', {'nombre': 'X', 'email': correo_nuevo(), 'contrasena': 'una frase de paso larga'}, 400, 'entre 2 y 160'),
        # `forbidNonWhitelisted`: sin él, se podría colar un rol en el cuerpo y
        # saltarse el "Cliente por defecto" del paso 4.
        ('rol colado en el cuerpo', {'nombre': 'X Y', 'email': correo_nuevo(),
                                     'contrasena': 'una frase de paso larga', 'rol': 'Administrador'}, 400, 'should not exist'),
    ]
    for nombre, cuerpo, esperado, fragmento in casos:
        estado, respuesta = registrar(cuerpo)
        texto = respuesta.get('message') or respuesta.get('mensaje') or ''
        if isinstance(texto, list):
            texto = '; '.join(texto)
        assert estado == esperado, f'{nombre}: HTTP {estado}, se esperaba {esperado}'
        assert fragmento in texto, f'{nombre}: "{texto}" no menciona "{fragmento}"'
        print(f'  {nombre:<26} {estado}  {texto[:46]}')

    # Ninguno de los rechazos dejó una cuenta a medias.
    assert sql("SELECT count(*) FROM usuarios WHERE nombre = 'X Y'") == '0'


def el_tiempo_no_delata():
    print('\n### 4. El tiempo de respuesta no revela si un correo existe')

    def medir(email):
        inicio = time.perf_counter()
        registrar({'nombre': 'Prueba Tiempo', 'email': email, 'contrasena': 'una frase de paso larga'})
        return (time.perf_counter() - inicio) * 1000

    # Se descarta la primera medición de cada grupo: la primera petición paga
    # el coste de abrir la conexión y no representa el caso normal.
    medir('cliente@hexacore.com')
    existentes = [medir('cliente@hexacore.com') for _ in range(8)]
    medir(correo_nuevo())
    nuevos = [medir(correo_nuevo()) for _ in range(8)]

    mediana_existente = statistics.median(existentes)
    mediana_nuevo = statistics.median(nuevos)
    diferencia = abs(mediana_existente - mediana_nuevo)
    print(f'  correo ya registrado : {mediana_existente:6.1f} ms')
    print(f'  correo nuevo         : {mediana_nuevo:6.1f} ms')
    print(f'  diferencia           : {diferencia:6.1f} ms')

    # El umbral es generoso a propósito: lo que importa es que no haya una
    # diferencia de orden de magnitud (que es lo que pasaría si el cifrado solo
    # ocurriera cuando el correo está libre), no clavar los milisegundos.
    assert diferencia < max(mediana_existente, mediana_nuevo) * 0.35, (
        'el tiempo de respuesta distingue un correo existente de uno nuevo'
    )
    print('  los dos caminos tardan lo mismo')


if __name__ == '__main__':
    resembrar()
    registro_correcto()
    correo_repetido_no_se_nota()
    validaciones_con_mensajes_claros()
    el_tiempo_no_delata()
    print('\nTODAS LAS ASERCIONES PASARON')
