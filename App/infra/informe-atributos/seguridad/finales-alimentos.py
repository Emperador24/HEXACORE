#!/usr/bin/env python3
"""Tres mediciones del alcance Alimentos, con recursos nuevos; ningún reintento."""
import importlib.util, json, os, pathlib, subprocess
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]

def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    assert p.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(p / 'control')], cwd=ROOT, check=True)
    for i in range(1, 4): assert not list(p.glob(f'*final-{i}*')), 'No sobrescribir finales iniciadas'
    spec = importlib.util.spec_from_file_location('procedencia_alimentos', HERE / 'procedencia-alimentos.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    referencia = m.medir()
    for i in range(1, 4):
        fase = f'final-{i}'
        meta = m.medir(); assert meta == referencia, 'Cambiaron imágenes/fuentes/compilados'
        (p / f'version-{fase}.json').write_text(json.dumps(meta, indent=2))
        for nombre, cmd in [
            ('memoria-antes', ['python3', str(HERE / 'medir.py'), fase + '-antes']),
            ('alimentos', ['node', str(HERE / 'alimentos-recursos.cjs'), fase]),
            ('memoria-despues', ['python3', str(HERE / 'medir.py'), fase + '-despues'])]:
            r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
            (p / f'{fase}-{nombre}.log').write_text(r.stdout + r.stderr)
            print(fase, nombre, r.returncode, flush=True)
            if r.returncode: raise SystemExit('Fallo conservado; diagnosticar antes de repetir')
    print('Tres finales completas; sin ampliación DAST ni repetición de recorridos completos.')

if __name__ == '__main__': main()
