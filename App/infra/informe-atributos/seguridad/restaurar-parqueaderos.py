"""Restauración única de los siete Redash iniciales. No recupera HTTP mediante reinicios."""
import datetime, json, os, pathlib, subprocess, time
ROOT = pathlib.Path(__file__).resolve().parents[4]
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    assert p.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(p / 'control')], cwd=ROOT, check=True)
    assert not (p / 'restauracion-parqueaderos.json').exists(), 'No repetir restauración'
    inicial = json.loads((p / 'entorno-inicial.json').read_text())
    assert inicial['dockerActivo']
    def docker(*a): return subprocess.check_output(['docker', *a], text=True)
    def todos(): return json.loads(docker('inspect', *docker('ps', '-aq').split()))
    actuales = todos()
    assert not any(c['State']['Running'] for c in actuales if c['Config']['Labels'].get('com.docker.compose.project') in ['hexacore-cu015-sebastian', 'hexacore-seguridad-parqueaderos-sebastian'])
    redash = [c for c in inicial['contenedores'] if c['proyecto'] == 'redash']
    assert len(redash) == 7 and all(c['estado']['Running'] for c in redash)
    registro = {'inicio': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'pasos': [], 'reintentos': 0}
    def guardar(): (p / 'restauracion-parqueaderos.json').write_text(json.dumps(registro, indent=2))
    guardar()
    def iniciar(servicio):
        previo = next(c for c in redash if c['servicio'] == servicio)
        actual = json.loads(docker('inspect', previo['id']))[0]
        assert actual['Id'] == previo['id'] and not actual['State']['Running']
        r = subprocess.run(['docker', 'compose', '--project-name', 'redash', '-f', 'compose.yaml', 'start', servicio], cwd='/Users/sebastiansanchez/lab03/redash', capture_output=True, text=True)
        registro['pasos'].append({'servicio': servicio, 'codigo': r.returncode}); guardar(); assert r.returncode == 0
    def cgroups():
        return {c['servicio']: docker('exec', c['id'], 'cat', '/sys/fs/cgroup/memory.events') for c in redash}
    def http():
        resultado = {}
        for ruta in ['ping', 'login']:
            r = subprocess.run(['curl', '--silent', '--show-error', '--max-time', '15', '--output', '/dev/null', '--write-out', '%{http_code}', 'http://127.0.0.1:5001/' + ruta], capture_output=True, text=True)
            resultado[ruta] = {'codigoCurl': r.returncode, 'http': r.stdout, 'error': r.stderr.strip()}
        return resultado
    iniciar('postgres'); iniciar('redis')
    limite = time.monotonic() + 30
    while True:
        listo = subprocess.run(['docker', 'exec', 'redash-postgres-1', 'sh', '-c', 'pg_isready -q -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}"'], capture_output=True).returncode == 0
        if listo or time.monotonic() >= limite: break
        time.sleep(1)
    registro['postgresListo'] = listo
    registro['redisPong'] = docker('exec', 'redash-redis-1', 'redis-cli', 'PING').strip() == 'PONG'; guardar()
    assert listo and registro['redisPong'], 'Conservar fallo de disponibilidad, sin reiniciar proveedores'
    for servicio in ['server', 'scheduler', 'worker', 'adhoc_worker', 'scheduled_worker']:
        iniciar(servicio)
        registro['pasos'][-1]['http'] = http()
        # Solo los cgroups ya activos se leen aquí; su contador inicial de arranque queda separado.
        registro['pasos'][-1]['cgroups'] = {c['servicio']: docker('exec', c['id'], 'cat', '/sys/fs/cgroup/memory.events') for c in redash if json.loads(docker('inspect', c['id']))[0]['State']['Running']}
        guardar(); print('Restaurado una vez:', servicio, registro['pasos'][-1]['http'], flush=True)
    registro['cgroupsFinales'] = cgroups()
    finales = todos(); porid = {c['Id']: c for c in finales}; comparaciones = []
    def montajes(ms): return sorted([{k: m.get(k) for k in ['Type', 'Name', 'Source', 'Destination']} for m in ms], key=lambda x: x['Destination'])
    for antes in inicial['contenedores']:
        actual = porid[antes['id']]
        comparaciones.append({'nombre': antes['nombre'], 'idIgual': True, 'imagenIgual': actual['Image'] == antes['imagen'],
            'montajesIguales': montajes(actual['Mounts']) == montajes(antes['montajes']), 'estadoRestaurado': actual['State']['Running'] == antes['estado']['Running'],
            'reiniciosIguales': actual['RestartCount'] == antes['reinicios']})
    registro['originales'] = comparaciones
    nuevos = [c for c in finales if c['Id'] not in {a['id'] for a in inicial['contenedores']}]
    registro['nuevos'] = [{'nombre': c['Name'], 'proyecto': c['Config']['Labels'].get('com.docker.compose.project'), 'activo': c['State']['Running'], 'codigo': c['State']['ExitCode'], 'oom': c['State']['OOMKilled']} for c in nuevos]
    registro['dockerActivo'] = True; registro['fin'] = datetime.datetime.now(datetime.timezone.utc).isoformat(); guardar()
    assert all(all(v for k, v in x.items() if k != 'nombre') for x in comparaciones)
    assert len(nuevos) == 3 and all(not c['State']['Running'] and not c['State']['OOMKilled'] and c['State']['ExitCode'] in [0, 143] for c in nuevos)
    assert all(c['Config']['Labels'].get('com.docker.compose.project') == 'hexacore-seguridad-parqueaderos-sebastian' for c in nuevos)
    print('92 contenedores originales conservados/restaurados; tres de ensayo detenidos; Docker activo.', flush=True)
if __name__ == '__main__': main()
