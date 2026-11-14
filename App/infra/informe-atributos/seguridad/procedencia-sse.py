"""Mismas fuentes/compilados/imágenes en las tres finales SSE, sin datos de sesión."""
import hashlib, importlib.util, pathlib
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def medir():
    spec = importlib.util.spec_from_file_location('parqueaderos', HERE / 'procedencia-parqueaderos.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); d = m.medir()
    for p in [HERE / n for n in ['sse-comun.cjs', 'comprobar-sse.cjs', 'sondear-sse.cjs', 'procedencia-sse.py', 'finales-sse.py']]:
        d['fuentes'][str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    for p in list((ROOT / 'App/frontend/portal-web-admin/src/app/parqueaderos').glob('*')) + [ROOT / 'App/frontend/portal-web-admin/src/app/core' / n for n in ['flujo-sse.ts', 'flujo-sse.spec.ts', 'parqueaderos-api.service.ts', 'auth.service.ts']]:
        if p.is_file(): d['fuentes'][str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return d
