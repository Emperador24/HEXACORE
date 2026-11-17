#!/usr/bin/env python3
"""Ensayo exclusivo de herramientas en un runner vacío o un host con capacidad.
No opera ZeroTier ni proyectos previos. Conserva contenedores/datos al detener.
"""
import argparse
import json
import os
import pathlib
import re
import secrets
import shutil
import socket
import subprocess
import time
import urllib.request
from pipeline import ROOT, escanear, guardar

BACKEND = ROOT / 'App/backend'
PUERTOS = [15439, 16384, 15679, 16779, 13105, 13106, 13109, 13117, 13119, 13110, 18082, 8080, 4200, 4201]

def ejecutar(args, **kw):
    r = subprocess.run(args, capture_output=True, text=True, timeout=900, **kw)
    if r.returncode:
        raise RuntimeError('COMANDO_FALLIDO: ' + args[0] + ' (código ' + str(r.returncode) + ')')
    return r.stdout

def guardas(info, libre, ocupados):
    if int(info['MemTotal']) < 6144 * 1024 * 1024: raise ValueError('Motor Docker requiere al menos 6144 MiB; no detener otros proyectos')
    if libre < 12 * 1024**3: raise ValueError('Se requieren 12 GiB libres en el checkout')
    if ocupados: raise ValueError('Puertos ocupados; no modificar ni detener sus propietarios: ' + str(ocupados))

def sondear_puertos():
    ocupados = []
    for puerto in PUERTOS:
        with socket.socket() as s:
            try: s.bind(('127.0.0.1', puerto))
            except OSError: ocupados.append(puerto)
    return ocupados

def compose(c, *args):
    return ejecutar(['docker', 'compose', '-p', c['proyecto'], '-f', str(BACKEND / 'test/docker-compose.e2e.yml'),
        '-f', str(BACKEND / 'test/docker-compose.imagen.yml'), '-f', c['override'], *args],
        env={**os.environ, 'COMPOSE_PARALLEL_LIMIT':'1', 'COMPOSE_BAKE':'false'})

def ids(c):
    return ejecutar(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + c['proyecto']]).split()

def imagen(c, servicio):
    contenedor = compose(c, 'ps', '-q', servicio).strip()
    return ejecutar(['docker', 'inspect', '--format', '{{.Image}}', contenedor]).strip()

def peticion(url):
    with urllib.request.urlopen(url, timeout=10) as r: return r.status

def preparar(privada):
    if (privada / 'entorno.json').exists(): raise ValueError('Ya existe un entorno; no se reutiliza ni borra')
    info = json.loads(ejecutar(['docker', 'info', '--format', '{{json .}}']))
    guardas(info, shutil.disk_usage(ROOT).free, sondear_puertos())
    # En Desktop el df del host no acredita el del motor. No se crea un contenedor para medirlo.
    if info.get('OperatingSystem', '').startswith('Docker Desktop'):
        raise ValueError('Ensayo local Desktop bloqueado: capacidad del disco del motor no acreditada; usar Actions')
    revision = ejecutar(['git', 'rev-parse', 'HEAD'], cwd=ROOT).strip()
    if ejecutar(['git', 'status', '--porcelain'], cwd=ROOT).strip(): raise ValueError('El ensayo exige un commit limpio')
    proyecto = 'hexacore-atributos-' + secrets.token_hex(5)
    if ejecutar(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + proyecto]).strip(): raise ValueError('Proyecto existente')
    privada.mkdir(parents=True, mode=0o700, exist_ok=True)
    (privada / 'configuracion.js').write_text('window.HEXACORE_CONFIGURACION = {};\n')
    nginx = (ROOT / 'App/frontend/portal-web-cliente/nginx.conf').read_text()
    nginx = nginx.replace('  location / {', '  location /ensayo-api/v1/ { proxy_pass http://gateway:8080/api/v1/; }\n  location / {')
    (privada / 'portal.conf').write_text(nginx)
    (privada / 'gateway.conf').write_text((ROOT / 'App/gateway/nginx.conf').read_text())
    servicios = {
        'nucleo': {'environment': {'POSTGRES_ESPERA_MAXIMA_MS': None}, 'networks': {'default': {}}},
        'gateway': {'build': {'args': {'REVISION': revision}}, 'ports': ['127.0.0.1:8080:8080'],
            'networks': {'default': {'aliases': ['objetivo']}},
            'volumes': [str(privada / 'gateway.conf') + ':/etc/nginx/conf.d/default.conf:ro']},
        'cliente': {'build': str(ROOT / 'App/frontend/portal-web-cliente'), 'ports': ['127.0.0.1:4200:4200'],
            'networks': {'default': {'aliases': ['cliente']}},
            'volumes': [str(privada / 'configuracion.js') + ':/usr/share/nginx/html/configuracion.js:ro', str(privada / 'portal.conf') + ':/etc/nginx/conf.d/default.conf:ro']},
        'admin': {'build': str(ROOT / 'App/frontend/portal-web-admin'), 'ports': ['127.0.0.1:4201:4201'],
            'networks': {'default': {'aliases': ['admin']}}}}
    (privada / 'override.json').write_text(json.dumps({'services': servicios}))
    c = {'proyecto': proyecto, 'override': str(privada / 'override.json'), 'revision': revision, 'idsIniciales': ejecutar(['docker', 'ps', '-aq']).split()}
    # Antes del primer recurso; permite el cierre acotado incluso ante un build fallido.
    (privada / 'entorno.json').write_text(json.dumps(c))
    compose(c, 'config', '--quiet')
    print('Configuración válida; construcción serial de artefactos exclusivos.', flush=True)
    compose(c, 'build')
    print('Imágenes construidas; arranque exclusivo y espera de sondas.', flush=True)
    compose(c, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '180')
    c['imagenes'] = {s: imagen(c, s) for s in ['nucleo', 'boleteria', 'gateway', 'cliente', 'admin', 'trabajador']}
    (privada / 'entorno.json').write_text(json.dumps(c))
    return c

def configurar(c, puerto):
    archivo = pathlib.Path(c['override'])
    d = json.loads(archivo.read_text())
    d['services']['nucleo']['environment']['PUERTO'] = str(puerto)
    # Sonda de la imagen usa PUERTO. Se añade 13119 para el destino configurado;
    # la publicación original 13109:3002 se conserva por Compose y deja de servir.
    d['services']['nucleo']['ports'] = ['127.0.0.1:13119:' + str(puerto)]
    archivo.write_text(json.dumps(d))
    gateway = archivo.with_name('gateway.conf')
    gateway.write_text((ROOT / 'App/gateway/nginx.conf').read_text().replace('nucleo:3002', 'nucleo:' + str(puerto)))
    compose(c, 'up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', 'nucleo', 'gateway')

def modificabilidad(c, privada, salida):
    informe = {'revision': c['revision'], 'estado': 'incompleto', 'parametros': [], 'imagenesIniciales': c['imagenes']}
    try:
        print('Modificabilidad: puerto, publicación, gateway y sonda.', flush=True)
        assert peticion('http://127.0.0.1:13109/api/v1/salud') == 200
        assert peticion('http://127.0.0.1:8080/api/v1/salud') == 200
        configurar(c, 3003)
        assert peticion('http://127.0.0.1:13119/api/v1/salud') == 200
        assert peticion('http://127.0.0.1:8080/api/v1/salud') == 200
        contenedor = compose(c, 'ps', '-q', 'nucleo').strip()
        r = subprocess.run(['docker', 'exec', contenedor, 'node', '-e', "fetch('http://127.0.0.1:3002/api/v1/salud').then(()=>process.exit(1)).catch(()=>process.exit(0))"], capture_output=True)
        assert r.returncode == 0
        invalida = subprocess.run(['docker', 'exec', '-e', 'PUERTO=0', contenedor, 'node', '-e', "require('./dist/compartido/config/configuracion').cargarConfiguracionProceso()"], capture_output=True, text=True)
        assert invalida.returncode != 0 and 'Puerto' in invalida.stderr
        informe['parametros'].append({'nombre':'PUERTO', 'predeterminado':3002, 'configurado':3003, 'sondaYGateway':200, 'puertoAnteriorCerrado':True, 'invalidoRechazado':True})
        configurar(c, 3002)
        print('Modificabilidad: límite real de consultas PostgreSQL.', flush=True)
        contenedor = compose(c, 'ps', '-q', 'nucleo').strip()
        espera = []
        script = (BACKEND / 'test/atributos/espera.cjs').read_text()
        for valor in [None, '1000']:
            args = ['docker', 'exec', '-i']
            if valor: args += ['-e', 'POSTGRES_ESPERA_MAXIMA_MS=' + valor]
            texto = ejecutar([*args, contenedor, 'node'], input=script)
            espera.append(json.loads(texto.strip().splitlines()[-1]))
        invalida = subprocess.run(['docker', 'exec', '-e', 'POSTGRES_ESPERA_MAXIMA_MS=499', contenedor, 'node', '-e', "require('./dist/modulos/identidad/comun/config/configuracion').cargarConfiguracion()"], capture_output=True, text=True)
        assert invalida.returncode != 0 and 'entre 500 y 30000' in invalida.stderr
        informe['parametros'].append({'nombre':'POSTGRES_ESPERA_MAXIMA_MS', 'medidas':espera, 'invalidoRechazado':True, 'alcance':'consulta SELECT pg_sleep(4) mediante DataSource compilado de Identidad; no mide carga'})
        navegador = ROOT / 'App/e2e/atributos-configuracion.cjs'
        print('Modificabilidad: peticiones reales del portal y configuración inválida.', flush=True)
        observaciones = []
        for modo, api in [('predeterminada', None), ('externa', '/ensayo-api/v1'), ('invalida', 'javascript:alert(1)')]:
            (privada / 'configuracion.js').write_text('window.HEXACORE_CONFIGURACION = ' + json.dumps({} if api is None else {'api':api}) + ';\n')
            observaciones.append(json.loads(ejecutar(['node', str(navegador), modo]).strip().splitlines()[-1]))
        informe['parametros'].append({'nombre':'HEXACORE_CONFIGURACION.api', 'navegador':observaciones})
        finales = {s: imagen(c, s) for s in c['imagenes']}
        assert finales == c['imagenes'], 'Cambió un artefacto; no acredita enlace tardío'
        informe.update({'imagenesFinales':finales, 'mismasImagenes':True, 'estado':'aprobado'})
    finally:
        (privada / 'configuracion.js').write_text('window.HEXACORE_CONFIGURACION = {};\n')
        guardar(salida, 'modificabilidad', informe)

def comprobar(c, privada, salida):
    print('OWASP: sesión exclusiva y revisión del gateway antes/después.', flush=True)
    ejecutar(['node', str(BACKEND / 'test/atributos/fixture.cjs'), str(privada / 'sesion.json')])
    cfg = {**json.loads((privada / 'sesion.json').read_text()), 'revision': c['revision'], 'tipoDespliegue':'ci-efimero',
        'destinos':{'cliente':'http://cliente:4200', 'admin':'http://admin:4201', 'api':'http://objetivo:8080'},
        'versionUrl':'http://127.0.0.1:8080/version', 'publicas':['/salud','/cartelera','/pagos/configuracion','/cuentas/perfil'], 'autenticadas':[['/cuentas/perfil','cliente']]}
    codigo = escanear(cfg, salida, privada, c['proyecto'] + '_default')
    # Aunque un escaneo falle se comprueban los parámetros independientes.
    modificabilidad(c, privada, salida)
    return codigo

def detener(c):
    if not re.fullmatch(r'hexacore-atributos-[a-f0-9]{10}', c['proyecto']): raise ValueError('Proyecto no autorizado')
    propios = ids(c)
    if set(propios) & set(c['idsIniciales']): raise ValueError('No se detienen recursos previos')
    if propios: ejecutar(['docker', 'stop', '--time', '30', *propios])

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('accion', choices=['preparar','comprobar','detener'])
    p.add_argument('--privada', type=pathlib.Path, required=True)
    p.add_argument('--salida', type=pathlib.Path)
    a = p.parse_args(); privada = a.privada.resolve()
    if a.accion == 'preparar': preparar(privada); return 0
    if not (privada / 'entorno.json').exists(): return 0 if a.accion == 'detener' else 1
    c = json.loads((privada / 'entorno.json').read_text())
    if a.accion == 'detener': detener(c); return 0
    if not a.salida: p.error('comprobar requiere --salida')
    return comprobar(c, privada, a.salida.resolve())

if __name__ == '__main__':
    try: raise SystemExit(main())
    except (ValueError, AssertionError, RuntimeError) as e:
        print('Ensayo incompleto: ' + str(e)); raise SystemExit(1)
