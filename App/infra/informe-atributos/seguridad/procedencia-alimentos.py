#!/usr/bin/env python3
"""Amplía la procedencia existente a todos los compilados de Alimentos y sus fuentes."""
import hashlib, importlib.util, io, pathlib, subprocess, tarfile
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]

def medir():
    spec = importlib.util.spec_from_file_location('procedencia', HERE / 'procedencia-recursos.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    resultado = m.medir()
    datos = subprocess.check_output(['docker', 'cp', 'hexacore-cu015-sebastian-nucleo-1:/app/dist/modulos/alimentos', '-'])
    compilados = {}
    with tarfile.open(fileobj=io.BytesIO(datos)) as t:
        for entrada in t.getmembers():
            if not entrada.isfile() or not entrada.name.endswith('.js'): continue
            relativo = pathlib.PurePosixPath(entrada.name).relative_to('alimentos')
            contenido = t.extractfile(entrada).read()
            local = ROOT / 'App/backend/dist/modulos/alimentos' / relativo
            assert contenido == local.read_bytes(), f'Compilado diferente: {relativo}'
            compilados[str(relativo)] = hashlib.sha256(contenido).hexdigest()
    fuentes = {}
    for carpeta in ['App/backend/modulos/alimentos', 'App/backend/modulos/identidad', 'App/backend/modulos/finanzas/pagos', 'App/infra/informe-atributos/seguridad']:
        for p in sorted((ROOT / carpeta).rglob('*')):
            if not p.is_file() or '.privado' in p.parts or p.suffix not in ['.ts', '.cjs', '.py']: continue
            fuentes[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    resultado.update(compiladosAlimentos=compilados, fuentes=fuentes)
    return resultado
