"""Procedencia de las 16 operaciones y preservación del SSE ya corregido."""
import hashlib, importlib.util, io, pathlib, subprocess, tarfile
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def medir():
    spec = importlib.util.spec_from_file_location('parqueaderos', HERE / 'procedencia-parqueaderos.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); d = m.medir()
    import json, os
    meta = json.loads((pathlib.Path(os.environ['SEGURIDAD_SALIDA']) / 'entorno-parqueaderos.json').read_text())
    compilados = {}
    blob = subprocess.check_output(['docker', 'cp', meta['core'] + ':/app/dist/modulos/eventos-recintos', '-'])
    with tarfile.open(fileobj=io.BytesIO(blob)) as t:
        for e in t.getmembers():
            if not e.isfile() or not e.name.endswith('.js'): continue
            rel = pathlib.PurePosixPath(e.name).relative_to('eventos-recintos'); b = t.extractfile(e).read()
            assert b == (ROOT / 'App/backend/dist/modulos/eventos-recintos' / rel).read_bytes(), str(rel)
            compilados[str(rel)] = hashlib.sha256(b).hexdigest()
    d['compiladosEventos'] = compilados
    archivos = list((ROOT / 'App/backend/modulos/eventos-recintos').rglob('*.ts')) + list((ROOT / 'App/backend/test/eventos').glob('*.ts'))
    archivos += [HERE / n for n in ['preparar-eventos.cjs', 'sondear-eventos.cjs', 'eventos-comun.cjs', 'eventos-recursos.cjs', 'procedencia-eventos.py', 'finales-eventos.py']]
    archivos += [ROOT / 'App/e2e' / n for n in ['package.json','playwright.config.ts','playwright.demo.config.ts','conjunto.cjs','presentacion.ts','cu015/entorno.ts','cu027/cuentas.spec.ts']]
    for p in sorted(archivos): d['fuentes'][str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    assert not subprocess.check_output(['git', 'diff', '56c0fca', '--', 'App/backend/modulos/parqueaderos'], cwd=ROOT), 'Conservar corrección SSE previa'
    d['sseParqueaderosIntacto'] = True
    return d
