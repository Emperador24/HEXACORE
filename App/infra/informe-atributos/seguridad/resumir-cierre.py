"""Exportación por lista permitida; sin SQL, JWT, cookies, QR, cuentas o rutas con UUID."""
import collections,gzip,hashlib,json,os,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[4]
def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert p.is_relative_to(ROOT)
    def leer(n):return json.loads((p/n).read_text())
    serie=leer('finales-cierre-precisa.json');assert serie['estado']=='APROBADA' and len(serie['mediciones'])==3
    salida={'alcance':'Administración de cuentas, CU-028 integrado e ingreso QR; no certificación global de Seguridad',
      'base':'34c84208bc2d70ec385f1133f0939f86f4dc6a77','correccion':leer('version-antes-precisa-final-1.json')['sha'],
      'inventario':{'declaradas':186,'expuestas':181,'protegidas':167,'cubiertasPrevias':151,'nuevas':16,'global':167,'pendientesOperaciones':0,'rnf05Completo':False,'rnf06Completo':False},
      'areas':{'administracionCuentas':5,'rolesPermisos':8,'ingresoQr':3},
      'brechas':[{'caso':'Asignación de rol a sesión abierta bloqueada por roles antiguos en el borde','antes':{'gateway':403,'nucleo':200},'despues':'El gateway valida JWT y delega solo los módulos dinámicos; ambos aplican el permiso vigente'},
                 {'caso':'Roles vigentes ilegibles o vacíos recuperaban permisos antiguos del JWT','antes':{'gateway':200,'nucleo':200},'despues':'503 restrictivo; conserva datos, valores y vencimientos'}],
      'condiciones':{'soloBaseRedisVhostPropios':True,'sinSemillas':True,'sinProveedoresReales':True,'peticionMs':10000,'precondicionMs':3000,'reintentosAutomaticos':0,
        'barridos':'Candados existentes SET NX de 50000/60000ms adquiridos antes de comparar y liberados por testigo después; se exige cero trabajo vencido. Claves y TTL incluidos íntegramente.'},'mediciones':[]}
    pares=[];totalBytes=0;totalGz=0
    versiones=[]
    for i in range(1,4):
        d=leer(f'cierre-precisa-final-{i}.json');assert d['estado']=='APROBADA'
        obs=d['observaciones'];assert all(o['ok'] for o in obs)
        v=leer(f'version-antes-precisa-final-{i}.json');w=leer(f'version-despues-precisa-final-{i}.json')
        comparable=lambda x:{k:x[k] for k in ['sha','fuentes','arnes','runtime']}
        assert comparable(v)==comparable(w)
        if versiones:assert comparable(v)==comparable(versiones[0])
        versiones.append(v)
        naturales=0;cuenta=0
        for o in obs:
            if 'comparacion' not in o:continue
            comp=o['comparacion'];assert o['conservado'] and comp['tablas']==76
            par={'numero':len(pares)+1,'tablas':76}
            for fase in ['antes','despues']:
                raw=(p/comp[fase]).read_bytes();contenido=gzip.decompress(raw)
                assert hashlib.sha256(contenido).hexdigest()==comp[fase+'Sha256']
                estado=json.loads(contenido);assert len(estado['filas'])==76
                assert set(estado)=={'filas','planos','secuencias','outboxEventosCompleta','redis','relojRedis'}
                totalBytes+=len(contenido);totalGz+=len(raw);par[fase+'Sha256']=comp[fase+'Sha256']
            pares.append(par);cuenta+=1;naturales+=len(o.get('expiracionesNaturales',[]))
        assert cuenta==346
        salida['mediciones'].append({'numero':i,'inicioUTC':d['inicio'],'finUTC':d['fin'],'duracionMs':d['duracionMs'],'observaciones':len(obs),
          'solicitudesContabilizadas':sum('estado'in o for o in obs),'categorias':dict(collections.Counter(o['categoria'] for o in obs)),
          'http':dict(collections.Counter(str(o['estado']) for o in obs if 'estado'in o)),
          'rechazosAutorizacion':sum(o.get('estado')in[401,403] for o in obs),'conservaciones':cuenta,'expiracionesNaturales':naturales,
          'canales':[{'canal':c['canal'],'operaciones':c['operaciones'],'conservaciones':c['conservaciones']}for c in d['canales']]})
    salida['procedencia']={k:versiones[0][k] for k in ['sha','fuentes','arnes','runtime']}
    salida['integridad']={'instantaneas':2*len(pares),'pares':len(pares),'bytesJson':totalBytes,'bytesGzip':totalGz,'verificadasSha256YGzip':True,'huellas':pares}
    sse=leer('regresion-sse-cierre.json');assert sse['estado']=='APROBADA' and len(sse['casos'])==12
    salida['regresionSse']=[{k:c[k] for k in ['canal','flujo','fallo','deteccionMs','sinDatosTrasTerminal','inicial']}for c in sse['casos']]
    salida['pruebas']={'backendSeleccionadas':85,'suitesBackend':9,'unitariasNuevas':12,'unitariasReutilizadasReejecutadas':73,'httpNuevaParaCI':1,'comparador':8,'comparadorNuevas':2,'sseHttpAcotados':12,'playwright16Reejecutados':False,'matricesHistoricasReejecutadas':False}
    fallos=[('cierre-desarrollo.json','Restauración ACL dejaba un permiso redundante; no era cambio de autoridad'),('cierre-desarrollo-2.json','Modificador ACL inexistente en el arnés; restaurado con reglas documentadas'),('cierre-desarrollo-3.json','Precondición de Monitoreo esperaba puntoAcceso omitido; QR y Ventas sí aplicaron el ingreso'),('cierre-final-1.json','Alta de candado periódico ajeno al rechazo; comparación conserva la diferencia'),('cierre-cierre-final-3.json','TIME fraccional frente a vencimiento entero; expiración natural verificada en los crudos')]
    salida['historialArnes']=[{'archivo':n,'observaciones':len(leer(n)['observaciones']),'estado':leer(n)['estado'],'diagnostico':causa}for n,causa in fallos]
    salida['historialArnes'] += [{'archivo':'finales-cierre-normalizada.json','observaciones':0,'diagnostico':'Variable de medición sobrescrita por etiqueta de memoria; CLI rechazó antes de llamar aplicaciones'},
      {'archivo':'unitarias-brechas.log','diagnostico':'Diferencia de API WebCrypto njs/Node; adaptador real de bytes corregido'},
      {'archivo':'unitarias-brechas-corregidas.log','diagnostico':'Tipo AlgorithmIdentifier de Node corregido en el arnés'}]
    restauracion=leer('restauracion-parqueaderos.json')
    assert len(restauracion['originales'])==105 and len(restauracion['nuevos'])==6
    assert all(all(x[k]for k in ['idIgual','imagenIgual','montajesIguales','estadoRestaurado'])for x in restauracion['originales'])
    salida['restauracion']={'originales':105,'mismosIdsImagenesMontajesEstados':True,'nuevos':6,'nuevosDetenidos':all(not c['activo']for c in restauracion['nuevos']),
      'cierresNuevos':[c['codigo']for c in restauracion['nuevos']],'oomNuevos':[c['oom']for c in restauracion['nuevos']],'dockerActivo':restauracion['dockerActivo'],'inicioUTC':restauracion['inicio'],'finUTC':restauracion['fin']}
    if (p/'auditoria-restauracion.json').exists():salida['restauracion']['auditoria']=leer('auditoria-restauracion.json')
    # Nunca copiar respuestas o mensajes de error: pueden incluir IDs, códigos QR o valores Redis.
    texto=json.dumps(salida,ensure_ascii=False,indent=2)+'\n'
    (ROOT/'App/infra/informe-atributos/seguridad/CIERRE-EVIDENCIA.json').write_text(texto)
    (p/'integridad-instantaneas.json').write_text(json.dumps({k:v for k,v in salida['integridad'].items()if k!='huellas'},indent=2)+'\n')
    print(json.dumps({'mediciones':len(salida['mediciones']),'pares':len(pares),'instantaneas':2*len(pares),'bytesJson':totalBytes,'expiracionesNaturales':[m['expiracionesNaturales']for m in salida['mediciones']]}))
if __name__=='__main__':main()
