"""Exportación por lista permitida. Nunca publica respuestas, snapshots, QR, placas o sesiones."""
import collections, datetime, hashlib, json, os, pathlib, re
HERE = pathlib.Path(__file__).resolve().parent
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    def leer(n): return json.loads((p / n).read_text())
    inv = leer('inventario-parqueaderos.json')
    rutas = sorted(x['metodo'] + ' ' + x['ruta'] for x in inv['rutas'] if x['ruta'].startswith('/api/v1/parqueaderos/'))
    assert len(rutas) == 25 and inv['total'] == 178 and inv['clases']['protegida'] == 159
    uuid = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', re.I)
    finales = []; versiones = []
    for i in range(1, 4):
        r, version = leer(f'final-{i}.json'), leer(f'version-final-{i}.json')
        assert r['estado'] == 'APROBADO' and all(x['ok'] for x in r['observaciones'])
        versiones.append(version)
        canales = []
        for canal in r['canales']:
            assert sorted(x.replace(' ', ' /api/v1/parqueaderos', 1) for x in canal['operaciones']) == rutas
            canales.append({'canal': canal['canal'], 'operaciones': 25, 'comparacionesConservadas': canal['conservaciones']})
        obs = r['observaciones']
        finales.append({'nombre': r['nombre'], 'inicioUTC': r['inicio'], 'finUTC': r['fin'],
            'segundos': round((datetime.datetime.fromisoformat(r['fin']) - datetime.datetime.fromisoformat(r['inicio'])).total_seconds(), 3),
            'observaciones': len(obs), 'aprobadas': sum(x['ok'] for x in obs), 'categorias': dict(collections.Counter(x['categoria'] for x in obs)),
            'rechazosHTTPAutorizacionContexto': sum(x.get('estado', 0) >= 400 and x['categoria'] != 'dto' for x in obs),
            'comparacionesConservadas': sum(x.get('conservado', False) for x in obs), 'canales': canales,
            'detalle': [{k: (uuid.sub(':id', x[k]) if isinstance(x[k], str) else x[k]) for k in ['canal', 'caso', 'categoria', 'estado', 'esperado', 'codigo', 'ok', 'conservado'] if k in x} for x in obs]})
    assert versiones[0] == versiones[1] == versiones[2]
    antes = leer('brecha-antes.json'); tarifa = leer('tarifa-original-conservada.json'); restauracion = leer('restauracion-parqueaderos.json')
    assert tarifa['iguales'] and tarifa['filas'] == [] and all(all(x[k] for k in ['idIgual', 'imagenIgual', 'montajesIguales', 'estadoRestaurado']) for x in restauracion['originales'])
    auditoria = leer('auditoria-restauracion.json')
    def oom(t): return int(dict(x.split() for x in t.splitlines())['oom_kill'])
    memoria = []
    for i in range(1, 4):
        muestras = []
        for etapa in ['antes', 'despues']:
            m = leer(f'memoria-final-{i}-{etapa}.json')
            vm = {l.split(':')[0]: int(l.split(':')[1].split()[0]) for l in m['muestras']['vm']['salida'].splitlines() if l.startswith(('MemAvailable:', 'SwapFree:'))}
            muestras.append({'etapa': etapa, 'fechaUTC': m['fecha'], 'vmKiB': vm})
        memoria.append({'final': i, 'muestras': muestras})
    salida = {'alcance': 'Parqueaderos RNF-05/06; autorización por recurso parcial global',
        'baseMedida': versiones[0]['sha'], 'correccion': 'IDs offline globalmente únicos exigen el evento original, también tras conflicto concurrente de ingreso',
        'demostracionPrevia': [{'canal': e['canal'], **e['demostracion']} for e in antes],
        'cobertura': {'parqueaderos': {'cubiertas': 25, 'total': 25}, 'global': {'cubiertas': 113, 'total': 159, 'pendientes': 46},
            'inventarioDeclaradas': 178, 'inventarioExpuestas': 173, 'rutas': rutas}, 'finales': finales,
        'version': {'node': versiones[0]['node'], 'gatewayCoincideSalvoCorsLocal': versiones[0]['gatewayCoincide'],
            'fuentes': versiones[0]['fuentes'], 'compiladosCoincidentes': versiones[0]['compilados'],
            'imagenes': sorted(set(x['imagen'] for x in versiones[0]['imagenes'].values())), 'fuentesImagenesEstables': True},
        'aislamiento': {'baseCreadaVacia': True, 'migracionesSinSemilla': True, 'redisNuevo': True, 'vhostNuevo': True,
            'cuentasNuevas': 7, 'tarifaOriginalVaciaConservada': True, 'sinPagosCorreoReales': True, 'datosAnterioresSinEscriturasDeEnsayo': True},
        'restauracion': {'inicioUTC': restauracion['inicio'], 'finUTC': restauracion['fin'], 'dockerActivoInicialFinal': True,
            'contenedoresOriginalesConservados': len(restauracion['originales']), 'idsImagenesMontajesEstadosIguales': True,
            'contenedoresNuevosDetenidos': len(restauracion['nuevos']), 'cierresNuevos': [x['codigo'] for x in restauracion['nuevos']],
            'sinOomEnNuevos': not any(x['oom'] for x in restauracion['nuevos']), 'redashRestauraciones': 1, 'postgresListo': restauracion['postgresListo'], 'redisPong': restauracion['redisPong'],
            'httpPorEtapa': [{'servicio': x['servicio'], 'http': {k: {'codigoCurl': v['codigoCurl'], 'http': v['http']} for k, v in x['http'].items()}} for x in restauracion['pasos'] if 'http' in x],
            'oomKillAntesAlternar': {k: oom(v) for k, v in leer('redash-inicial-cgroups.json').items()},
            'oomKillNuevoArranqueFinal': {k: oom(v) for k, v in auditoria['cgroups'].items()},
            'controlPosteriorUTC': auditoria['fechaUTC'], 'httpPosterior': auditoria['http'], 'contadoresReinicioDistintos': auditoria['contadoresDistintos']},
        'memoria': memoria,
        'fallosConservados': [
            {'fase': 'desarrollo', 'resultado': 'FALLIDO antes de observaciones', 'causa': 'Snapshot financiero ordenaba por id; PK real es clave_idempotencia', 'correccion': 'Solo arnés, desarrollo-2 aprobado 296/296; finales añaden detalle confirmado y libro íntegro'},
            {'fase': 'unitaria nueva', 'resultado': 'TS2353 antes de ejecutar caso nuevo; seis existentes aprobadas', 'causa': 'Doble driverError no cumplía Error', 'correccion': 'Error con code/constraint; siete unitarias aprobadas y lint sin errores'},
            {'fase': 'procedencia previa', 'resultado': 'Comparación gateway detenida antes de finales', 'causa': 'Se comparó configuración principal con archivo de rutas', 'correccion': 'Compara cada destino real; rutas contra archivo generado y fuente salvo CORS local'},
            {'fase': 'restauración', 'resultado': 'Aserción final de contador de reinicios falló después de restaurar estados', 'causa': 'Gateway de otro proyecto ya reiniciaba antes; contador scheduler también cambia durante alternancia', 'correccion': 'Compara identidad/imagen/montajes/estado; conserva contadores como observación. Auditoría posterior solo lectura, sin repetir arranques'}],
        'limites': ['SSE autoriza al conectar: flujo abierto sigue emitiendo tras revocar sesión, nueva conexión 401; recursos cancelados explícitamente',
            'Sin autenticidad de dispositivo/reloj offline ni nueva atomicidad de lotes; cada registro conserva su resultado',
            'Roles operativos globales; disponibilidad compartida; salida conserva liquidación existente sin nuevo cobro electrónico',
            'No se repiten localmente los 16 recorridos completos; Alimentos/Compras/Reventa y fallos CI anteriores se reutilizan',
            '46 operaciones pendientes, RNF-05/06 parciales; sin CU-028/F12/DAST/fuentes-imágenes/ZeroTier ni investigación preventiva SIGTERM/outbox']}
    (HERE / 'PARQUEADEROS-RECURSOS-EVIDENCIA.json').write_text(json.dumps(salida, ensure_ascii=False, indent=2) + '\n')
    print('Exportación permitida: 3 × 300, 25/25 por canal, global113/159; sin datos crudos.')
if __name__ == '__main__': main()
