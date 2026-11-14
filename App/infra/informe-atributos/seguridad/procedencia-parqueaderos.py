"""Comprueba fuentes, imagen, guardas, gateway e infraestructura propia, sin secretos."""
import hashlib, io, json, os, pathlib, re, subprocess, tarfile
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def ejecutar(*args):
    return subprocess.check_output(args, cwd=ROOT)
def medir():
    assert ejecutar('git', 'branch', '--show-current').decode().strip() == 'feature/sebastian'
    assert not ejecutar('docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=redash').strip()
    m = json.loads((pathlib.Path(os.environ['SEGURIDAD_SALIDA']) / 'entorno-parqueaderos.json').read_text())
    imagenes = {}
    for nombre in [m['core'], m['redis']] + ['hexacore-cu015-sebastian-' + s + '-1' for s in ['postgres', 'rabbitmq', 'correo', 'pasarela', 'api-gateway']]:
        c = json.loads(ejecutar('docker', 'inspect', nombre))[0]
        assert c['State']['Running']
        if c['Config'].get('Healthcheck'): assert c['State']['Health']['Status'] == 'healthy'
        imagenes[nombre] = {'id': c['Id'], 'imagen': c['Image'], 'reinicios': c['RestartCount']}
    assert imagenes[m['core']]['id'] == m['coreId'] and imagenes[m['core']]['imagen'] == m['imagen']
    compilados = {}
    with tarfile.open(fileobj=io.BytesIO(ejecutar('docker', 'cp', m['core'] + ':/app/dist/modulos/parqueaderos', '-'))) as t:
        for e in t.getmembers():
            if not e.isfile() or not e.name.endswith('.js'): continue
            rel = pathlib.PurePosixPath(e.name).relative_to('parqueaderos')
            contenido = t.extractfile(e).read()
            assert contenido == (ROOT / 'App/backend/dist/modulos/parqueaderos' / rel).read_bytes(), str(rel)
            compilados[str(rel)] = hashlib.sha256(contenido).hexdigest()
    fuentes = {}
    archivos = list((ROOT / 'App/backend/modulos/parqueaderos').rglob('*.ts'))
    archivos += [ROOT / 'App/backend/test/parqueaderos/parqueaderos.e2e-spec.ts', ROOT / 'App/gateway/nginx.conf']
    archivos += [HERE / n for n in ['parqueaderos-recursos.cjs', 'parqueaderos-comun.cjs', 'parqueaderos-entorno.cjs', 'preparar-parqueaderos.cjs', 'sondear-parqueaderos.cjs', 'procedencia-parqueaderos.py', 'finales-parqueaderos.py', 'comun.cjs', 'inventario.cjs', 'medir.py']]
    for a in sorted(archivos): fuentes[str(a.relative_to(ROOT))] = hashlib.sha256(a.read_bytes()).hexdigest()
    for remoto, local in [('/etc/nginx/nginx.conf', ROOT / 'App/gateway/nginx-principal.conf'),
                           ('/etc/nginx/conf.d/default.conf', ROOT / 'App/infra/revision/.estado-cu015/gateway.conf'),
                           ('/etc/nginx/hexacore/autenticar.conf', ROOT / 'App/gateway/autenticar.conf'),
                           ('/etc/nginx/njs/autenticacion.js', ROOT / 'App/gateway/autenticacion.js')]:
        with tarfile.open(fileobj=io.BytesIO(ejecutar('docker', 'cp', 'hexacore-cu015-sebastian-api-gateway-1:' + remoto, '-'))) as t:
            contenido = t.extractfile(next(e for e in t.getmembers() if e.isfile())).read()
            assert contenido == local.read_bytes(), 'Gateway distinto del archivo local: ' + remoto
            fuentes[remoto] = hashlib.sha256(contenido).hexdigest()
            if remoto.endswith('/default.conf'):
                patron = r'map \$http_origin \$origen_permitido \{[^}]+\}'
                assert re.sub(patron, 'CORS_LOCAL', contenido.decode()) == re.sub(patron, 'CORS_LOCAL', (ROOT / 'App/gateway/nginx.conf').read_text())
    return {'sha': ejecutar('git', 'rev-parse', 'HEAD').decode().strip(), 'imagenes': imagenes, 'compilados': compilados, 'fuentes': fuentes,
            'node': ejecutar('docker', 'exec', m['core'], 'node', '--version').decode().strip(), 'gatewayCoincide': True,
            'baseNueva': m['baseCreadaVacia'], 'vhostNuevo': m['vhostCreado']}
if __name__ == '__main__': print(json.dumps(medir(), indent=2))
