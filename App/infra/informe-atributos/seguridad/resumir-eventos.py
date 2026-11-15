"""Lista permitida de evidencia: sin SQL/respuestas/planos/identidades/sesiones crudas."""
import collections, datetime, json, os, pathlib, re
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    def leer(n): return json.loads((p/n).read_text())
    versiones = [leer(f'eventos-version-normalizada-final-{i}.json') for i in range(1,4)]
    assert versiones[0] == versiones[1] == versiones[2]
    inv = leer('inventario-eventos.json')
    rutas = sorted(x['metodo']+' '+x['ruta'] for x in inv['rutas'] if (x['fuente'] or '').startswith('modulos/eventos-recintos/'))
    assert len(rutas)==16 and inv['total']==178 and inv['clases']['protegida']==159
    uuid = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',re.I)
    finales=[]
    for i in range(1,4):
        d=leer(f'eventos-normalizada-final-{i}.json');assert d['estado']=='APROBADO' and all(o['ok'] for o in d['observaciones'])
        for c in d['canales']:assert sorted(' /api/v1'.join(x.split(' ',1)) for x in c['operaciones'])==rutas
        o=d['observaciones']
        finales.append({'nombre':d['nombre'],'inicioUTC':d['inicioUTC'],'finUTC':d['finUTC'],
            'segundos':round((datetime.datetime.fromisoformat(d['finUTC'])-datetime.datetime.fromisoformat(d['inicioUTC'])).total_seconds(),3),
            'observaciones':len(o),'aprobadas':sum(x['ok'] for x in o),'categorias':dict(collections.Counter(x['categoria'] for x in o)),
            'respuestasHTTP':dict(collections.Counter(x['estado'] for x in o if 'estado' in x)),
            'rechazosAutorizacion':sum(x.get('estado') in [401,403] for x in o),'conservaciones':sum(x.get('conservado',False) for x in o),
            'tablasComprobadas':len(next(x['antes']['filas'] for x in o if 'antes' in x)),
            'canales':[{'canal':c['canal'],'operaciones':len(c['operaciones']),'conservaciones':c['conservaciones']} for c in d['canales']],
            'detalle':[{k:(uuid.sub(':id',x[k]) if isinstance(x[k],str) else x[k]) for k in ['canal','caso','categoria','estado','esperado','codigo','ok','conservado'] if k in x} for x in o]})
    rest=leer('restauracion-parqueaderos.json');audit=leer('auditoria-restauracion.json');assert len(rest['originales'])==98
    assert all(all(x[k] for k in ['idIgual','imagenIgual','montajesIguales','estadoRestaurado']) for x in rest['originales'])
    def oom(t):return int(dict(x.split() for x in t.splitlines())['oom_kill'])
    demo=ROOT/'App/e2e/.evidencia/presentacion-20261114'
    semilla=leer('semilla-imagen-original.json')
    d={'alcance':'Eventos/Recintos: 16 operaciones; RNF-05/06 parciales',
       'integracion':{'inicio':'56c0fca','developIntegrado':'66f9d6e','metodo':'fast-forward','samuelPR51Integrado':False,'demoCommit':'5668ecc','baseMedida':versiones[0]['sha']},
       'cobertura':{'eventosRecintos':{'cubiertas':16,'total':16},'global':{'cubiertas':129,'total':159,'pendientes':30},'inventario':'178 declaradas / 173 expuestas / 159 protegidas','rutas':rutas},
       'brechasAntes':[{'canal':x['canal'],**x['demostracion']} for x in leer('eventos-brechas-antes.json')],
       'procedenciaReproduccion':{'base':'5668ecc','comando':'node App/infra/informe-atributos/seguridad/sondear-eventos.cjs','imagen':leer('entorno-parqueaderos.json')['coreAntes']['imagen']},
       'correccionCommit':'90f0d02ce7be218824516f9b5b8465f0fde51fd9',
       'correccion':'Las altas ignoran los ids de zonas/localidades del DTO compartido de edición y generan identidades nuevas, sin reasignar recursos existentes; edición conserva su contrato',
       'finales':finales,
       'version':{'node':versiones[0]['node'],'compiladosEventos':versiones[0]['compiladosEventos'],'compiladosParqueaderosSseConservados':versiones[0]['compilados'],
           'fuentes':versiones[0]['fuentes'],'imagenesEstables':sorted(set(x['imagen'] for x in versiones[0]['imagenes'].values())),'sseParqueaderosIntacto':versiones[0]['sseParqueaderosIntacto']},
       'demo':{'pausaMs':1500,'slowMo':0,'comandoHabitual':'npm --prefix App/e2e run test:cu015:visible','sinVariablesAdicionalesDeVelocidad':True,
           'casosDescubiertos':16,'casosCu015Descubiertos':2,'configuracionEfectiva':json.loads((demo/'config-efectiva-resumen.json').read_text()),'navegadorAcotado':json.loads((demo/'demo.json').read_text()),'normalAcotado':json.loads((demo/'normal.json').read_text()),
           'observadorCompletoCodigoSoloDescubrimiento':2,'conjuntosCompletosEjecutadosPorEsteCambio':0},
       'semilla':{'yaCorregidaEn':'b167261','sinNuevaCorreccion':True,'restrictConservado':True,'unitariaLocalConDoble':'1/1','sinEjecucionDestructivaLocal':True,
           'ciReutilizada':43650863470,'checkoutCi':'50c6364a127c7ec81a8eda71ef13a30264eeb8b6','ciEsMergeDePruebaDePR51':True,
           'fuentesIdenticasB167ActualYCi':leer('semilla-fuentes-verificadas.json'),
           'procedimiento':'iniciar.sh --datos-demo npm, instalación vacía; datos-demo compila Dockerfile.herramientas y ejecuta ts-node. La diferencia iniciar.sh de PR51 es monitoreo opcional no utilizado; no se integra ese PR',
           'resultadoCi':'semilla:alimentos: 1 evento, 3 establecimientos, 12 productos; instalación y los ocho trabajos aprobados',
           'imagenOriginal':semilla},
       'restauracion':{'dockerActivoInicialFinal':True,'originales':len(rest['originales']),'idsImagenesMontajesEstadosIguales':True,'cu015InicialesActivos':11,'cu015EstadoRestaurado':rest['cu015'],
           'nuevosDetenidos':len(rest['nuevos']),'cierresNuevos':[x['codigo'] for x in rest['nuevos']],'sinOomNuevos':not any(x['oom'] for x in rest['nuevos']),
           'redashArranqueManualUnaVez':True,'controlPosteriorUTC':audit['fechaUTC'],'httpPosterior':audit['http'],'postgresListo':rest['postgresListo'],'redisPong':rest['redisPong'],
           'oomKillArranqueNuevoFinal':{k:oom(v) for k,v in audit['cgroups'].items()},'contadoresReinicioDistintos':audit['contadoresDistintos']},
       'fallosConservados':[
           {'fase':'navegador acotado inicial','causa':'Arnés consultaba config.retries, dato disponible en project.retries','correccion':'Solo arnés privado; resultados iniciales conservados y prueba corregida aprobada, sin ampliar 15 s'},
           {'fase':'preparación de aislamiento','causa':'Núcleo original estaba activo al inicio; la guarda bloqueó antes de crear la base','correccion':'Detener aplicaciones propias con validación de IDs; preparar nueva base y restaurar los once estados iniciales al terminar'},
           {'fase':'serie inicial de finales','final1':'218/218','final2':'Interrumpida tras 199 observaciones, respuesta 403 esperada','final3':'No ejecutada',
            'diagnostico':leer('diagnostico-orden-final-2.json'),'correccion':'Normalizar por nombre de tabla el orden de UNION ALL; no cambios de producto, datos ni límites; tres mediciones completas nuevas con arnés corregido'}],
       'limites':['Roles operativos globales: creadoPor es auditoría, no propiedad; Administrador consulta Eventos pero no los muta',
           'Contexto 400, DTO y versión obsoleta se registran separados de autorización; no se cuentan inexistentes como cobertura',
           'Bandeja propia: se compara contenido/secuencia/historial, excluyendo solo publicado_en asíncrono. No se exige convergencia ni se investiga el incidente histórico de outbox',
           'No se ejecutan recorridos completos anteriores ni DAST; se conservan evidencia previa y corrección SSE. Semilla real reutilizada desde CI, unitaria local usa doble',
           'Núcleo/Redis/base/vhost exclusivos nuevos; sin escrituras de ensayo sobre dominios conservados; proveedores simulados',
           'Ambos proyectos estaban activos al inicio y se restauran; estados restaurados no acreditan disponibilidad HTTP o estabilidad Redash; sin ciclos de recuperación',
           '30 operaciones pendientes; RNF-05/06 parciales; CU-028/F12/fuentes-imágenes/otros SSE/ZeroTier fuera del cambio']}
    (HERE/'EVENTOS-RECINTOS-EVIDENCIA.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
    print('Exportación permitida: Eventos/Recintos16/16, global129/159; tres series218/218; datos crudos excluidos.')
if __name__=='__main__':main()
