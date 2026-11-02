"""Ejercita SOLO funciones sql de guiones antiguos, sin importar/ejecutar sus suites.

Las suites completas siembran/pausan recursos. Aquí se extrae su función mediante
AST y se consulta exclusivamente base/schema en el PG propio B, sin escribir.
"""
import ast
import json
import os
from pathlib import Path
import re
import subprocess

proyecto = 'hexacore-base-vacia-e2e'
contenedor = proyecto + '-postgres-1'
c = json.loads(subprocess.check_output(['docker', 'inspect', contenedor], text=True))[0]
assert c['Config']['Labels']['com.docker.compose.project'] == proyecto
assert c['NetworkSettings']['Ports']['5432/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '15439'}]
os.environ.update(POSTGRES_CONTENEDOR=contenedor, POSTGRES_USUARIO='cu011_e2e', POSTGRES_BD='hexacore_vacia_e2e')
modulos = Path(__file__).resolve().parents[2] / 'modulos'
casos = [(p, 'identidad') for p in (modulos / 'identidad/pruebas').glob('*.py') if 'PGOPTIONS=-c search_path=' in p.read_text()]
casos += [(p, 'alimentos') for p in (modulos / 'alimentos/pruebas').glob('*.py') if 'PGOPTIONS=-c search_path=' in p.read_text()]
casos += [(modulos / 'entradas' / p, esquema) for p, esquema in [
    ('ventas/pruebas/venta.py', 'entradas_ventas'),
    ('acceso-qr/pruebas/venta.py', 'entradas_acceso_qr'),
    ('postventa/pruebas/venta.py', 'entradas_postventa'),
    ('postventa/pruebas/rnf06-autenticacion.py', 'entradas_ventas'),
]]
assert len(casos) == 13
for ruta, esquema in casos:
    funcion = next(n for n in ast.parse(ruta.read_text()).body if isinstance(n, ast.FunctionDef) and n.name == 'sql')
    contexto = {'os': os, 'subprocess': subprocess, 're': re, '_DUENO': {}, 'BASE_POSTVENTA': 'postventa'}
    exec(compile(ast.Module(body=[funcion], type_ignores=[]), str(ruta), 'exec'), contexto)
    consulta = "SELECT current_database() || ':' || current_schema()"
    args = ('entradas_mercado_secundario', consulta) if funcion.args.args[0].arg == 'base' else (consulta,)
    esperado = 'hexacore_vacia_e2e:' + esquema
    if ruta.name == 'cu011-flujo-completo.py':
        esperado = [[esperado]]  # Este auxiliar conserva su contrato de filas/columnas.
    assert contexto['sql'](*args) == esperado, str(ruta)
print('13 auxiliares SQL: base única/propietario correctos en PostgreSQL real; suites completas no ejecutadas.')
