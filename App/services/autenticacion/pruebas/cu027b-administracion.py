#!/usr/bin/env python3
"""
Administración de cuentas: objetivo del CU-027 y flujo alterno CU-027B.

    CU-027:  "el administrador puede además activar, desactivar o eliminar cuentas".
    CU-027B: "si el administrador desactiva una cuenta, el usuario no puede
              iniciar sesión hasta que sea reactivada".

Además de cada transición, comprueba:
  - que desactivar cierra las sesiones abiertas también en la reventa;
  - que eliminar anonimiza sin romper referencias de otros servicios;
  - que nunca se queda el sistema sin administradores, ni con carreras;
  - que la auditoría no se puede editar.

Necesita Administración (3002) y Entradas (3001) en marcha.

    python3 pruebas/cu027b-administracion.py
"""

import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

API = 'http://localhost:3002/api/v1'
REVENTA = 'http://localhost:3001/api/v1'
CORREO = 'http://localhost:3098'
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


def login(email, contrasena=DEMO):
    return pedir(f'{API}/sesiones', 'POST', cuerpo={'email': email, 'contrasena': contrasena})


def entrar(email, contrasena=DEMO):
    estado, cuerpo = login(email, contrasena)
    assert estado == 200, (email, estado, cuerpo)
    return cuerpo['token']


def cuenta(roles=('Cliente',), estado='ACTIVA', prefijo='adm'):
    """Una cuenta nueva con la contraseña de la demo, creada directo en la base."""
    email = f'{prefijo}{uuid.uuid4().hex[:10]}@hexacore.com'
    verificado = 'NULL' if estado == 'PENDIENTE_VERIFICACION' else 'now()'
    id_ = sql(f"""INSERT INTO usuarios (nombre, email, hash_contrasena, estado, verificado_en)
                  SELECT 'Prueba {prefijo}', '{email}', hash_contrasena, '{estado}', {verificado}
                  FROM usuarios WHERE email = 'cliente@hexacore.com' RETURNING id""").split()[0]
    for rol in roles:
        sql(f"""INSERT INTO usuarios_roles (usuario_id, rol_id)
                SELECT '{id_}', id FROM roles WHERE nombre = '{rol}'""")
    return id_, email


def admin(ruta, metodo='GET', token=None, cuerpo=None):
    return pedir(f'{API}/admin/cuentas{ruta}', metodo, token, cuerpo)


def vigente(token):
    return pedir(f'{API}/sesiones/actual', token=token)[0] == 200


# --------------------------------------------------------------------------


def permisos(token_admin):
    print('### Solo administradores, comprobado contra la base')
    assert admin('')[0] == 401
    estado, cuerpo = admin('', token=entrar('cliente@hexacore.com'))
    assert estado == 403 and cuerpo['codigo'] == 'ROL_INSUFICIENTE', (estado, cuerpo)
    estado, _ = admin('', token=entrar('personal@hexacore.com'))
    assert estado == 403
    print('  sin token 401 · Cliente 403 · Personal 403')

    # A alguien le quitan el rol de administrador con la sesión abierta: su
    # token todavía dice "Administrador", pero ya no le sirve.
    id_, email = cuenta(('Administrador',))
    token = entrar(email)
    assert admin('', token=token)[0] == 200
    sql(f"DELETE FROM usuarios_roles WHERE usuario_id = '{id_}'")
    estado, _ = admin('', token=token)
    assert estado == 403, estado
    print('  rol retirado con la sesión abierta: 403 en la siguiente petición')

    assert admin(f'/{uuid.uuid4()}', token=token_admin)[0] == 404
    assert admin('/no-es-uuid', token=token_admin)[0] == 400
    print('  cuenta inexistente 404 · id mal formado 400')


def busqueda(token_admin):
    print('\n### Buscar cuentas')
    _, email = cuenta(prefijo='busca')
    estado, pagina = admin(f'?busqueda={urllib.parse.quote(email.upper())}', token=token_admin)
    assert estado == 200 and pagina['total'] == 1 and pagina['cuentas'][0]['email'] == email, pagina
    assert pagina['cuentas'][0]['roles'] == ['Cliente']
    assert 'hashContrasena' not in json.dumps(pagina) and 'scrypt' not in json.dumps(pagina)
    print('  por correo, sin distinguir mayúsculas; sin datos de la contraseña')

    total = admin('', token=token_admin)[1]['total']
    assert admin('?busqueda=%25', token=token_admin)[1]['total'] < total
    assert admin('?busqueda=_', token=token_admin)[1]['total'] < total
    print('  "%" y "_" se buscan literalmente, no como comodines')

    estado, pagina = admin('?limite=2&desplazamiento=1', token=token_admin)
    assert estado == 200 and len(pagina['cuentas']) == 2 and pagina['total'] == total
    pendientes = admin('?estado=PENDIENTE_VERIFICACION&limite=100', token=token_admin)[1]['cuentas']
    assert pendientes and all(c['estado'] == 'PENDIENTE_VERIFICACION' for c in pendientes)
    for malo in ('?limite=0', '?limite=101', '?estado=BORRADA', '?desplazamiento=-1', '?rol=Administrador'):
        assert admin(malo, token=token_admin)[0] == 400, malo
    print('  paginación y filtro por estado; parámetros inválidos 400')


def desactivar_y_reactivar(token_admin):
    print('\n### CU-027B: desactivar cierra la puerta, también en la reventa')
    id_, email = cuenta()
    telefono, portatil = entrar(email), entrar(email)
    assert pedir(f'{REVENTA}/reventa/mis-entradas', token=telefono)[0] == 200

    estado, cuerpo = admin(f'/{id_}/desactivar', 'POST', token_admin, {})
    assert estado == 400, (estado, cuerpo)
    estado, cuerpo = admin(f'/{id_}/desactivar', 'POST', token_admin, {'motivo': 'x'})
    assert estado == 400 and 'motivo' in json.dumps(cuerpo, ensure_ascii=False), (estado, cuerpo)
    print('  sin motivo, o con uno de 1 carácter: 400')

    estado, resultado = admin(f'/{id_}/desactivar', 'POST', token_admin, {'motivo': 'Reventa fraudulenta'})
    assert estado == 200 and resultado['estado'] == 'DESACTIVADA', (estado, resultado)

    assert not vigente(telefono) and not vigente(portatil)
    estado, _ = pedir(f'{REVENTA}/reventa/mis-entradas', token=telefono)
    assert estado == 401, estado
    print('  sus dos sesiones abiertas quedan cerradas; la reventa también las rechaza')

    estado, cuerpo = login(email)
    assert estado == 403 and cuerpo['codigo'] == 'CUENTA_DESACTIVADA', (estado, cuerpo)
    estado, cuerpo = login(email, 'no es la contraseña')
    assert estado == 401 and cuerpo['codigo'] == 'CREDENCIALES_INVALIDAS'
    print('  login: "cuenta desactivada" solo con la contraseña correcta')

    estado, cuerpo = admin(f'/{id_}/desactivar', 'POST', token_admin, {'motivo': 'Otra vez'})
    assert estado == 409 and cuerpo['codigo'] == 'TRANSICION_NO_VALIDA', (estado, cuerpo)

    estado, resultado = admin(f'/{id_}/activar', 'POST', token_admin, {})
    assert estado == 200 and resultado['estado'] == 'ACTIVA', (estado, resultado)
    assert login(email)[0] == 200
    assert admin(f'/{id_}/activar', 'POST', token_admin, {})[0] == 409
    print('  reactivada: vuelve a entrar; activar dos veces 409')

    estado, detalle = admin(f'/{id_}', token=token_admin)
    acciones = [(a['accion'], a['estadoAnterior'], a['estadoNuevo'], a['sesionesCerradas']) for a in detalle['auditoria']]
    assert acciones == [('REACTIVAR', 'DESACTIVADA', 'ACTIVA', 0),
                        ('DESACTIVAR', 'ACTIVA', 'DESACTIVADA', 2)], acciones
    assert detalle['auditoria'][1]['motivo'] == 'Reventa fraudulenta'
    assert detalle['auditoria'][1]['realizadaPor'] == 'Isabel Rojas'
    print('  auditoría: quién, qué, por qué y cuántas sesiones se cerraron')


def activar_pendiente(token_admin):
    print('\n### Activar una cuenta que nunca verificó el correo')
    email = f'pend{uuid.uuid4().hex[:10]}@hexacore.com'
    pedir(f'{API}/cuentas/registro', 'POST', cuerpo={
        'nombre': 'Pendiente Prueba', 'email': email, 'contrasena': 'una frase de paso larga'})
    enlace = None
    for _ in range(20):
        with urllib.request.urlopen(f'{CORREO}/correos?para={email}') as r:
            correos = json.load(r)['correos']
        if correos:
            enlace = re.search(r'token=([\w-]+)', correos[0]['texto']).group(1)
            break
        time.sleep(0.5)
    assert enlace, 'no llegó el correo'
    id_ = sql(f"SELECT id FROM usuarios WHERE email = '{email}'")
    assert login(email, 'una frase de paso larga')[1]['codigo'] == 'CUENTA_NO_VERIFICADA'

    estado, resultado = admin(f'/{id_}/activar', 'POST', token_admin, {'motivo': 'Verificada por teléfono'})
    assert estado == 200 and resultado['verificadoEn'], (estado, resultado)
    assert login(email, 'una frase de paso larga')[0] == 200
    estado, cuerpo = pedir(f'{API}/cuentas/verificar', 'POST', cuerpo={'token': enlace})
    assert estado == 422 and cuerpo['codigo'] == 'ENLACE_NO_VALIDO'
    assert admin(f'/{id_}', token=token_admin)[1]['auditoria'][0]['accion'] == 'ACTIVAR'
    print('  queda activa con fecha de verificación; el enlace pendiente deja de servir')

    # Desactivar una pendiente: la base exige fecha de verificación a toda
    # cuenta que no esté pendiente.
    id2, _ = cuenta(estado='PENDIENTE_VERIFICACION')
    estado, resultado = admin(f'/{id2}/desactivar', 'POST', token_admin, {'motivo': 'Registro sospechoso'})
    assert estado == 200 and resultado['estado'] == 'DESACTIVADA', (estado, resultado)
    print('  una pendiente también se puede desactivar')


def eliminar(token_admin):
    print('\n### Eliminar = anonimizar')
    id_, email = cuenta(prefijo='borra')
    token = entrar(email)

    assert admin(f'/{id_}', 'DELETE', token_admin, {})[0] == 400
    estado, resultado = admin(f'/{id_}', 'DELETE', token_admin, {'motivo': 'Solicitud de la persona (habeas data)'})
    assert estado == 200 and resultado['eliminada'] and resultado['estado'] == 'DESACTIVADA', (estado, resultado)
    assert resultado['nombre'] == 'Cuenta eliminada' and email not in json.dumps(resultado)
    assert resultado['roles'] == []

    fila = sql(f"""SELECT nombre || '|' || email || '|' || (hash_contrasena LIKE 'scrypt$%')::text
                   || '|' || (SELECT count(*) FROM tokens_cuenta WHERE usuario_id = '{id_}')
                   || '|' || (SELECT count(*) FROM sesiones WHERE usuario_id = '{id_}'
                              AND (direccion_ip IS NOT NULL OR agente_usuario IS NOT NULL OR revocada_en IS NULL))
                   FROM usuarios WHERE id = '{id_}'""")
    assert fila == f'Cuenta eliminada|eliminada-{id_}@cuentas.invalid|false|0|0', fila
    print('  sin nombre, correo, contraseña, roles, enlaces ni datos de sesiones; la fila (y su id) sigue')

    assert not vigente(token)
    assert login(email)[1]['codigo'] == 'CREDENCIALES_INVALIDAS'
    print('  su sesión se cerró y su correo ya no inicia sesión')

    estado, _ = pedir(f'{API}/cuentas/registro', 'POST', cuerpo={
        'nombre': 'Vuelve', 'email': email, 'contrasena': 'una frase de paso larga'})
    nuevo = sql(f"SELECT id FROM usuarios WHERE email = '{email}'")
    assert estado == 202 and nuevo and nuevo != id_, (estado, nuevo)
    print('  el correo queda libre: registrarse de nuevo crea otra cuenta')

    assert admin(f'/{id_}/activar', 'POST', token_admin, {})[0] == 409
    assert admin(f'/{id_}', 'DELETE', token_admin, {'motivo': 'Otra vez'})[0] == 404
    assert id_ not in json.dumps(admin('?limite=100&busqueda=eliminada', token=token_admin)[1])
    assert id_ in json.dumps(admin('?limite=100&busqueda=eliminada&incluirEliminadas=true', token=token_admin)[1])
    print('  no se reactiva, no se elimina dos veces, y el listado la oculta salvo que se pida')

    salida = sql(f"UPDATE auditoria_cuentas SET motivo = 'maquillado' WHERE cuenta_id = '{id_}'")
    assert 'solo inserción' in salida, salida
    salida = sql(f"DELETE FROM usuarios WHERE id = '{id_}'")
    assert 'violates' in salida or 'viola' in salida, salida
    print('  la auditoría no se puede editar, y la cuenta auditada no se puede borrar a mano')


def nunca_sin_administradores():
    print('\n### Nunca sin administradores')
    token_demo = entrar('admin@hexacore.com')
    id_demo = sql("SELECT id FROM usuarios WHERE email = 'admin@hexacore.com'")
    estado, cuerpo = admin(f'/{id_demo}/desactivar', 'POST', token_demo, {'motivo': 'Me voy de vacaciones'})
    assert estado == 422 and cuerpo['codigo'] == 'AUTO_ADMINISTRACION', (estado, cuerpo)
    estado, cuerpo = admin(f'/{id_demo}', 'DELETE', token_demo, {'motivo': 'Me voy de vacaciones'})
    assert estado == 422 and cuerpo['codigo'] == 'AUTO_ADMINISTRACION'
    print('  nadie se desactiva ni se elimina a sí mismo')

    # Mundo con exactamente dos administradores, A y B, que se desactivan el uno
    # al otro a la vez. Sin serializar, los dos verían "queda el otro" y el
    # sistema acabaría sin ninguno. Se retira temporalmente el rol a los demás.
    otros = sql("""SELECT ur.usuario_id FROM usuarios_roles ur JOIN roles r ON r.id = ur.rol_id
                   WHERE r.nombre = 'Administrador'""").split()
    rol_admin = sql("SELECT id FROM roles WHERE nombre = 'Administrador'")
    sql(f"DELETE FROM usuarios_roles WHERE rol_id = '{rol_admin}'")
    try:
        rondas, desenlaces = 8, set()
        for _ in range(rondas):
            id_a, email_a = cuenta(('Administrador',), prefijo='adma')
            id_b, email_b = cuenta(('Administrador',), prefijo='admb')
            token_a, token_b = entrar(email_a), entrar(email_b)
            with ThreadPoolExecutor(max_workers=2) as pool:
                ra = pool.submit(admin, f'/{id_b}/desactivar', 'POST', token_a, {'motivo': 'Carrera A'})
                rb = pool.submit(admin, f'/{id_a}/desactivar', 'POST', token_b, {'motivo': 'Carrera B'})
                estados = sorted([ra.result()[0], rb.result()[0]])
            activos = int(sql("""SELECT count(*) FROM usuarios u JOIN usuarios_roles ur ON ur.usuario_id = u.id
                                 JOIN roles r ON r.id = ur.rol_id
                                 WHERE r.nombre = 'Administrador' AND u.estado = 'ACTIVA'"""))
            assert activos == 1, f'quedaron {activos} administradores activos ({estados})'
            assert estados.count(200) == 1, estados
            # El que pierde recibe una respuesta limpia: 422 (quedaría sin
            # administradores) o 401 (su propia sesión ya se cerró). Sin el
            # bloqueo que serializa, PostgreSQL resolvía la carrera abortando
            # una transacción por interbloqueo, y eso llegaba como un 500.
            assert estados in ([200, 401], [200, 422]), f'respuesta inesperada del perdedor: {estados}'
            desenlaces.add(tuple(estados))
            # Se retira el rol para que no cuenten en la ronda siguiente.
            sql(f"DELETE FROM usuarios_roles WHERE usuario_id IN ('{id_a}', '{id_b}')")
        print(f'  {rondas} carreras A↔B: siempre queda exactamente uno (respuestas vistas: {sorted(desenlaces)})')
    finally:
        for id_ in otros:
            sql(f"INSERT INTO usuarios_roles (usuario_id, rol_id) VALUES ('{id_}', '{rol_admin}') ON CONFLICT DO NOTHING")
    assert admin('', token=token_demo)[0] == 200


if __name__ == '__main__':
    token_admin = entrar('admin@hexacore.com')
    permisos(token_admin)
    busqueda(token_admin)
    desactivar_y_reactivar(token_admin)
    activar_pendiente(token_admin)
    eliminar(token_admin)
    nunca_sin_administradores()
    print('\nOK — CU-027 administración de cuentas y CU-027B')
