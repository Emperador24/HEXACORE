#!/usr/bin/env python3
"""Mismas imágenes y compilados de Compras/Reventa/fila/guardas en las tres mediciones."""
import hashlib, importlib.util, io, pathlib, subprocess, tarfile
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]

def medir():
    spec = importlib.util.spec_from_file_location('procedencia', HERE / 'procedencia-recursos.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    d = m.medir(); compilados = {}
    blob = subprocess.check_output(['docker', 'cp', 'hexacore-cu015-sebastian-boleteria-1:/app/dist/modulos/entradas', '-'])
    with tarfile.open(fileobj=io.BytesIO(blob)) as t:
        for entrada in t.getmembers():
            if not entrada.isfile() or not entrada.name.endswith('.js'): continue
            rel = pathlib.PurePosixPath(entrada.name).relative_to('entradas')
            if rel.parts[0] not in ['ventas', 'postventa', 'fila', 'compartido']: continue
            contenido = t.extractfile(entrada).read()
            assert contenido == (ROOT / 'App/backend/dist/modulos/entradas' / rel).read_bytes(), str(rel)
            compilados[str(rel)] = hashlib.sha256(contenido).hexdigest()
    fuentes = {}
    for modulo in ['ventas', 'postventa', 'fila', 'compartido']:
        for p in sorted((ROOT / 'App/backend/modulos/entradas' / modulo).rglob('*.ts')):
            fuentes[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    for archivo in ['ventas-recursos.cjs', 'preparar-ventas.cjs', 'finales-ventas.py', 'procedencia-ventas.py', 'comun.cjs', 'inventario.cjs', 'medir.py', 'procedencia-recursos.py']:
        p = HERE / archivo; fuentes[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    d.update(compiladosVentas=compilados, fuentes=fuentes)
    return d
