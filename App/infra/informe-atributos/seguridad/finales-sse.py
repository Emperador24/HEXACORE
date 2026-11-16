"""Tres mediciones de SSE únicamente, sin reintentos ni los 300 controles/16 recorridos."""
import importlib.util, json, os, pathlib, subprocess, time
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve(); assert p.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(p / 'control')], cwd=ROOT, check=True)
    for i in range(1, 4): assert not list(p.glob(f'*final-{i}*')), 'Conservar evidencia previa/interrumpida'
    spec = importlib.util.spec_from_file_location('sse', HERE / 'procedencia-sse.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); referencia = m.medir()
    for i in range(1, 4):
        fase = f'final-{i}'; assert m.medir() == referencia
        (p / ('sse-version-' + fase + '.json')).write_text(json.dumps(referencia, indent=2))
        for nombre, cmd in [('memoria-antes', ['python3', str(HERE / 'medir.py'), 'sse-' + fase + '-antes']),
                            ('matriz', ['node', str(HERE / 'comprobar-sse.cjs'), fase]),
                            ('memoria-despues', ['python3', str(HERE / 'medir.py'), 'sse-' + fase + '-despues'])]:
            r = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
            (p / ('sse-' + fase + '-' + nombre + '.log')).write_text(r.stdout + r.stderr)
            print(fase, nombre, r.returncode, flush=True)
            if r.returncode: raise SystemExit('Fallo conservado, sin relanzar ni ampliar límites')
        # Reanudación prevista después del caso SIGTERM: esperar solo la salud Docker,
        # sin repetir ninguna prueba ni cambiar el contenedor o su límite de cierre.
        meta = json.loads((p / 'entorno-parqueaderos.json').read_text()); limite = time.monotonic() + 12
        while True:
            c = json.loads(subprocess.check_output(['docker', 'inspect', meta['core']]))[0]
            if c['State']['Health']['Status'] == 'healthy': break
            assert time.monotonic() < limite, 'Salud no restablecida tras arranque previsto'
            time.sleep(.2)
        assert m.medir() == referencia, 'Cambio de imagen/fuentes/servicios entre finales'
    print('Tres finales SSE completadas, sin reintentos; cobertura global permanece 113/159.')
if __name__ == '__main__': main()
