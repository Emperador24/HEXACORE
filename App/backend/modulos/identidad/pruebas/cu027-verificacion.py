#!/usr/bin/env python3
"""
CU-027 pasos 5-7 y excepción CU-027E: verificación de la cuenta por correo.

    5. El sistema envía un correo de verificación.
    6. El usuario confirma su cuenta desde el enlace recibido.
    7. El sistema activa la cuenta y permite el inicio de sesión.

    CU-027E: el correo no puede enviarse por falla del proveedor; el sistema
             reintenta y notifica al usuario si el error persiste.

La prueba **lee el correo del buzón** y saca de ahí el enlace, igual que haría
una persona: es lo que permite comprobar el camino completo sin inventarse el
token. El proveedor de notificaciones es un contenedor (`hexacore-correo`), no
un doble en memoria — sin una llamada de red real, CU-027E no ocurriría nunca.

    docker compose -f ../../../infra/docker-compose.yml up -d
    npm run migracion:correr && npm run semilla && npm run start:dev
    python3 pruebas/cu027-verificacion.py
"""

import json
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid

API = 'http://localhost:3002/api/v1'
CORREO = 'http://localhost:3098'


def pedir(url, cuerpo=None, metodo='POST'):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r) if r.length != 0 else {}
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def sql(consulta):
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
         '-d', 'administracion', '-tAc', consulta],
        capture_output=True, text=True).stdout.strip()


def buzon(email):
    with urllib.request.urlopen(f'{CORREO}/correos?para={email}', timeout=10) as r:
        return json.load(r)['correos']


def esperar_correo(email, segundos=10):
    """El envío es asíncrono: se espera a que la cola lo entregue."""
    for _ in range(segundos * 2):
        correos = buzon(email)
        if correos:
            return correos[0]
        time.sleep(0.5)
    return None


def registrar(email, nombre='Prueba Verificacion'):
    return pedir(f'{API}/cuentas/registro',
                 {'nombre': nombre, 'email': email, 'contrasena': 'una frase de paso larga'})


def token_del_correo(correo):
    m = re.search(r'token=([\w-]+)', correo['texto'])
    assert m, f'el correo no trae enlace:\n{correo["texto"]}'
    return m.group(1)


def correo_nuevo(prefijo='v'):
    return f'{prefijo}{uuid.uuid4().hex[:10]}@hexacore.com'


def limpiar():
    pedir(f'{CORREO}/correos', metodo='DELETE')


def ciclo_completo():
    print('### Pasos 5-7: registro -> correo -> verificación -> cuenta activa')
    email = correo_nuevo()
    registrar(email, 'Elena Prueba')

    # Paso 5: el correo sale por la cola, fuera del camino de respuesta.
    correo = esperar_correo(email)
    assert correo, 'no llegó el correo de verificación'
    assert 'Verifica tu cuenta' in correo['asunto']
    token = token_del_correo(correo)

    # El enlace apunta al frontend, no a la API: quien lo abre debe ver una
    # pantalla, no un JSON.
    assert 'localhost:4200' in correo['texto'], correo['texto']

    assert sql(f"SELECT estado FROM usuarios WHERE email='{email}'") == 'PENDIENTE_VERIFICACION'

    # Paso 6-7.
    estado, cuerpo = pedir(f'{API}/cuentas/verificar', {'token': token})
    assert estado == 200, (estado, cuerpo)

    fila = sql(f"SELECT estado || '|' || (verificado_en IS NOT NULL)::text FROM usuarios WHERE email='{email}'")
    assert fila == 'ACTIVA|true', fila
    print(f'  correo recibido · enlace usado · cuenta ACTIVA')

    print('\n### El enlace es de un solo uso')
    estado, cuerpo = pedir(f'{API}/cuentas/verificar', {'token': token})
    assert estado == 422 and cuerpo['codigo'] == 'ENLACE_NO_VALIDO', (estado, cuerpo)
    print('  el segundo intento con el mismo enlace se rechaza')

    print('\n### El token no está en la base, solo su hash')
    assert sql(f"SELECT count(*) FROM tokens_cuenta WHERE hash_token='{token}'") == '0'
    # Y el hash guardado tiene la forma que exige el CHECK de la migración.
    forma = sql(f"""SELECT (hash_token ~ '^[0-9a-f]{{64}}$')::text FROM tokens_cuenta
                    WHERE usuario_id = (SELECT id FROM usuarios WHERE email='{email}')""")
    assert forma == 'true', forma
    print('  en la base solo hay un SHA-256 de 64 caracteres')


def enlace_invalido():
    print('\n### Un enlace inventado se rechaza igual que uno usado')
    estado, cuerpo = pedir(f'{API}/cuentas/verificar', {'token': 'x' * 43})
    assert estado == 422 and cuerpo['codigo'] == 'ENLACE_NO_VALIDO'
    # Mismo mensaje que el del enlace ya usado: distinguirlos le diría a quien
    # prueba enlaces al azar si ha acertado con uno real.
    print(f'  {cuerpo["mensaje"]}')


def registro_duplicado_avisa_al_dueno():
    print('\n### El correo de "alguien intentó registrarse con tu dirección"')
    email = correo_nuevo()
    registrar(email, 'Dueña Legítima')
    assert esperar_correo(email), 'no llegó el primer correo'
    limpiar()

    # Segundo registro con el mismo correo: la respuesta es idéntica...
    estado, _ = registrar(email, 'Impostor')
    assert estado == 202

    # ...pero quien tiene la cuenta recibe un aviso distinto.
    correo = esperar_correo(email)
    assert correo, 'no llegó el aviso al dueño de la cuenta'
    assert 'intentó registrarse' in correo['asunto'], correo['asunto']
    # Y sin enlace: ofrecer uno daría a un desconocido forma de provocar
    # acciones sobre una cuenta ajena.
    assert 'token=' not in correo['texto'], 'el aviso no debe llevar enlace'
    print(f'  asunto: {correo["asunto"]}')
    print('  sin enlace, como debe ser')


def cu027e_fallo_pasajero():
    print('\n### CU-027E(a): el proveedor falla y se recupera')
    limpiar()
    email = correo_nuevo()
    # Los dos primeros envíos fallarán con 503.
    pedir(f'{CORREO}/control/fallar?veces=2')
    registrar(email)

    correo = esperar_correo(email, segundos=20)
    assert correo, 'el correo no llegó tras los reintentos'
    print('  tras dos 503, el correo acabó entregándose')


def cu027e_fallo_permanente():
    print('\n### CU-027E(b): dirección que no existe')
    dlq_antes = int(mensajes_en('cuentas.correos.dlq'))
    # El simulador rechaza con 400 cualquier dirección que empiece por "rebota".
    registrar(correo_nuevo('rebota'))

    for _ in range(20):
        time.sleep(0.5)
        if int(mensajes_en('cuentas.correos.dlq')) > dlq_antes:
            break

    assert int(mensajes_en('cuentas.correos.dlq')) == dlq_antes + 1, 'no llegó a la DLQ'
    # Y no se quedó rebotando en la cola de trabajo.
    assert mensajes_en('cuentas.correos') == '0'
    print('  rechazado sin reintentar y guardado en la DLQ')


def mensajes_en(cola):
    salida = subprocess.run(['docker', 'exec', 'hexacore-rabbitmq', 'rabbitmqctl',
                             'list_queues', 'name', 'messages'],
                            capture_output=True, text=True).stdout
    for linea in salida.splitlines():
        partes = linea.split('\t')
        if len(partes) == 2 and partes[0] == cola:
            return partes[1]
    return '0'


if __name__ == '__main__':
    limpiar()
    ciclo_completo()
    enlace_invalido()
    registro_duplicado_avisa_al_dueno()
    cu027e_fallo_pasajero()
    cu027e_fallo_permanente()
    print('\nTODAS LAS ASERCIONES PASARON')
