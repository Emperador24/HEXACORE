#!/usr/bin/env python3
"""DAST acotado SQLi/XSS reflejado de API local. Evidencia completa privada.
Contextos exactos, URI/credenciales sin inyección y sin descubrimiento de rutas.
No es un escaneo activo completo de todas las familias o de las 159 operaciones.
"""
import collections, datetime, json, os, pathlib, re, subprocess, sys, time, urllib.parse, urllib.request, urllib.error, uuid

def interno():
    cfg = json.load(sys.stdin)
    def api(componente, tipo, accion, **param):
        u = 'http://127.0.0.1:8080/JSON/' + componente + '/' + tipo + '/' + accion + '/?'
        u += urllib.parse.urlencode({'apikey': cfg['clave'], **param})
        try:
            with urllib.request.urlopen(u, timeout=15) as r: d = json.load(r)
        except urllib.error.HTTPError as e:
            d = json.load(e)
        if 'code' in d: raise RuntimeError(componente + '.' + accion + ': ' + d['code'])
        return d
    api('core', 'action', 'newSession', name='', overwrite='true')
    assert all(int(s['progress'])==100 for s in api('ascan', 'view', 'scans')['scans'])
    # Nombre único: reutilizar el escáner en otra carpeta no colisiona con políticas anteriores.
    politica = 'HEXACORE-recurso-' + cfg['fase'] + '-' + uuid.uuid4().hex[:8]
    api('ascan', 'action', 'addScanPolicy', scanPolicyName=politica, alertThreshold='MEDIUM', attackStrength='MEDIUM')
    # Política específica del ensayo definida ANTES de escanear. No modifica la
    # predeterminada ni filtros de alertas; las familias no elegidas se publican.
    api('ascan', 'action', 'disableAllScanners', scanPolicyName=politica)
    api('ascan', 'action', 'enableScanners', ids='40018,40012', scanPolicyName=politica)
    for accion, valor in [('setOptionThreadPerHost',1),('setOptionHostPerScan',1),
                         ('setOptionTargetParamsInjectable',3),('setOptionTargetParamsEnabledRPC',4),
                         ('setOptionMaxScanDurationInMins',2),('setOptionMaxRuleDurationInMins',1)]:
        api('ascan','action',accion,Integer=valor)
    api('ascan','action','setOptionPersistTemporaryMessages',Boolean='true')
    # categoria selecciona únicamente el evento del ensayo; no se usa como vector.
    api('ascan','action','addExcludedParam',name='categoria',url='http://objetivo:8080/api/v1/cartelera*')
    reglas = api('ascan','view','scanners',scanPolicyName=politica)['scanners']
    assert {s['id'] for s in reglas if s['enabled']=='true'} == {'40018','40012'}
    pasivas = api('pscan','view','scanners')['scanners']
    assert all(s['enabled']=='true' for s in pasivas)
    f=cfg['fixture']; resultados=[];cabeceras_activas=[]
    def enviar(metodo, ruta, token=None, cuerpo=None):
        assert ruta.startswith('/api/v1/') and '\r' not in ruta and '\n' not in ruta
        body='' if cuerpo is None else json.dumps(cuerpo)
        cab = f'{metodo} {ruta} HTTP/1.1\r\nHost: objetivo:8080\r\n'
        if token: cab += 'Authorization: Bearer '+token+'\r\n'
        if cuerpo is not None: cab += 'Content-Type: application/json\r\nContent-Length: '+str(len(body.encode()))+'\r\n'
        d=api('core','action','sendRequest',request=cab+'\r\n'+body,followRedirects='false')['sendRequest'][0]
        return int(d['responseHeader'].split(' ')[1]), d
    planes=[('publica','GET','/api/v1/cartelera?categoria='+urllib.parse.quote(f['codigo'])+'&artista=Ensayo',None,None,200),
            ('protegida-sin-sesion','PATCH','/api/v1/cuentas/perfil',None,{'nombre':'Ensayo ZAP'},401),
            ('cliente','PATCH','/api/v1/cuentas/perfil',cfg['tokens']['loginDast'],{'nombre':'Ensayo ZAP'},200),
            ('personal','GET','/api/v1/pedidos/establecimientos/'+f['local']+'/pedidos?pagina=1',cfg['tokens']['personal'],None,200)]
    try:
        for i,(actor,metodo,ruta,token,cuerpo,esperado) in enumerate(planes):
            url='http://objetivo:8080'+ruta; path=urllib.parse.urlsplit(url).path
            ctx=api('context','action','newContext',contextName=politica+'-'+str(i))['contextId']
            api('context','action','includeInContext',contextName=politica+'-'+str(i),regex='^http://objetivo:8080'+re.escape(path)+r'(\?.*)?$')
            api('context','action','setContextInScope',contextName=politica+'-'+str(i),booleanInScope='true')
            antes=None
            if token:
                antes,_=enviar('GET','/api/v1/cuentas/perfil',token);assert antes==200
            estado,original=enviar(metodo,ruta,token,cuerpo);assert estado==esperado, 'Precondición de API no válida'
            # sendRequest registra la semilla de forma asíncrona en Sites Tree.
            plazo_semilla=time.monotonic()+5
            while url not in api('core','view','urls')['urls']:
                assert time.monotonic()<plazo_semilla,'Semilla aún no registrada: no arrancar escaneo'
                time.sleep(0.1)
            nombre_cabecera=cfg['fase']+'-sesion-'+str(i)
            if token:
                api('replacer','action','addRule',description=nombre_cabecera,enabled='true',matchType='REQ_HEADER',matchRegex='false',matchString='Authorization',replacement='Bearer '+token,url='^http://objetivo:8080'+re.escape(path)+r'(\?.*)?$');cabeceras_activas.append(nombre_cabecera)
            if actor=='publica':
                datos=json.loads(original['responseBody']);assert [e['id'] for e in datos['eventos']]==[f['evento']]
            scan=api('ascan','action','scan',url=url,recurse='false',contextId=ctx,scanPolicyName=politica,method=metodo,postData='' if cuerpo is None else json.dumps(cuerpo))['scan']
            limite=time.monotonic()+150;durante=[];progreso=0
            while True:
                progreso=int(api('ascan','view','status',scanId=scan)['status'])
                if token:
                    st,_=enviar('GET','/api/v1/cuentas/perfil',token);durante.append({'estado':st,'scanActivo':progreso<100});assert st==200,'Se perdió la sesión durante DAST'
                if progreso==100:break
                if time.monotonic()>limite:
                    api('ascan','action','stop',scanId=scan);raise RuntimeError('Presupuesto DAST agotado: conservar el parcial, no declarar cobertura completa')
                time.sleep(2)
            despues=None
            if token:despues,_=enviar('GET','/api/v1/cuentas/perfil',token);assert despues==200
            ids=api('ascan','view','messagesIds',scanId=scan)['messagesIds']
            mensajes=[api('core','view','message',id=n)['message'] for n in ids]
            estados=collections.Counter();bearerCorrecto=0
            for m in mensajes:
                cab=m['requestHeader'];primera=cab.split('\r\n')[0];verbo,destino,_=primera.split(' ',2)
                u=urllib.parse.urlsplit(destino if destino.startswith('http') else 'http://objetivo:8080'+destino)
                assert u.netloc=='objetivo:8080' and u.path==path and verbo==metodo,'ZAP intentó salir de la operación autorizada'
                if actor=='publica':assert urllib.parse.parse_qs(u.query)['categoria']==[f['codigo']]
                if token:
                    assert 'Authorization: Bearer '+token in cab,'Solicitud activa sin su sesión'
                    bearerCorrecto+=1
                estados[m['responseHeader'].split(' ')[1]]+=1
            assert mensajes,'No hubo peticiones activas: no acreditar cobertura'
            detalle=api('ascan','view','scanProgress',scanId=scan)
            resultados.append({'actor':actor,'metodo':metodo,'ruta':ruta,'scan':scan,'progreso':progreso,'mensajes':mensajes,
                'sesionAntes':antes,'sesionDurante':durante,'sesionDespues':despues,'peticiones':len(mensajes),
                'bearerCorrecto':bearerCorrecto,'estados':dict(estados),'detalleReglas':detalle})
            if token:api('replacer','action','removeRule',description=nombre_cabecera);cabeceras_activas.remove(nombre_cabecera)
            print(actor+' terminado: '+str(len(mensajes))+' peticiones activas',file=sys.stderr,flush=True)
    finally:
        for nombre in cabeceras_activas:api('replacer','action','removeRule',description=nombre)
        # Incluso ante error se cancelan SOLO los escaneos de esta sesión local.
        for s in api('ascan','view','scans')['scans']:
            if int(s['progress'])<100:api('ascan','action','stop',scanId=s['id'])
    limite=time.monotonic()+60
    while int(api('pscan','view','recordsToScan')['recordsToScan']) and time.monotonic()<limite:time.sleep(1)
    return {'fechaUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'version':api('core','view','version')['version'],
        'reglas':reglas,'pasivas':pasivas,'escenarios':resultados,'pendientes':int(api('pscan','view','recordsToScan')['recordsToScan']),
        'alertas':api('core','view','alerts',start=0,count=10000)['alerts']}

def validar_resultado(d):
    assert d['pendientes'] == 0
    assert len(d['escenarios']) == 4
    for e in d['escenarios']:
        assert e['progreso'] == 100 and e['peticiones'] > 0
        assert not any(k.startswith('5') and n for k,n in e['estados'].items()), 'HTTP 5xx observado aunque ZAP no alerte'
        plugins = [p['Plugin'] for h in e['detalleReglas']['scanProgress'] if isinstance(h,dict) for p in h.get('HostProcess',[])]
        assert {p[1] for p in plugins} == {'40012','40018'}
        assert all(p[3] == 'Complete' and int(p[5]) > 0 for p in plugins), 'Regla incompleta o sin peticiones: no acreditar cobertura'
        if e['actor'] in ['cliente','personal']:
            assert e['sesionAntes'] == 200 and e['sesionDespues'] == 200
            assert any(x['scanActivo'] and x['estado']==200 for x in e['sesionDurante'])
            assert all(x['estado']==200 for x in e['sesionDurante'])
            assert e['bearerCorrecto'] == e['peticiones']

def main():
    ROOT = pathlib.Path(__file__).resolve().parents[4]
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert p.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=ROOT,check=True)
    fase=sys.argv[1];assert re.fullmatch(r'control|control-interno|control-listo|control-acotado|final-[123]',fase)
    assert not (p/('zap-activo-'+fase+'.json')).exists()
    f=json.loads((p/'fixture.json').read_text());s=json.loads((p/'zap-entorno.json').read_text())
    # Login real fresco por pasada. No tokens fijos ni Administrador de escaneo.
    codigo="""const c=require('./App/infra/informe-atributos/seguridad/comun.cjs');
(async()=>{c.guarda();const f=c.leer('fixture.json'),tokens={};for(const a of ['loginDast','personal']){const r=await c.peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:f.actores[a].email,contrasena:f.clave}});c.assert.equal(r.estado,200);tokens[a]=r.datos.token;}c.guardar('sesiones-dast.json',tokens)})().catch(()=>process.exitCode=1);"""
    subprocess.run(['node','-e',codigo],cwd=ROOT,check=True,capture_output=True)
    tokens=json.loads((p/'sesiones-dast.json').read_text())
    entrada={'clave':s['clave'],'fase':fase,'fixture':{'codigo':f['codigo'],'evento':f['recursos']['dastEvento'],'local':f['local']},'tokens':tokens}
    subprocess.run(['docker','cp',str(pathlib.Path(__file__).resolve()),s['contenedor']+':/tmp/hexacore-dast.py'],check=True,capture_output=True)
    r=subprocess.run(['docker','exec','-i',s['contenedor'],'python3','/tmp/hexacore-dast.py','--interno'],input=json.dumps(entrada),capture_output=True,text=True)
    (p/('zap-activo-'+fase+'.stderr')).write_text(r.stderr)
    if r.returncode:raise RuntimeError('DAST incompleto; revisar evidencia privada de '+fase)
    d=json.loads(r.stdout);assert d['pendientes']==0
    (p/('zap-activo-'+fase+'.json')).write_text(json.dumps(d,indent=2))
    validar_resultado(d)
    print(json.dumps({'fase':fase,'escenarios':len(d['escenarios']),'peticiones':sum(e['peticiones'] for e in d['escenarios']),
                      'alertas':dict(collections.Counter(a['pluginId'] for a in d['alertas']))}))

if __name__=='__main__':
    if sys.argv[1:]==['--interno']:print(json.dumps(interno()))
    else:main()
