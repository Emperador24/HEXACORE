#!/usr/bin/env python3
"""Tres finales seriales de Compras/Reventa; no reintenta ni sobrescribe."""
import importlib.util, json, os, pathlib, subprocess
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]

def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve(); assert p.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(p / 'control')], cwd=ROOT, check=True)
    for i in range(1, 4): assert not list(p.glob(f'*final-{i}*')), 'Conservar una serie iniciada'
    spec = importlib.util.spec_from_file_location('procedencia_ventas', HERE / 'procedencia-ventas.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    referencia = m.medir()
    for i in range(1, 4):
        fase = f'final-{i}'; meta = m.medir(); assert referencia == meta, 'Cambió fuente, imagen o compilado'
        (p / f'version-ventas-{fase}.json').write_text(json.dumps(meta, indent=2))
        for nombre, cmd in [('antes', ['python3', str(HERE / 'medir.py'), fase + '-antes']),
                            ('ventas', ['node', str(HERE / 'ventas-recursos.cjs'), fase]),
                            ('despues', ['python3', str(HERE / 'medir.py'), fase + '-despues'])]:
            r = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
            (p / f'{fase}-{nombre}.log').write_text(r.stdout + r.stderr)
            print(fase, nombre, r.returncode, flush=True)
            if r.returncode: raise SystemExit('Fallo conservado: diagnosticar antes de otra serie')
    print('Tres finales completas; alcance administrativo acreditado solo con ámbito descartable comprobado.')

if __name__ == '__main__': main()
