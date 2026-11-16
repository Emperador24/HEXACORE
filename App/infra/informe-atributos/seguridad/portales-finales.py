#!/usr/bin/env python3
"""Tres mediciones seriales de este bloque. No ejecuta la matriz RNF ni DAST activo.
No sobrescribe evidencia, no reintenta fallos y no interpreta ZAP=0 como sin alertas.
"""
import datetime, hashlib, json, os, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
HERE = pathlib.Path(__file__).resolve().parent

def main():
    out = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    assert out.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(out / 'control')], cwd=ROOT, check=True)
    assert subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip() == 'feature/sebastian'
    assert subprocess.check_output(['node', '--version'], text=True).strip() == 'v22.22.3'
    for i in range(1, 4):
        assert not list(out.glob(f'*final-{i}*')), 'No sobrescribir finales ni una medición incompleta'
        assert not (out / f'zap-final-{i}.json').exists(), 'Usar carpeta nueva para otro ensayo'

    def paso(nombre, cmd, permitidos=(0,)):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        (out / (nombre + '.log')).write_text(r.stdout + r.stderr)
        assert r.returncode in permitidos, nombre + ' falló: diagnosticar salida privada antes de continuar'
        return r

    def imagenes():
        d = {}
        for servicio in ['portal-web-cliente', 'portal-web-admin', 'api-gateway']:
            nombre = 'hexacore-cu015-sebastian-' + servicio + '-1'
            c = json.loads(subprocess.check_output(['docker', 'inspect', nombre]))[0]
            assert c['Config']['Labels']['hexacore.uso'] == 'cu015'
            assert c['State']['Running'] and c['State']['Health']['Status'] == 'healthy'
            d[servicio] = {'imagen': c['Image'], 'revisionEtiqueta': c['Config']['Labels'].get('org.opencontainers.image.revision'), 'fuenteModificadaAlConstruir': c['Config']['Labels'].get('hexacore.fuente.modificada')}
            if servicio.startswith('portal'):
                # Configuración exacta y huella de TODOS los assets ejecutados, sin contenido privado.
                conf = subprocess.check_output(['docker', 'exec', nombre, 'cat', '/etc/nginx/conf.d/default.conf'])
                local = ROOT / 'App/frontend' / servicio / 'nginx.conf'
                assert conf == local.read_bytes(), 'nginx ejecutado distinto de fuentes'
                inventario = subprocess.check_output(['docker', 'exec', nombre, 'sh', '-c',
                    'find /usr/share/nginx/html -type f -exec sha256sum {} \u002b | sort'])
                d[servicio]['sha256Assets'] = hashlib.sha256(inventario).hexdigest()
                d[servicio]['sha256Nginx'] = hashlib.sha256(conf).hexdigest()
        return d

    renovar = """const c=require('./App/infra/informe-atributos/seguridad/comun.cjs');
(async()=>{c.guarda();const f=c.leer('fixture.json'),t={};
for(const a of ['cliente','personal']){const r=await c.peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:f.actores[a].email,contrasena:f.clave}});c.assert.equal(r.estado,200);t[a]=r.datos.token;}
c.guardar('sesiones-zap.json',t);c.assert.equal((await c.peticion('/api/v1/salud')).estado,200);
})().catch(()=>{console.error('Salud/login fallido; revisar entorno sin imprimir credenciales');process.exitCode=1});"""
    referencia = imagenes()
    bloqueos = False
    for i in range(1, 4):
        nombre = f'final-{i}'
        d = {'fechaUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'sha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
             'imagenes': imagenes(), 'audits': {}}
        assert d['imagenes'] == referencia, 'Cambió una imagen entre mediciones'
        paso(nombre + '-memoria-antes', ['python3', str(HERE / 'medir.py'), nombre + '-antes'])
        paso(nombre + '-login', ['node', '-e', renovar])
        for portal in ['cliente', 'admin']:
            carpeta = ROOT / 'App/frontend' / ('portal-web-' + portal)
            d['audits'][portal] = {'sha256Lock': hashlib.sha256((carpeta / 'package-lock.json').read_bytes()).hexdigest()}
            for scope in ['produccion', 'completo']:
                args = ['npm', '--prefix', str(carpeta), 'audit', '--json']
                if scope == 'produccion': args.append('--omit=dev')
                r = paso(nombre + '-audit-' + portal + '-' + scope, args, (0, 1))
                a = json.loads(r.stdout)
                assert 'vulnerabilities' in a and 'metadata' in a
                d['audits'][portal][scope] = a['metadata']['vulnerabilities']
                bloqueos |= bool(a['metadata']['vulnerabilities']['total'])
        paso(nombre + '-csp', ['node', str(HERE / 'csp-portales.cjs'), nombre])
        paso(nombre + '-zap', ['python3', str(HERE / 'zap.py'), nombre])
        z = json.loads((out / ('zap-' + nombre + '.json')).read_text())
        assert z['pendientes'] == 0, 'ZAP no terminó: no acreditar medición completa'
        assert sum(s['autenticada'] and s['estado'] == 200 for s in z['solicitudes']) == 3
        assert all(r['enabled'] == 'true' for r in z['reglas']), 'No suprimir reglas'
        d['zap'] = {'version': z['version'], 'solicitudes': len(z['solicitudes']),
                    'reglas': len(z['reglas']), 'pendientes': z['pendientes'], 'alertas': {}}
        for a in z['alertas']:
            k = a['pluginId']
            x = d['zap']['alertas'].setdefault(k, {'nombre': a['name'], 'riesgo': a['risk'], 'instancias': 0})
            x['instancias'] += 1
        paso(nombre + '-memoria-despues', ['python3', str(HERE / 'medir.py'), nombre + '-despues'])
        (out / ('portales-' + nombre + '.json')).write_text(json.dumps(d, indent=2))
        print(nombre, 'registrado; alertas ZAP:', d['zap']['alertas'], flush=True)
    print('Tres mediciones completas. Revisar alertas/cobertura; no equivale a cumplimiento RNF-05/06.')
    if bloqueos: sys.exit(1)

if __name__ == '__main__':
    main()
