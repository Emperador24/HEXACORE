"""Tres pasadas seriales sin reintentos, imagen/fuentes estables y evidencia sin sobrescritura."""
import importlib.util, json, os, pathlib, subprocess
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    assert p.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(p / 'control')], cwd=ROOT, check=True)
    for i in range(1, 4): assert not list(p.glob(f'*final-{i}*')), 'Conservar cualquier final previa/interrumpida'
    spec = importlib.util.spec_from_file_location('procedencia', HERE / 'procedencia-parqueaderos.py')
    modulo = importlib.util.module_from_spec(spec); spec.loader.exec_module(modulo)
    referencia = modulo.medir()
    for i in range(1, 4):
        fase = f'final-{i}'
        assert modulo.medir() == referencia, 'Cambió la versión/fuentes/imagen'
        (p / ('version-' + fase + '.json')).write_text(json.dumps(referencia, indent=2))
        for nombre, cmd in [('memoria-antes', ['python3', str(HERE / 'medir.py'), fase + '-antes']),
                            ('matriz', ['node', str(HERE / 'parqueaderos-recursos.cjs'), fase]),
                            ('memoria-despues', ['python3', str(HERE / 'medir.py'), fase + '-despues'])]:
            r = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
            (p / (fase + '-' + nombre + '.log')).write_text(r.stdout + r.stderr)
            print(fase, nombre, r.returncode, flush=True)
            if r.returncode: raise SystemExit('Fallo conservado; diagnosticar, sin repetir finales ni ampliar límites')
        d = json.loads((p / (fase + '.json')).read_text())
        assert d['estado'] == 'APROBADO'
        assert modulo.medir() == referencia, 'Cambió la infraestructura durante la pasada'
    print('Tres finales completas con las mismas fuentes/imágenes; no acreditan RNF completos.')
if __name__ == '__main__': main()
