"""Exporta campos permitidos de esta ventana; nunca respuestas/SQL/identidades/frames crudos."""
import collections, datetime, hashlib, json, os, pathlib, re
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[3]
def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert p.is_relative_to(ROOT)
    def leer(n):return json.loads((p/n).read_text())
    versiones=[leer(f'operacion-version-cierre-final-{i}.json') for i in range(1,4)];assert versiones[0]==versiones[1]==versiones[2]
    inv=leer('inventario-operacion-vigente.json');assert inv['total']==186 and inv['clases']['protegida']==167
    rutas=[{k:x[k] for k in ['metodo','ruta','roles','moduloPermiso','accionPermiso']} for x in inv['rutas'] if x['fuente'].startswith('modulos/operacion/')];assert len(rutas)==22
    finales=[]
    permitidos=['canal','caso','categoria','estado','esperado','codigo','ok','conservado']
    for i in range(1,4):
        d=leer(f'operacion-cierre-final-{i}.json');s=leer(f'operacion-sse-cierre-final-{i}.json');assert d['estado']==s['estado']=='APROBADO'
        o=d['observaciones'];assert len(o)==510 and all(x['ok'] for x in o)
        assert sum(x.get('conservado',False) for x in o)==256
        for c in d['canales']:
            assert len(c['operaciones'])==22 and c['porSupervisor']=={'organizador':22,'admin':22}
            assert sorted(x['metodo']+' '+x['ruta'] for x in rutas)==sorted(x.replace(' /',' /api/v1/',1) for x in c['operaciones'])
        def sinFrames(x):return {k:v for k,v in x.items() if k!='frames'}
        sse=[{k:(sinFrames(v) if isinstance(v,dict) else v) for k,v in caso.items()} for caso in s['casos']]
        assert len(sse)==4 and s['shutdown']['conexiones']==4 and s['shutdown']['ms']<=5000
        finales.append({'nombre':f'cierre-final-{i}','inicioUTC':d['inicioUTC'],'finUTC':s['finUTC'],
            'segundosMatriz':round((datetime.datetime.fromisoformat(d['finUTC'])-datetime.datetime.fromisoformat(d['inicioUTC'])).total_seconds(),3),
            'observaciones':len(o),'aprobadas':len(o),'categorias':dict(collections.Counter(x['categoria'] for x in o)),
            'respuestasHTTP':dict(collections.Counter(x['estado'] for x in o if 'estado' in x)),
            'rechazosAutorizacion':sum(x.get('estado') in [401,403] for x in o),'conservaciones':256,
            'expiracionesNaturalesObservadas':sum(len(x.get('expiracionesNaturales',[])) for x in o),
            'tablas':next(x['comparacion']['tablas'] for x in o if 'comparacion' in x),'instantaneasCompletasGzip':True, 'canales':d['canales'],
            'detalle':[{k:x[k] for k in permitidos if k in x} for x in o], 'sse':sse,'shutdown':s['shutdown'],
            'regresionParqueaderos':[sinFrames(x) for x in s['regresionParqueaderos']]})
    rest=leer('restauracion-parqueaderos.json');audit=leer('auditoria-restauracion.json')
    assert len(rest['originales'])==101 and all(all(x[k] for k in ['idIgual','imagenIgual','montajesIguales','estadoRestaurado']) for x in rest['originales'])
    def oom(t):return int(dict(x.split() for x in t.splitlines())['oom_kill'])
    antes=leer('operacion-sse-antes.json');assert antes['estado']=='REPRODUCIDO' and len(antes['pruebas'])==4
    resultado={'fechaBogota':'2026-11-15','integracion':{'inicio':'7d0b2c9','developIntegrado':'36998aa','metodo':'fast-forward','PR51y52YaIntegrados':True,'demoCommit':'0e29a13','baseMedida':versiones[0]['sha'],'cambiosLocalesMedidosPorHuellas':True},
        'cobertura':{'nueva':22,'modulo':{'evacuacion':16,'monitoreo':6},'global':151,'totalProtegidas':167,'pendientes':16,'anterioresReutilizadas':129,
            'inventario':{'declaradas':186,'expuestas':181,'protegidas':167},'cambioDenominador':'Ocho operaciones protegidas CU-028 incorporadas por develop; quedan pendientes, junto a las ocho antiguas de Acceso QR/Admin cuentas','rutas':rutas},
        'reproduccion':{'base':antes['base'],'imagen':antes['imagen'],'gatewayInicialConRenderAnterior':True,
            'pruebas':[{k:x[k] for k in ['canal','tipo','datoNuevoTrasRevocar','msTrasRevocar','nuevaConexion']} for x in antes['pruebas']]},
        'correccionCommit':leer('publicacion-commits.json')['producto'],
        'correccion':'Revalidar sesión/permiso vigente en ciclos 2/3 s y antes de emitir; un terminal saneado/EOF; desconexión y apagado completan; consultas SSE propias SQL2s/estado5s sin cambiar HTTP normal',
        'finales':finales,'version':{'node':versiones[0]['node'],'compilados':versiones[0]['compilados'],'fuentes':versiones[0]['fuentes'],
            'imagenesEstables':sorted(set(x['imagen'] for x in versiones[0]['imagenes'].values())),'gatewayActualCoincide':True,'guardaComunYParqueaderosSinCambiosPropios':True},
        'pruebasLocales':{'backendUnitarias':53,'backendSuites':7,'incluyenDoblesYTiempoVirtual':True,'portalDoblesChromeHeadless':22,'httpRegresionesNuevasParaCI':2,'buildLintTiposAprobados':True,'sinRecorridosCompletos16niMatricesHistoricas300':True},
        'comparadorEstado':{'unitarias':6,'lecturaAtomicaReal':leer('validacion-lectura-atomica.json'),'expiracionesNaturales':'Solo desapariciones con TTL absoluto vencido según reloj Redis; valores/TTL presentes, claves nuevas y borrados anticipados siguen estrictos. Se conservan ambos estados crudos completos'},
        'integridadInstantaneas':leer('integridad-instantaneas.json'),
        'plantillasClienteFinales':{str(x.relative_to(ROOT)):hashlib.sha256(x.read_bytes()).hexdigest() for x in [ROOT/'App/frontend/portal-web-admin/src/app'/n for n in ['monitoreo/monitoreo.component.html','emergencias/emergencias.component.html']]},
        'demo':json.loads((ROOT/'App/e2e/DEMO-ACCIONES-EVIDENCIA.json').read_text()),
        'aislamiento':{'baseVhostRedisVolumenNuevos':True,'usuariosPropios':9,'sinDestinatariosPrevios':True,'canales':['PERSONAL','ASISTENTES','ALTAVOCES'],'colaDeAvisosSoloVhostNuevo':True,'sinCanalesExternos':True,'sinSemillas':True},
        'restauracion':{'originales':len(rest['originales']),'idsImagenesMontajesEstadosIguales':True,'dockerActivoInicialFinal':True,'cu015InicialesActivos':11,'redashInicialesActivos':7,
            'nuevosDetenidos':len(rest['nuevos']),'cierres':[x['codigo'] for x in rest['nuevos']],'sinOomNuevos':not any(x['oom'] for x in rest['nuevos']),
            'controlUTC':audit['fechaUTC'],'httpPosterior':audit['http'],'postgresListo':rest['postgresListo'],'redisPong':rest['redisPong'],
            'oomKillNuevoArranque':{k:oom(v) for k,v in audit['cgroups'].items()},'contadoresReinicioDistintos':audit['contadoresDistintos']},
        'fallosConservados':[
            {'fase':'navegador','causa':'Contador del arnés tomó input y change de un selector como dos acciones; corregido solo contador, 1/1 demo y 1/1 normal, mismo límite15s'},
            {'fase':'preparacion','causa':'Fixture omitía descripción obligatoria y usaba search_path distinto del de Identidad para su trigger. Se conservan errores y fixture parcial; se completa en la misma base nueva sin borrar filas. Sondeo dependiente fallido con cero observaciones conservado'},
            {'fase':'build inicial','causa':'Payload Promise<unknown> no satisface MessageEvent; contrato se tipa Promise<object>; build/lint aprobados después'},
            {'fase':'matriz desarrollo','diagnostico':leer('diagnostico-gateway-render.json')},
            {'fase':'matriz desarrollo-2','diagnostico':leer('diagnostico-solapamiento-desarrollo.json')},
            {'fase':'serie inicial de finales','final1':'510/510 y cuatro casos SSE aprobados','final2':'Interrumpida tras248 observaciones; HTTP403 correcto; no se ejecutan SSE2/final3','diagnostico':leer('diagnostico-acuse-final-2.json'),'serieSiguiente':'Normalizada: interrumpida al guardar el agregado; sin SSE1/finales2y3; mismo producto/imágenes/límites'},
            {'fase':'exportacion de serie normalizada','diagnostico':leer('diagnostico-exportacion-normalizada-1.json'),'validacionFormato':leer('validacion-formato.json'),'serieSiguiente':'Compacta: primera final completa aprobada y segunda interrumpida por TTL natural; misma matriz completa e instantáneas íntegras gzip'},
            {'fase':'serie compacta','final1':'510/510 y cuatro casos SSE aprobados','final2':'Interrumpida tras236 por expiración natural de una clave antigua; HTTP409 esperado. No se ejecutan SSE2/final3','diagnostico':leer('diagnostico-expiracion-compacta-2.json'),'serieNueva':'Tres cierre-final completas con lectura Redis atómica y comparación del ciclo de expiración, misma matriz/producto/imágenes/límites; sin reintentos automáticos'},
            {'fase':'Redash','causa':'Scheduler cerró137 durante parada con gracia120s, OOMKilled=false; causa interna no aislada. Sin reinicios manuales de recuperación'}],
        'limites':['151/167 y RNF-05/06 parciales; ocho rutas nuevas de CU-028 pendientes, sin desarrollo del caso',
            'Roles operativos globales, sin propiedad por creador, asignación Personal-evento ni aislamiento organizativo inventados',
            'Contexto, DTO y estado separados de autorización; recursos existentes, cuerpos y estados válidos; avisos estabilizados antes de comparar',
            'Detección periódica hasta ciclo2/3s + Redis2s + planificación/transporte, no instantánea; SIGTERM5s intacto',
            'Fixtures JWT cortas no alteran TTL/reloj; Redis6500ms solo nuevo; SQL bloqueado solo base nueva; promesas externas no se cancelan arbitrariamente',
            'Pruebas de Seguridad no certifican plazos RNF-17, estabilidad global de Redash o todas las combinaciones de roles',
            'Evidencia previa reutilizada; no repetir16/300; semilla ya corregida no se vuelve a ejecutar; sin DAST/F12/nuevos casos de uso/ZeroTier/fuentes-imágenes gráficas']}
    texto=json.dumps(resultado,ensure_ascii=False,indent=2)+'\n'
    assert not re.search(r'[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|eyJ[A-Za-z0-9_-]+\.',texto,re.I)
    (HERE/'OPERACION-EVIDENCIA.json').write_text(texto)
    print('Exportación permitida: 22 nuevas, 151/167; 3×510 y 12 casos SSE; restauración acreditada, crudos excluidos.')
if __name__=='__main__':main()
