#!/usr/bin/env python3
"""Lista positiva de campos publicables; nunca copia cuerpos/QR/cuentas/capturas."""
import hashlib, json, os, pathlib
HERE = pathlib.Path(__file__).resolve().parent

def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    def leer(nombre): return json.loads((p / nombre).read_text())
    finales = []
    for i in range(1, 4):
        fase = f'final-{i}'; d = leer(f'alimentos-{fase}.json')
        assert d['fallidos'] == 0
        controles = [{k: x[k] for k in ['canal', 'etiqueta', 'operacion', 'actor', 'tipo', 'estado', 'esperado', 'ok', 'sinCambiosSQL', 'sinCambiosRedis'] if k in x} for x in d['controles']]
        cobertura = {}
        for canal in ['gateway', 'directo']:
            cobertura[canal] = sorted({x['operacion'] for x in controles if x['canal'] == canal and x['tipo'] == 'autorizacion' and x['estado'] < 300})
            assert len(cobertura[canal]) == 30
        versiones = leer(f'version-{fase}.json')
        memoria = {}
        for momento in ['antes', 'despues']:
            muestra = leer(f'memoria-{fase}-{momento}.json')['muestras']['vm']['salida']
            memoria[momento] = {l.split(':')[0]: int(l.split()[1]) for l in muestra.splitlines() if l.startswith(('MemAvailable:', 'SwapFree:'))}
        finales.append({'fase': fase, 'inicioUTC': d['inicio'], 'finUTC': d['fin'], 'duracionMs': round((__import__('datetime').datetime.fromisoformat(d['fin'].replace('Z', '+00:00')) - __import__('datetime').datetime.fromisoformat(d['inicio'].replace('Z', '+00:00'))).total_seconds() * 1000),
            'controles': controles, 'cobertura': cobertura, 'fallidos': 0, 'memoriaKiB': memoria,
            'conservacion': {canal: leer(f'alimentos-{fase}-conservacion-{canal}.json') for canal in cobertura},
            'procedencia': versiones})
    inicial, final = leer('entorno-inicial.json'), leer('entorno-final.json')
    oom = {}
    for servicio in ['postgres', 'redis', 'server', 'scheduler', 'worker', 'adhoc_worker', 'scheduled_worker']:
        contenido = (p / f'redash-final-cgroup-{servicio}.txt').read_text()
        oom[servicio] = int(next(l.split()[1] for l in contenido.splitlines() if l.startswith('oom_kill ')))
    historico = leer('alimentos-control-parcial.json')['controles']
    d = {'fecha': '2026-11-13', 'alcance': 'Autorización por recurso de Alimentos; RNF-05/06 parciales',
        'cobertura': {'alimentos': 30, 'totalAlimentos': 30, 'global': 69, 'totalGlobal': 159, 'pendientesGlobal': 90,
            'nuevas': 20, 'anteriores': 49, 'DASTAmpliado': False},
        'historialControl': {'observaciones': len(historico), 'aprobadas': sum(x['ok'] for x in historico),
            'fallo': 'Arnés esperaba 200 con estado NO_DISPONIBLE inexistente; contrato CERRADO. Corregido antes de finales, sin cambio de producto; el rechazo con ese cuerpo no acredita autorización.'},
        'seriePreviaInterrumpida': leer('historial-primera-serie.json'),
        'unitariasNuevasEjecucion': {'suites': 8, 'aprobadas': 210, 'total': 210},
        'reutilizado': {'automatico': '16/16', 'visible': '16/16', 'referencia': 'ec07de2', 'fuentesAlimentosFinanzasSinCambios': True,
            'coberturaOtrasRutas': '39/159 previas fuera de Alimentos; fuentes relevantes sin cambios desde 7130d52'},
        'entorno': {'dockerActivoInicial': inicial['dockerActivo'], 'dockerActivoFinal': final['dockerActivo'],
            'redashOOMFinal': oom,
            **{k: final[k] for k in ['mismosContenedoresImagenesMontajes', 'estadosRestaurados', 'redashHTTP', 'redashPG', 'redashRedis', 'otrosProyectosSinIntervencion']}},
        'exportador': {'sha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
            'nota': 'Después de las finales solo se amplía la exportación saneada con contadores OOM de restauración; no cambian peticiones, aserciones, límites ni herramientas de ejecución.'},
        'finales': finales}
    (HERE / 'ALIMENTOS-RECURSOS-EVIDENCIA.json').write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print('Exportación saneada: tres finales, 30/30 por canal, 69/159 global; sin datos crudos.')

if __name__ == '__main__': main()
