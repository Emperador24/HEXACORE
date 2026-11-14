#!/usr/bin/env python3
"""Exportación por lista positiva: sin fixture, sesiones, QR ni capturas crudas."""
import collections, datetime, json, os, pathlib, subprocess
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]

def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve(); assert p.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(p / 'control')], cwd=ROOT, check=True)
    def leer(nombre): return json.loads((p / nombre).read_text())
    finales = []
    for i in range(1, 4):
        fase = f'final-{i}'; d = leer(f'ventas-{fase}.json'); assert d['fallidos'] == 0
        controles = [{k: v for k, v in x.items() if k in ['canal', 'etiqueta', 'operacion', 'actor', 'tipo', 'estado', 'esperado', 'ok', 'sinCambiosSQL', 'sinCambiosRedis', 'bloqueosSQLDisponibles']} for x in d['controles']]
        cobertura = {canal: sorted({x['operacion'] for x in controles if x['canal'] == canal and x['tipo'] == 'autorizacion' and x['estado'] < 300}) for canal in ['gateway', 'directo']}
        assert all(len(v) == d['ampliadas'] for v in cobertura.values())
        memoria = {}
        for momento in ['antes', 'despues']:
            m = leer(f'memoria-{fase}-{momento}.json')['muestras']['vm']['salida']
            memoria[momento] = {l.split(':')[0]: int(l.split()[1]) for l in m.splitlines() if l.startswith(('MemAvailable:', 'SwapFree:'))}
        inicio, fin = [datetime.datetime.fromisoformat(d[k].replace('Z', '+00:00')) for k in ['inicio', 'fin']]
        finales.append({'fase': fase, 'inicioUTC': d['inicio'], 'finUTC': d['fin'], 'duracionMs': round((fin - inicio).total_seconds()*1000),
            'total': len(controles), 'tipos': dict(collections.Counter(x['tipo'] for x in controles)),
            'estadosHTTP': dict(collections.Counter(x['estado'] for x in controles)), 'fallidos': d['fallidos'], 'cobertura': cobertura,
            'rechazosSinCambios': sum(bool(x.get('sinCambiosSQL') and x.get('sinCambiosRedis')) for x in controles),
            'ambitos': d['ambitos'], 'transferencias': {canal: leer(f'ventas-{fase}-transferencia-{canal}.json') for canal in cobertura},
            'limitacion': d['limitacion'], 'memoriaKiB': memoria, 'procedencia': leer(f'version-ventas-{fase}.json'), 'controles': controles})
    ampliadas = min(len(f['cobertura']['gateway']) for f in finales)
    control = leer('ventas-control.json')
    d = {'fechaBogota': '2026-11-13', 'alcance': 'Compras y Reventa por gateway/backend directo; RNF-05/06 parciales',
        'cobertura': {'revisadas': 19, 'ampliadas': ampliadas, 'compras': 8, 'reventa': ampliadas-8,
            'global': 69+ampliadas, 'totalGlobal': 159, 'pendientesGlobal': 90-ampliadas, 'previasReutilizadas': 69},
        'controlInicial': {'observaciones': len(control['controles']), 'fallidos': control['fallidos'], 'ampliadas': control['ampliadas'],
            'nota': 'Control anterior a agregar el positivo administrativo; después se comprobó todo el ámbito descartable, sin borrar datos previos ni añadir filtros de producto.'},
        'unitariasActuales': {'suites': 6, 'aprobadas': 124, 'total': 124},
        'reutilizado': {'aceptacionAutomatica': '16/16', 'aceptacionVisible': '16/16', 'referencia': 'ec07de2',
            'CIReferencia': '62ffd7b / 43523770155 / 8 de 8', 'Boleteria': '23/23 × dos, histórica; fuentes intactas', 'coberturaAnterior': '69/159, incluidas 30/30 Alimentos'},
        'entorno': leer('entorno-resumen.json'), 'finales': finales}
    (HERE / 'VENTAS-RECURSOS-EVIDENCIA.json').write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'ampliadas': ampliadas, 'global': 69+ampliadas, 'finales': [f['total'] for f in finales]}))

if __name__ == '__main__': main()
