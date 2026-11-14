"""Publica solo medidas y estados, nunca tokens/frames/IDs/consultas o trazas crudas."""
import datetime, hashlib, json, os, pathlib
HERE = pathlib.Path(__file__).resolve().parent
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    def leer(n): return json.loads((p / n).read_text())
    versiones = [leer(f'sse-version-final-{i}.json') for i in range(1, 4)]
    assert versiones[0] == versiones[1] == versiones[2]
    finales = []
    for i in range(1, 4):
        d = leer(f'sse-final-{i}.json'); assert d['estado'] == 'APROBADO' and len(d['canales']) == 2
        canales = []
        for c in d['canales']:
            canales.append({'canal': c['canal'], 'rechazosIniciales': c['rechazosIniciales'], 'valida': c['valida'], 'desconexion': c['desconexion'],
                **{k: {campo: valor for campo, valor in c[k].items() if campo not in ['frames', 'expUTC']} for k in ['revocacion', 'caducidad', 'consultaEnCurso', 'redis']}})
        finales.append({'nombre': d['nombre'], 'inicioUTC': d['inicioUTC'], 'finUTC': d['finUTC'],
            'segundos': round((datetime.datetime.fromisoformat(d['finUTC']) - datetime.datetime.fromisoformat(d['inicioUTC'])).total_seconds(), 3), 'estado': d['estado'], 'canales': canales, 'shutdown': d['shutdown']})
    restauracion = leer('restauracion-parqueaderos.json'); auditoria = leer('auditoria-restauracion.json')
    assert all(all(x[k] for k in ['idIgual', 'imagenIgual', 'montajesIguales', 'estadoRestaurado']) for x in restauracion['originales'])
    def oom(t): return int(dict(x.split() for x in t.splitlines())['oom_kill'])
    inv = leer('inventario-sse.json'); assert inv['total'] == 178 and inv['clases']['protegida'] == 159
    datos = {'alcance': 'Revalidación SSE de ocupación de Parqueaderos, RNF-05/06 parciales', 'baseMedida': versiones[0]['sha'],
        'cobertura': {'global': '113/159', 'pendientes': 46, 'parqueaderos': '25/25', 'aumentoPorEsteCambio': 0, 'inventario': '178 declaradas / 173 expuestas / 159 protegidas'},
        'antes': [{'canal': x['canal'], 'datosNuevosTrasRevocar': x['datosNuevosTrasRevocar'], 'msTrasRevocar': x['datoPosteriorMs'] - x['revocadaMs'], 'nuevaConexion': x['nuevaConexion']} for x in leer('sse-antes.json')],
        'finales': finales,
        'diseno': {'cicloMs': 3000, 'redisCommandTimeoutMsExistente': 2000, 'esperaPanelMs': 5000, 'sqlParqueaderosStatementTimeoutLocalMs': 2000,
            'httpSseEnsayoMs': 10000, 'sigtermMsExistente': 5000, 'temporizadoresGlobales': False, 'comprobacionesSolapadasPorConexion': False,
            'antesYDespuesDelPanel': True, 'eventoTerminal': 'sesion_finalizada', 'sinCambiarHttpIniciado': True, 'sinTokensEnUrlEventosLogsNuevos': True},
        'version': {'node': versiones[0]['node'], 'compiladosCoincidentes': versiones[0]['compilados'], 'fuentesDuranteMediciones': versiones[0]['fuentes'],
            'clienteMedidoPorUnitariasNoPorHttp': True,
            'fuentesClienteFinales': {str(a.relative_to(HERE.parents[3])): hashlib.sha256(a.read_bytes()).hexdigest()
                for a in (HERE.parents[3] / 'App/frontend/portal-web-admin/src/app').rglob('*') if a.is_file() and (a.name.startswith('flujo-sse.') or a.name.startswith('parqueaderos'))},
            'imagenesEstables': sorted(set(x['imagen'] for x in versiones[0]['imagenes'].values()))},
        'aislamiento': {'baseRedisVhostNuevos': True, 'soloProveedoresSimulados': True, 'sinCambiarTtlNiRelojProductivo': True,
            'caducidadHttp': 'JWT de ensayo firmado con exp corto para sesión propia real; validación/HTTP/Redis reales, emisión de vida corta es fixture',
            'falloRedis': 'CLIENT PAUSE 6500 ALL solo en Redis dedicado, con fin programado; sin stop/flush de Redis compartido',
            'consultaEnCurso': 'LOCK de tabla en base exclusiva, liberado tras revocación; SQL/HTTP reales'},
        'restauracion': {'contenedoresOriginales': len(restauracion['originales']), 'idsImagenesMontajesEstadosConservados': True,
            'nuevosDetenidos': len(restauracion['nuevos']), 'cierres': [x['codigo'] for x in restauracion['nuevos']], 'sinOomNuevos': not any(x['oom'] for x in restauracion['nuevos']),
            'dockerActivoInicialFinal': True, 'redashArranqueManualUnaVez': True, 'postgresListo': restauracion['postgresListo'], 'redisPong': restauracion['redisPong'],
            'controlPosteriorUTC': auditoria['fechaUTC'], 'httpPosterior': auditoria['http'], 'contadoresReinicioDistintos': auditoria['contadoresDistintos'],
            'oomKillAntesAlternar': {k: oom(v) for k, v in leer('redash-inicial-cgroups.json').items()}, 'oomKillNuevoArranqueFinal': {k: oom(v) for k, v in auditoria['cgroups'].items()}},
        'limites': ['Detección periódica: hasta ciclo de 3 s más comprobación Redis de hasta 2 s y transporte/planificación; no revocación instantánea',
            'La desuscripción descarta promesas tardías; no cancela arbitrariamente promesas externas. SQL de Parqueaderos usa límite local de 2 s y espera del panel limitada a 5 s',
            'Backend unitario usa dobles/tiempo virtual para intercalaciones; frontend usa dobles en Chrome Headless, separados de HTTP real',
            'No se ejecutan otra vez los 300 controles ni los 16 recorridos locales. Otros módulos SSE se identifican como riesgo equivalente sin modificarlos',
            'HTTP Redash puntual no acredita estabilidad ni elimina antecedentes OOM/capacidad; sin ciclos manuales de recuperación'],
        'fallosConservados': [{'fase': 'tipos portal', 'causa': 'Se invocó tsconfig base sin tipos Jasmine sobre archivos spec', 'correccion': 'Usar tsconfig.app.json y tsconfig.spec.json; ambos aprobados, sin cambiar configuración'},
            {'fase': 'regresión adicional consumidor', 'resultadoPrevio': '5/6; 401 de tokenVigente se perdía antes de abrir fetch', 'correccion': 'Propaga estado ErrorCuenta a la política de reconexión; seis pruebas finales, sin cambiar servidor de las tres mediciones HTTP'}]}
    (HERE / 'SSE-PARQUEADEROS-EVIDENCIA.json').write_text(json.dumps(datos, ensure_ascii=False, indent=2) + '\n')
    print('Tres finales SSE exportadas sin datos crudos; cobertura 113/159 sin aumento.')
if __name__ == '__main__': main()
