#!/usr/bin/env python3
"""Arranque local persistente. Reutiliza Compose, preparación y semillas del repo."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys

CARPETA = Path(__file__).resolve().parent
RAIZ = CARPETA.parents[2]
ESTADO = CARPETA / '.estado'
PROYECTO = 'hexacore-revision-arquitectura'
BASE = 'hexacore_revision'
USUARIO = 'revision_demo'
SERVICIOS = {'postgres', 'redis', 'rabbitmq', 'pasarela', 'correo', 'preparacion-base',
             'nucleo', 'boleteria', 'trabajador', 'api-gateway', 'portal-web-cliente', 'portal-web-admin'}
COMPILAR = ['nucleo', 'boleteria', 'trabajador', 'api-gateway', 'pasarela', 'correo',
            'portal-web-cliente', 'portal-web-admin']
EJECUTAR = ['nucleo', 'boleteria', 'trabajador', 'api-gateway', 'portal-web-cliente', 'portal-web-admin']
PUERTOS = {15449, 16394, 15689, 16789, 13129, 13128, 13119, 13127, 13120, 18090, 14210, 14211}
ESQUEMAS = "'identidad','alimentos','personal_logistica','entradas_ventas','entradas_catalogo','entradas_postventa','entradas_acceso_qr','finanzas_pagos','eventos_recintos','operacion','parqueaderos'"
PERFIL = 'arquitectura'
DOMINIO = 'revision.localhost'
PUERTO_CLIENTE = 14210
PUERTO_ADMIN = 14211
PUERTO_GATEWAY = 18090
PUERTO_CORREO = 13128
MAPA_PUERTOS = {}

def seleccionar_perfil(perfil):
    global PERFIL, ESTADO, PROYECTO, BASE, DOMINIO, PUERTOS, MAPA_PUERTOS
    global PUERTO_CLIENTE, PUERTO_ADMIN, PUERTO_GATEWAY, PUERTO_CORREO
    PERFIL = perfil
    if perfil == 'cu015':
        ESTADO = CARPETA / '.estado-cu015'
        PROYECTO = 'hexacore-cu015-sebastian'
        BASE = 'hexacore_cu015'
        DOMINIO = 'cu015.localhost'
        MAPA_PUERTOS = dict(zip([15449,16394,15689,16789,13129,13128,13119,13127,13120,18090,14210,14211],
                               [15459,16404,15699,16799,13139,13138,13149,13147,13140,18100,14220,14221]))
        PUERTOS = set(MAPA_PUERTOS.values())
        PUERTO_CLIENTE, PUERTO_ADMIN, PUERTO_GATEWAY, PUERTO_CORREO = 14220,14221,18100,13138

CHECKOUT = hashlib.sha256(str(RAIZ).encode()).hexdigest()[:16]


def ejecutar(args, *, capturar=False, entrada=None, comprobar=True):
    return subprocess.run(args, cwd=RAIZ, env=entorno(), input=entrada, text=True,
                          stdout=subprocess.PIPE if capturar else None,
                          check=comprobar).stdout


def entorno():
    # No heredar .env, HOST_*, POSTGRES_*, COMPOSE_* ni destinos de ensayos A/B.
    permitidas = {'PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG',
                  'SSH_AUTH_SOCK', 'LANG', 'LC_ALL', 'SYSTEMROOT'}
    e = {k: v for k, v in os.environ.items() if k in permitidas}
    e.update(COMPOSE_PARALLEL_LIMIT='1', COMPOSE_BAKE='false',
             REVISION_CHECKOUT=CHECKOUT, REVISION_FUENTE=revision(),
             REVISION_MODIFICADA='si' if modificada() else 'no')
    e.update(REVISION_PROYECTO=PROYECTO, REVISION_BD=BASE, REVISION_USO='cu015' if PERFIL == 'cu015' else 'revision-arquitectura',
             REVISION_ESTADO=str(ESTADO), REVISION_ENLACES=f'http://{DOMINIO}:{PUERTO_CLIENTE}/cuenta')
    e.update({f'REVISION_PUERTO_{a}': str(b) for a,b in MAPA_PUERTOS.items()})
    return e


def git(*args):
    return subprocess.check_output(['git', *args], cwd=RAIZ, text=True).strip()


def revision():
    return git('rev-parse', 'HEAD')


def modificada():
    # Pedidos ajeno no forma parte de las imágenes de esta entrega.
    return bool(git('status', '--porcelain', '--untracked-files=all', '--',
                    'App/backend', 'App/gateway', 'App/infra', 'App/frontend/portal-web-cliente',
                    'App/frontend/portal-web-admin'))


def compose(*args, capturar=False, entrada=None):
    return ejecutar(['docker', 'compose', '--project-name', PROYECTO, '--env-file', '/dev/null',
                     '-f', str(CARPETA.parent / 'docker-compose.yml'),
                     '-f', str(CARPETA / 'docker-compose.yml'), '--profile', 'servicios', *args],
                    capturar=capturar, entrada=entrada)


def exigir(condicion, mensaje):
    if not condicion:
        raise RuntimeError(mensaje)


def validar_configuracion(c):
    exigir(set(c['services']) == SERVICIOS, 'Cambió el inventario de servicios: revisar el override')
    encontrados = set()
    for nombre, s in c['services'].items():
        exigir(not s.get('container_name'), 'Nombre fijo residual: ' + nombre)
        exigir(not s.get('network_mode') and set(s.get('networks', {})) == {'default'}, 'Red ajena: ' + nombre)
        exigir(s['labels'].get('hexacore.checkout') == CHECKOUT, 'Etiqueta ajena: ' + nombre)
        exigir(set(s.get('depends_on', {})) <= SERVICIOS, 'Dependencia ajena: ' + nombre)
        for p in s.get('ports', []):
            exigir(p['host_ip'] == '127.0.0.1', 'Puerto expuesto fuera de loopback')
            encontrados.add(int(p['published']))
        if nombre in COMPILAR or nombre == 'preparacion-base':
            exigir(s['image'].startswith(PROYECTO + '-'), 'Imagen ajena: ' + nombre)
        for v in s.get('volumes', []):
            if v['type'] == 'bind':
                ruta = Path(v['source']).resolve()
                permitidos = {RAIZ / 'App/gateway' / f for f in
                              ('nginx-principal.conf', 'autenticar.conf', 'autenticacion.js')}
                permitidos.add(RAIZ / 'App/backend/modulos/personal-logistica/scripts/seed.mjs')
                exigir(ruta in permitidos or ruta.parent == ESTADO, 'Montaje ajeno: ' + str(ruta))
        e = s.get('environment', {})
        if nombre in ('nucleo', 'boleteria', 'trabajador'):
            exigir(s.get('healthcheck', {}).get('test') == ['CMD', 'sh', '/revision/sonda-salud.sh'],
                   'Sonda HTTP propia modificada: ' + nombre)
        if nombre in ('nucleo', 'boleteria', 'preparacion-base'):
            exigir((e.get('POSTGRES_HOST'), e.get('POSTGRES_BD'), e.get('POSTGRES_USUARIO')) ==
                   ('postgres', BASE, USUARIO), 'Destino SQL ajeno: ' + nombre)
        if nombre in ('nucleo', 'boleteria'):
            exigir(e.get('REDIS_HOST') == 'redis' and e.get('PAGOS_PROVEEDOR_URL') == 'http://pasarela:3099', 'Destino ajeno')
        if nombre in ('nucleo', 'boleteria', 'trabajador'):
            exigir(e.get('RABBITMQ_URL') == 'amqp://revision_demo:revision_demo@rabbitmq:5672/revision', 'Broker ajeno')
        if nombre == 'trabajador':
            exigir(e.get('CORREO_URL_BASE_ENLACES') == f'http://{DOMINIO}:{PUERTO_CLIENTE}/cuenta', 'Enlaces ajenos')
            exigir(not any(k.startswith(('POSTGRES_', 'REDIS_', 'AUTH_JWT_', 'PASARELA_')) for k in e), 'Trabajador con dependencias ajenas')
        if nombre in ('trabajador', 'nucleo'):
            exigir(e.get('CORREO_PROVEEDOR_URL') == 'http://correo:3098', 'Proveedor de correo ajeno')
    exigir(encontrados == PUERTOS, 'Cambió el mapa de puertos')
    for tipo in ('volumes', 'networks'):
        for r in c[tipo].values():
            exigir(not r.get('external') and r['name'].startswith(PROYECTO + '-'), 'Recurso compartido')
    exigir(c['services']['pasarela']['environment']['WEBHOOK_URL'] ==
           'http://api-gateway:8080/api/v1/pagos/webhook', 'Callback ajeno')


def inspeccionar(tipo, nombre):
    p = subprocess.run(['docker', tipo, 'inspect', nombre], text=True, capture_output=True)
    if p.returncode:
        # Ausencia se confirma listando; errores del daemon no se toman por recurso ausente.
        existentes = ejecutar(['docker', tipo, 'ls', '--format', '{{.Name}}' if tipo == 'volume' else '{{.Name}}'], capturar=True)
        exigir(nombre not in existentes.splitlines(), 'No se pudo inspeccionar ' + nombre)
        return None
    return json.loads(p.stdout)[0]


def contenedores_propios():
    ids = ejecutar(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + PROYECTO], capturar=True).split()
    return json.loads(ejecutar(['docker', 'inspect', *ids], capturar=True)) if ids else []


def comprobar_recursos(c, contenedores):
    vistos = set()
    for r in contenedores:
        etiquetas = r['Config']['Labels']
        servicio = etiquetas.get('com.docker.compose.service')
        exigir(etiquetas.get('hexacore.checkout') == CHECKOUT and servicio in SERVICIOS, 'Contenedor ajeno en el proyecto')
        # Los run --rm no deben estar activos durante otro arranque.
        exigir(servicio not in vistos, 'Servicio duplicado: ' + servicio)
        vistos.add(servicio)
    for tipo in ('volume', 'network'):
        for r in c[tipo + 's'].values():
            existente = inspeccionar(tipo, r['name'])
            if existente:
                exigir(existente.get('Labels', {}).get('hexacore.checkout') == CHECKOUT,
                       'Recurso de otro checkout: ' + r['name'])


def comprobar_puertos(contenedores):
    propios = {int(p['HostPort']) for c in contenedores if c['State']['Running']
               for ps in (c['NetworkSettings'].get('Ports') or {}).values() if ps for p in ps}
    for puerto in sorted(PUERTOS - propios):
        with socket.socket() as s:
            try:
                s.bind(('127.0.0.1', puerto))
            except OSError as e:
                raise RuntimeError(f'Puerto {puerto} ocupado fuera de los contenedores de revisión; no se modifica Docker') from e


def comprobar_cierre(contenedores):
    for c in contenedores:
        if c['Config']['Labels']['com.docker.compose.service'] in ('nucleo', 'boleteria', 'trabajador'):
            # Nest vuelve a emitir SIGTERM tras sus hooks: tini lo expresa como 128+15.
            # Mismo contrato que test/base-unica/cerrar-aplicaciones.cjs.
            exigir(c['State']['ExitCode'] in (0, 143) and not c['State']['OOMKilled'],
                   'Cierre incompleto: ' + c['Name'] + '; conservar logs y revisar')


def archivos():
    ESTADO.mkdir(mode=0o700, exist_ok=True)
    privada, publica = ESTADO / 'jwt-privada.pem', ESTADO / 'jwt-publica.pem'
    exigir(privada.exists() == publica.exists(), 'Par de claves incompleto; revisar .estado sin regenerar las existentes')
    if not privada.exists():
        ejecutar(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', str(privada)])
        ejecutar(['openssl', 'pkey', '-in', str(privada), '-pubout', '-out', str(publica)])
        # Contenedores ejecutan con usuario node; carpeta del host privada, archivos montados legibles.
        privada.chmod(0o644)
    original = (RAIZ / 'App/gateway/nginx.conf').read_text()
    patron = r'map \$http_origin \$origen_permitido \{[^}]+\}'
    nuevo, n = re.subn(patron, 'map $http_origin $origen_permitido {\n    default "";\n'
                       f'    "http://{DOMINIO}:{PUERTO_CLIENTE}" $http_origin;\n'
                       f'    "http://{DOMINIO}:{PUERTO_ADMIN}" $http_origin;\n' + '}', original)
    exigir(n == 1, 'Cambió el mapa CORS del gateway: adaptar generación')
    # Escritura sobre el mismo inode: respeta montajes de contenedores ya creados.
    for nombre, contenido in {'gateway.conf': nuevo, 'sonda-salud.sh': (CARPETA / 'sonda-salud.sh').read_text(), 'configuracion.js':
            'window.HEXACORE_CONFIGURACION = ' + json.dumps({'api': f'http://{DOMINIO}:{PUERTO_GATEWAY}/api/v1',
                'buzonDesarrollo': f'http://{DOMINIO}:{PUERTO_CORREO}/correos'}) + ';\n'}.items():
        p = ESTADO / nombre
        if not p.exists() or p.read_text() != contenido:
            p.write_text(contenido)


def sql(consulta):
    return compose('exec', '-T', 'postgres', 'psql', '-X', '-U', USUARIO, '-d', BASE,
                   '-At', '-v', 'ON_ERROR_STOP=1', capturar=True, entrada=consulta).strip()


def estado_demo():
    if sql("SELECT to_regclass('migracion_control.revision_demo') IS NOT NULL;") == 'f':
        return 'SIN_CARGAR'
    return sql('SELECT estado FROM migracion_control.revision_demo WHERE id=1;')


def verificar_vacia():
    conteos = sql(f"""SELECT format('SELECT count(*) FROM %I.%I;',schemaname,tablename)
      FROM pg_tables WHERE schemaname IN ({ESQUEMAS})
      AND tablename NOT IN ('migraciones','migrations')
      AND NOT (schemaname='identidad' AND tablename='roles')
      \\gexec
      SELECT count(*) FROM migracion_control.procedencia WHERE origen<>'instalacion-vacia';
    """)
    exigir(conteos and all(n == '0' for n in conteos.splitlines()), 'Base ocupada/transferida: semillas rechazadas')
    exigir(compose('exec', '-T', 'redis', 'redis-cli', 'DBSIZE', capturar=True).strip() == '0', 'Redis contiene operaciones: no sembrar')
    colas = compose('exec', '-T', 'rabbitmq', 'rabbitmqctl', '-q', 'list_queues', '-p', 'revision',
                   'name', 'messages', '--formatter=json', capturar=True)
    exigir(all(q['messages'] == 0 for q in json.loads(colas)), 'RabbitMQ contiene mensajes: no sembrar')


def sembrar():
    exigir(estado_demo() == 'SIN_CARGAR', 'Carga demo ya iniciada/completa: no se repite. Iniciar sin --datos-demo')
    verificar_vacia()
    sql("""CREATE TABLE migracion_control.revision_demo(id integer PRIMARY KEY CHECK(id=1),
        estado text NOT NULL, revision text NOT NULL, creada timestamptz NOT NULL DEFAULT now());
        INSERT INTO migracion_control.revision_demo(id,estado,revision) VALUES(1,'EN_CURSO','""" + revision() + "');")
    for modulo in ['identidad', 'entradas/ventas', 'entradas/catalogo', 'entradas/postventa', 'entradas/acceso-qr', 'alimentos', 'eventos-recintos']:
        compose('run', '--rm', '--no-deps', '-T', 'nucleo', 'node', f'dist/modulos/{modulo}/persistencia/semillas/sembrar.js')
    for i in range(1, 4):
        compose('run', '--rm', '--no-deps', '-T', 'nucleo', 'node',
                'dist/modulos/alimentos/inventario/preparar-inventario.js',
                f'30000000-0000-4000-8000-{i:012}', '--compras-detenidas')


def iniciar(demo, compilar=None):
    contenedores = contenedores_propios()
    comprobar_puertos(contenedores)
    if demo:
        exigir(not any(c['State']['Running'] and c['Config']['Labels']['com.docker.compose.service'] not in
                       {'postgres', 'redis', 'rabbitmq', 'pasarela', 'correo', 'preparacion-base'} for c in contenedores),
               '--datos-demo requiere escritores detenidos; no se resembrará una revisión existente')
        if any(c['State']['Running'] and c['Config']['Labels']['com.docker.compose.service'] == 'postgres' for c in contenedores):
            exigir(estado_demo() == 'SIN_CARGAR', 'Carga demo ya iniciada/completa: usar iniciar sin --datos-demo')
    archivos()
    print('Compilación secuencial desde fuentes:', revision(), '(modificada)' if modificada() else '(limpia)', flush=True)
    for servicio in (COMPILAR if compilar is None else compilar):
        compose('build', servicio)
    compose('up', '--no-build', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'redis', 'rabbitmq', 'correo', 'pasarela')
    # La tarea finita se espera por su código de salida, no por estado running.
    # --wait sobre ese servicio puede rechazar una finalización correcta rápida.
    compose('up', '--no-build', '--no-deps', '--exit-code-from', 'preparacion-base', 'preparacion-base')
    try:
        if demo:
            sembrar()
        else:
            exigir(estado_demo() != 'EN_CURSO', 'Carga demo interrumpida. Se conserva el estado; revisar antes de arrancar escritores')
        # Las dependencias ya se comprobaron; no volver a arrancar la tarea SQL.
        compose('up', '--no-build', '--no-deps', '-d', '--wait', '--wait-timeout', '240', *EJECUTAR)
        if demo:
            compose('exec', '-T', '-e', 'GATEWAY_URL=http://api-gateway:8080/api/v1', 'nucleo', 'node', '/revision/seed-logistica.mjs')
            exigir(sql('SELECT count(*) FROM personal_logistica.empleados;') == '5', 'Semilla logística incompleta')
            exigir(sql('SELECT count(*) FROM personal_logistica.turnos;') == '1', 'Turno demo no creado')
            sql("UPDATE migracion_control.revision_demo SET estado='COMPLETA' WHERE id=1;")
    except (RuntimeError, subprocess.CalledProcessError):
        # Sin borrar ni resembrar: una preparación parcial no habilita escritores.
        compose('stop', '--timeout', '30', 'portal-web-cliente', 'portal-web-admin',
                'api-gateway', 'nucleo', 'boleteria', 'trabajador')
        raise
    print('\nRevisión disponible (demo: ' + estado_demo() + '):\n'
          f'Clientes: http://{DOMINIO}:{PUERTO_CLIENTE}\nAdministración: http://{DOMINIO}:{PUERTO_ADMIN}\n'
          f'Gateway: http://{DOMINIO}:{PUERTO_GATEWAY}/api/v1\n'
          'Guía y credenciales exclusivamente demo: App/infra/revision/README.md', flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--perfil', choices=['arquitectura', 'cu015'], default='arquitectura')
    p.add_argument('accion', choices=['iniciar', 'estado', 'logs', 'parar', 'config'])
    p.add_argument('--compilar', nargs='+', choices=COMPILAR, help='Construir solo los componentes indicados')
    p.add_argument('--datos-demo', action='store_true', help='Solo primera carga explícita sobre recursos vacíos')
    p.add_argument('servicios', nargs='*')
    a = p.parse_args()
    seleccionar_perfil(a.perfil)
    exigir(a.compilar is None or a.accion == 'iniciar', '--compilar solo con iniciar')
    exigir(not a.datos_demo or a.accion == 'iniciar', '--datos-demo solo con iniciar')
    exigir(not a.servicios or (a.accion == 'logs' and set(a.servicios) <= SERVICIOS), 'Servicios solo para logs y del proyecto propio')
    rama = 'feature/sebastian' if PERFIL == 'cu015' else 'feature/sebastian-arquitectura'
    exigir(git('branch', '--show-current') == rama, 'Usar exclusivamente ' + rama)
    for herramienta in ('docker', 'git', 'openssl'):
        exigir(shutil.which(herramienta), 'Falta requisito: ' + herramienta)
    ejecutar(['docker', 'info', '--format', '{{.ServerVersion}}'], capturar=True)
    contexto = os.environ.get('DOCKER_HOST')
    if not contexto:
        contexto = json.loads(ejecutar(['docker', 'context', 'inspect'], capturar=True))[0]['Endpoints']['docker']['Host']
    exigir(contexto.startswith('unix://'), 'Este arranque local requiere Docker local por socket Unix')
    c = json.loads(compose('config', '--format', 'json', capturar=True))
    validar_configuracion(c)  # !override y !reset también exigen Compose >= 2.24.4.
    comprobar_recursos(c, contenedores_propios())
    if a.accion == 'config':
        print(json.dumps(c, indent=2))
        return
    if a.accion == 'estado':
        compose('ps', '-a')
        return
    if a.accion == 'logs':
        compose('logs', '--tail', '150', '-f', *a.servicios)
        return
    # Exclusión de arranques/cargas/paradas simultáneos de este checkout.
    ESTADO.mkdir(mode=0o700, exist_ok=True)
    with (ESTADO / 'operacion.lock').open('w') as bloqueo:
        fcntl.flock(bloqueo, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if a.accion == 'iniciar':
            iniciar(a.datos_demo, a.compilar)
        else:
            compose('stop', '--timeout', '30')  # conserva contenedores, red y volúmenes.
            comprobar_cierre(contenedores_propios())
            print('Núcleo/Boletería/Trabajador: salida 0/143 (SIGTERM), sin OOM ni SIGKILL; volúmenes conservados')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, BlockingIOError) as e:
        print('REVISIÓN INTERRUMPIDA:', e, file=sys.stderr)
        sys.exit(1)
