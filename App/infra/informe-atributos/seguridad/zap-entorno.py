#!/usr/bin/env python3
"""ZAP sin salida a Internet: red interna temporal y tres objetivos propios.
No arranca/paraliza proyectos. La alternancia se realiza previamente con la guía.
"""
import json, os, pathlib, secrets, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
IMAGE = 'ghcr.io/zaproxy/zaproxy@sha256:0b8847b2c722b16f0964431aabcbb499560a1f17e8698d52326d82db29efac1d'
NETWORK = 'hexacore-seguridad-sebastian'
CONTAINER = 'hexacore-seguridad-sebastian-zap'
PROJECT = 'hexacore-cu015-sebastian'
TARGETS = {'api-gateway': 'objetivo', 'portal-web-cliente': 'cliente', 'portal-web-admin': 'admin'}

def docker(*args):
    r = subprocess.run(['docker', *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError('Docker '+args[0]+' falló (código '+str(r.returncode)+'); revisar estado privado')
    return r.stdout.strip()

def main():
    output = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    assert output.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(output / 'control')], cwd=ROOT, check=True)
    statefile = output / 'zap-entorno.json'
    if sys.argv[1:] == ['reanudar']:
        state = json.loads(statefile.read_text())
        assert not docker('ps', '-q', '--filter', 'label=com.docker.compose.project=redash')
        for service, alias in TARGETS.items():
            name = PROJECT + '-' + service + '-1'
            c = json.loads(docker('inspect', name))[0]
            assert c['Config']['Labels']['hexacore.uso'] == 'cu015' and c['State']['Running']
            if NETWORK not in c['NetworkSettings']['Networks']:
                docker('network', 'connect', '--alias', alias, NETWORK, name)
        docker('start', state['contenedor'])
        print('ZAP reanudado tras la reconstrucción autorizada de los objetivos propios.')
        return
    if sys.argv[1:] == ['parar']:
        state = json.loads(statefile.read_text())
        c = json.loads(docker('inspect', state['contenedor']))[0]
        assert c['Config']['Labels']['hexacore.uso'] == 'seguridad'
        docker('stop', '--time', '30', state['contenedor'])
        for name in state['conectados']:
            docker('network', 'disconnect', NETWORK, name)
        print('ZAP detenido; red de los objetivos restaurada. Se conservan las salidas privadas.')
        return
    assert sys.argv[1:] == ['iniciar']
    assert not statefile.exists(), 'No sobrescribir estado del scanner'
    assert not docker('ps', '-q', '--filter', 'label=com.docker.compose.project=redash')
    targets = []
    for service, alias in TARGETS.items():
        name = PROJECT + '-' + service + '-1'
        c = json.loads(docker('inspect', name))[0]
        assert c['Config']['Labels']['hexacore.uso'] == 'cu015' and c['State']['Running']
        assert NETWORK not in c['NetworkSettings']['Networks']
        targets.append((name, alias))
    docker('network', 'create', '--internal', '--label', 'hexacore.uso=seguridad', NETWORK)
    key = secrets.token_hex(32)
    state = {'imagen': IMAGE, 'contenedor': CONTAINER, 'conectados': [], 'api': 'http://127.0.0.1:8080', 'clave': key}
    statefile.write_text(json.dumps(state, indent=2));statefile.chmod(0o600)
    try:
        for name, alias in targets:
            docker('network', 'connect', '--alias', alias, NETWORK, name)
            state['conectados'].append(name);statefile.write_text(json.dumps(state, indent=2))
        docker('create', '--name', CONTAINER, '--network', NETWORK, '--label', 'hexacore.uso=seguridad',
               '--memory', '640m', '--cpus', '1', '-e', 'JAVA_OPTS=-Xmx384m -XX:ActiveProcessorCount=2',
               IMAGE, 'zap.sh', '-daemon', '-silent', '-host', '0.0.0.0', '-port', '8080',
               '-config', 'api.key=' + key, '-config', 'api.addrs.addr.name=.*', '-config', 'api.addrs.addr.regex=true')
        docker('start', CONTAINER)
    except Exception:
        print('Arranque incompleto: usar el estado privado para restaurar las conexiones.', file=sys.stderr)
        raise
    print('ZAP iniciado: imagen fijada, API por docker exec, red internal sin otros proyectos/proveedores externos.')

if __name__ == '__main__':
    main()
