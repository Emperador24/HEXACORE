#!/usr/bin/env python3
"""ZAP posterior al despliegue y auditoría npm. Solo publica campos permitidos.
Los mensajes HTTP, evidencias de ZAP y credenciales permanecen privados.
"""
import argparse
import collections
import datetime
import hashlib
import html
import importlib.util
import json
import os
import pathlib
import re
import secrets
import subprocess
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[4]
IMAGEN = 'ghcr.io/zaproxy/zaproxy@sha256:0b8847b2c722b16f0964431aabcbb499560a1f17e8698d52326d82db29efac1d'
RIESGOS = ['Informational', 'Low', 'Medium', 'High']

def ejecutar(args, **kw):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=300, **kw)

def guardar(salida, nombre, d):
    salida.mkdir(parents=True, exist_ok=True)
    (salida / (nombre + '.json')).write_text(json.dumps(d, ensure_ascii=False, indent=2))
    # No se renderiza HTML procedente de respuestas ni de plugins.
    (salida / (nombre + '.html')).write_text('<!doctype html><html lang="es"><meta charset="utf-8">'
        '<title>HEXACORE ' + nombre + '</title><h1>HEXACORE ' + nombre + '</h1><pre>'
        + html.escape(json.dumps(d, ensure_ascii=False, indent=2)) + '</pre></html>')

def sanear_alertas(alertas, destinos):
    origenes = {urllib.parse.urlsplit(v).netloc: k for k, v in destinos.items()}
    resultado = []
    for a in alertas:
        url = urllib.parse.urlsplit(a.get('url', ''))
        # Conserva cada instancia, tipo y severidad. No publica paths dinámicos,
        # parámetros, query, cookies, cuerpos, evidencia, nombres ni referencias.
        plugin = str(a.get('pluginId', ''))
        if not re.fullmatch(r'\d+', plugin) or a.get('risk') not in RIESGOS:
            raise ValueError('ALERTA_SIN_CLASIFICAR')
        resultado.append({'pluginId': plugin, 'riesgo': a['risk'],
            'confianza': a.get('confidence'), 'origen': origenes.get(url.netloc, 'fuera-de-alcance'),
            'metodo': a.get('method') if a.get('method') in ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'] else 'otro',
            'regla': 'https://www.zaproxy.org/docs/alerts/' + plugin + '/'})
    return resultado

def revision(cfg):
    url = cfg.get('versionUrl', cfg['destinos']['api'] + '/version')
    with urllib.request.urlopen(url, timeout=15) as r:
        dato = json.load(r)
    if dato.get('revision') != cfg['revision']:
        raise ValueError('VERSION_DESPLEGADA_NO_COINCIDE')
    return dato['revision']

def escanear(cfg, salida, privada, red=None):
    informe = {'fechaUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'estado': 'incompleto', 'tipoDespliegue': cfg.get('tipoDespliegue'), 'alertas': [],
        'categoriasZAP': RIESGOS, 'criterio': 'cero High; ZAP no tiene Critical',
        'limitaciones': 'Pasivo HTTP, dos SPA y GET de API. Sin ejecución JavaScript, araña ni ataque activo. No sustituye RNF-05/06 ni escaneo de toda la navegación.',
        'saneamiento': 'Todas las instancias; sin URL dinámica, parámetros, evidencia HTTP ni credenciales. Enlace a cada regla.'}
    nombre = 'hexacore-zap-' + secrets.token_hex(5)
    propio = False
    try:
        if not re.fullmatch(r'[a-f0-9]{40}', cfg.get('revision', '')):
            raise ValueError('REVISION_INVALIDA')
        if cfg.get('tipoDespliegue') not in ['ci-efimero', 'presentacion']:
            raise ValueError('TIPO_DESPLIEGUE_INVALIDO')
        for u in cfg['destinos'].values():
            p = urllib.parse.urlsplit(u)
            if p.scheme not in ['http', 'https'] or p.username or p.password or p.query or p.fragment or p.path not in ['', '/']:
                raise ValueError('DESTINO_INVALIDO')
            if cfg['tipoDespliegue'] == 'presentacion':
                if p.scheme != 'https': raise ValueError('HTTPS_REQUERIDO')
                # Certificados con confianza del sistema; sin verify=False ni -k.
                with urllib.request.urlopen(u + '/', timeout=15) as r: r.read(1)
        if not cfg.get('tokens', {}).get('cliente'):
            raise ValueError('FALTA_SESION_DE_ENSAYO')
        informe['revisionGatewayAntes'] = revision(cfg)
        clave = secrets.token_hex(32)
        ejecutar(['docker', 'run', '-d', '--name', nombre, '--memory', '640m', '--cpus', '1',
            '--network', red or 'bridge', IMAGEN, 'zap.sh', '-daemon', '-host', '0.0.0.0', '-port', '8080',
            '-config', 'api.key=' + clave, '-config', 'api.addrs.addr.name=.*',
            '-config', 'api.addrs.addr.regex=true', '-config', 'connection.timeoutInSecs=15',
            '-jvmopts', '-Xmx384m'])
        propio = True
        listo = False
        for _ in range(90):
            r = subprocess.run(['docker', 'exec', nombre, 'python3', '-c',
                "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/',timeout=1)"], capture_output=True)
            if r.returncode == 0: listo = True; break
            time.sleep(1)
        if not listo: raise ValueError('ZAP_NO_INICIA')
        ejecutar(['docker', 'cp', str(pathlib.Path(__file__).with_name('zap.py')), nombre + ':/tmp/zap-hexacore.py'])
        peticion = {**cfg, 'clave': clave}
        r = ejecutar(['docker', 'exec', '-i', nombre, 'python3', '/tmp/zap-hexacore.py', '--interno'], input=json.dumps(peticion))
        privada.mkdir(parents=True, exist_ok=True, mode=0o700)
        crudo = privada / 'zap-privado.json'
        crudo.write_text(r.stdout); crudo.chmod(0o600)
        d = json.loads(r.stdout)
        informe.update({'imagenZAP': IMAGEN, 'versionZAP': d['version'], 'pendientes': d['pendientes'],
            'solicitudes': len(d['solicitudes']), 'autenticadas200': sum(s['autenticada'] and s['estado'] == 200 for s in d['solicitudes']),
            'reglas': [{'id': x['id'], 'habilitada': x['enabled']} for x in d['reglas']],
            'alertas': sanear_alertas(d['alertas'], cfg['destinos'])})
        informe['revisionGatewayDespues'] = revision(cfg)
        informe['conteo'] = dict(collections.Counter(a['riesgo'] for a in informe['alertas']))
        if d['pendientes'] != 0: raise ValueError('ESCANEO_PENDIENTE')
        if any(a['riesgo'] == 'High' for a in informe['alertas']): raise ValueError('ALERTAS_HIGH')
        informe['estado'] = 'aprobado'
        return 0
    except Exception as e:
        # Nunca registrar la excepción HTTP/comando: puede contener un token o cuerpo.
        permitidos = ['REVISION_INVALIDA', 'TIPO_DESPLIEGUE_INVALIDO', 'DESTINO_INVALIDO', 'HTTPS_REQUERIDO',
            'FALTA_SESION_DE_ENSAYO', 'VERSION_DESPLEGADA_NO_COINCIDE', 'ZAP_NO_INICIA', 'ESCANEO_PENDIENTE', 'ALERTAS_HIGH', 'ALERTA_SIN_CLASIFICAR']
        informe['error'] = str(e) if str(e) in permitidos else 'FALLO_DE_HERRAMIENTA_O_CONECTIVIDAD'
        return 1
    finally:
        guardar(salida, 'owasp', informe)
        if propio: ejecutar(['docker', 'stop', '--time', '30', nombre])

def auditar(salida):
    spec = importlib.util.spec_from_file_location('audit_existente', pathlib.Path(__file__).with_name('audit.py'))
    modulo = importlib.util.module_from_spec(spec); spec.loader.exec_module(modulo)
    informe = {'fechaUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'revision': ejecutar(['git', 'rev-parse', 'HEAD'], cwd=ROOT).stdout.strip(),
        'criterio': 'cero Critical; otras severidades conservadas', 'resultados': []}
    codigo = 0
    for nombre, carpeta in modulo.PACKAGES.items():
        for tipo, args in [('produccion', ['--omit=dev']), ('incluye-desarrollo', ['--include=dev'])]:
            r = subprocess.run(['npm', 'audit', '--json', *args], cwd=ROOT / carpeta, text=True, capture_output=True, timeout=180)
            d = json.loads(r.stdout)
            item = {'paquete': nombre, 'alcance': tipo, 'codigoNpm': r.returncode,
                'lockSHA256': hashlib.sha256((ROOT / carpeta / 'package-lock.json').read_bytes()).hexdigest(),
                'vulnerabilidades': d.get('metadata', {}).get('vulnerabilities'), 'hallazgos': []}
            for n, v in d.get('vulnerabilities', {}).items():
                item['hallazgos'].append({'paquete': n, 'severidad': v['severity'], 'directa': v['isDirect'],
                    'rango': v['range'], 'correccionDisponible': bool(v.get('fixAvailable')),
                    'avisos': [x if isinstance(x, str) else {'id': x.get('source'), 'severidad': x.get('severity'), 'rango': x.get('range')} for x in v['via']]})
            if not item['vulnerabilidades'] or d.get('error') or r.returncode not in [0, 1]:
                item['error'] = 'AUDITORIA_INCOMPLETA'; codigo = 1
            elif item['vulnerabilidades']['critical'] > 0: codigo = 1
            informe['resultados'].append(item)
    guardar(salida, 'dependencias', informe)
    return codigo

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('accion', choices=['audit', 'zap'])
    p.add_argument('--salida', type=pathlib.Path, required=True)
    p.add_argument('--config', type=pathlib.Path)
    p.add_argument('--privada', type=pathlib.Path)
    p.add_argument('--red')
    args = p.parse_args()
    if args.accion == 'audit': return auditar(args.salida)
    if not args.config or not args.privada: p.error('zap requiere --config privado y --privada')
    return escanear(json.loads(args.config.read_text()), args.salida, args.privada, args.red)

if __name__ == '__main__': raise SystemExit(main())
