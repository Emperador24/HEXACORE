"""Captura F13 solo en el proyecto E2E: consultas, bloqueos, conexiones y recursos."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--segundos', type=int, default=60)
parser.add_argument('--salida', default='.evidencia-e2e/recursos.jsonl')
args = parser.parse_args()
raiz = Path(__file__).resolve().parents[3]
salida = Path(args.salida).resolve()
salida.parent.mkdir(parents=True, exist_ok=True)
compose = ['docker', 'compose', '-p', 'hexacore-nucleo-e2e', '-f', str(raiz / 'App/backend/test/docker-compose.e2e.yml')]
sql = """
SELECT json_build_object(
 'conexiones', (SELECT coalesce(json_agg(x),'[]') FROM (
   SELECT pid,datname,application_name,state,wait_event_type,wait_event,
     now()-query_start AS duracion,pg_blocking_pids(pid) AS bloqueadores,left(query,2000) AS consulta
   FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend'
 ) x),
 'bloqueos', (SELECT coalesce(json_agg(x),'[]') FROM (
   SELECT l.pid,l.locktype,l.mode,l.granted,l.relation::text AS relacion
   FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.pid<>pg_backend_pid()
 ) x)
);
"""


def ejecutar(comando):
    resultado = subprocess.run(comando, text=True, capture_output=True, timeout=15)
    if resultado.returncode:
        raise RuntimeError(f'{comando[0]} exit {resultado.returncode}: {resultado.stderr}')
    return resultado.stdout


limite = time.monotonic() + args.segundos
proxima_estadistica = 0.0
muestras = 0
with salida.open('w') as archivo:
    while time.monotonic() < limite:
        muestra = {'utc': datetime.now(timezone.utc).isoformat()}
        muestra['postgres'] = json.loads(ejecutar(compose + [
            'exec', '-T', 'postgres', 'psql', '-U', 'cu011_e2e', '-d', 'postgres', '-qAt', '-c', sql]))
        pidfile = raiz / 'App/backend/.evidencia-e2e/servidor.pid'
        if pidfile.exists():
            pid = pidfile.read_text().strip()
            if pid.isdigit():
                proceso = subprocess.run(['ps', '-p', pid, '-o', 'pid,ppid,pcpu,pmem,rss,vsz,state'], text=True, capture_output=True)
                muestra['proceso_nucleo'] = proceso.stdout
        if time.monotonic() >= proxima_estadistica:
            ids = ejecutar(compose + ['ps', '-q']).split()
            muestra['docker'] = [json.loads(linea) for linea in ejecutar([
                'docker', 'stats', '--no-stream', '--format', '{{json .}}', *ids]).splitlines()]
            muestra['logs_postgres'] = ejecutar(compose + ['logs', '--no-color', '--tail', '30', 'postgres'])
            proxima_estadistica = time.monotonic() + 10
        archivo.write(json.dumps(muestra) + '\n')
        archivo.flush()
        muestras += 1
        time.sleep(1)
print(f'{muestras} muestras de consultas/bloqueos y recursos propias en {salida}')
