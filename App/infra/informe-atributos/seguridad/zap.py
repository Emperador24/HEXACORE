#!/usr/bin/env python3
"""Revisión ZAP pasiva serial de dos SPA y API autenticada/no autenticada.
Las pruebas activas de autorización están en comprobar.cjs. No ejecuta arañas,
fuzzing global ni escaneo activo de ZAP: mutaciones y terceros quedan excluidos.
"""
import json, os, pathlib, re, subprocess, sys, time, urllib.parse, urllib.request

def interno():
    cfg=json.load(sys.stdin);key=cfg['clave'];base='http://127.0.0.1:8080'
    def api(componente,tipo,accion,**parametros):
        url=base+'/JSON/'+componente+'/'+tipo+'/'+accion+'/?'+urllib.parse.urlencode({'apikey':key,**parametros})
        with urllib.request.urlopen(url,timeout=30) as r: d=json.load(r)
        if 'code' in d: raise RuntimeError(d['code'])
        return d
    api('core','action','newSession',name='',overwrite='true')
    version=api('core','view','version')['version'];solicitudes=[]
    destinos=cfg.get('destinos',{'cliente':'http://cliente:4200','admin':'http://admin:4201','api':'http://objetivo:8080'})
    permitidos={(urllib.parse.urlsplit(x).scheme,urllib.parse.urlsplit(x).netloc) for x in destinos.values()}
    def enviar(url,token=None):
        u=urllib.parse.urlsplit(url)
        assert (u.scheme,u.netloc) in permitidos and u.scheme in ['http','https']
        assert not u.username and not u.password and not u.fragment
        # La URI absoluta conserva HTTPS en sendRequest de ZAP.
        request=f'GET {url} HTTP/1.1\r\nHost: {u.netloc}\r\n'
        if token: request+='Authorization: Bearer '+token+'\r\n'
        d=api('core','action','sendRequest',request=request+'\r\n',followRedirects='false')
        msgs=d.get('sendRequest',[]);assert msgs,'ZAP no devolvió mensaje'
        m=msgs[0];estado=int(m['responseHeader'].split(' ')[1]);solicitudes.append({'url':url,'autenticada':bool(token),'estado':estado})
        return m.get('responseBody',''),estado
    omitidos=set()
    for origen in [destinos['cliente'],destinos['admin']]:
        host=urllib.parse.urlsplit(origen).netloc
        html,status=enviar(origen+'/');assert status==200
        enviar(origen+'/login')
        assets=re.findall(r'(?:src|href)=["\']([^"\']+)["\']',html)
        for asset in sorted(set(assets)):
            url=urllib.parse.urljoin(origen+'/',asset);u=urllib.parse.urlsplit(url)
            if u.netloc!=host: omitidos.add(u.netloc);continue
            if re.search(r'\.(js|css)(?:\?|$)',url): enviar(url)
    f=cfg.get('fixture',{});auth=cfg['tokens']
    publicas=cfg.get('publicas',['/salud','/cartelera','/pagos/configuracion','/cuentas/perfil',f'/pedidos/mis-pedidos/{f.get("pedido", "")}'])
    autenticadas=cfg.get('autenticadas',[['/cuentas/perfil','cliente'],[f'/pedidos/mis-pedidos/{f.get("pedido", "")}','cliente'],[f'/pedidos/establecimientos/{f.get("local", "")}/menu','personal']])
    assert autenticadas, 'Falta cobertura autenticada'
    for ruta in publicas:
        assert ruta.startswith('/') and '?' not in ruta and '#' not in ruta
        _,estado=enviar(destinos['api']+'/api/v1'+ruta)
        esperado=cfg.get('esperadosPublicos',{}).get(ruta)
        if esperado is not None: assert estado==esperado,'Respuesta pública distinta del contrato del escaneo'
    for ruta,actor in autenticadas:
        assert ruta.startswith('/') and '?' not in ruta and '#' not in ruta
        _,estado=enviar(destinos['api']+'/api/v1'+ruta,auth[actor]);assert estado==200,'No hubo cobertura autenticada fuera de login'
    plazo=time.monotonic()+120
    pendientes=int(api('pscan','view','recordsToScan')['recordsToScan'])
    while pendientes and time.monotonic()<plazo:
        time.sleep(1);pendientes=int(api('pscan','view','recordsToScan')['recordsToScan'])
    alertas=[]
    while True:
        pagina=api('core','view','alerts',start=len(alertas),count=500)['alerts']
        alertas.extend(pagina)
        if len(pagina)<500: break
    reglas=api('pscan','view','scanners')['scanners']
    return {'version':version,'solicitudes':solicitudes,'alertas':alertas,'reglas':reglas,'pendientes':pendientes,'hostsExcluidos':sorted(omitidos),'activoZAP':False,'cobertura':'Pasivo HTTP de HTML/assets iniciales de dos SPA y API; no ejecuta JavaScript ni representa toda la navegación Angular'}

def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();root=pathlib.Path(__file__).resolve().parents[4]
    assert p.is_relative_to(root);subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=root,check=True)
    nombre=sys.argv[1];assert nombre in ['inicial','final-1','final-2','final-3']
    c=json.loads((p/'zap-entorno.json').read_text());f=json.loads((p/'fixture.json').read_text());tokens=json.loads((p/'sesiones-zap.json').read_text())
    subprocess.run(['docker','cp',str(pathlib.Path(__file__).resolve()),c['contenedor']+':/tmp/hexacore-seguridad-zap.py'],check=True,capture_output=True)
    entrada=json.dumps({'clave':c['clave'],'fixture':{'pedido':f['pedido'],'local':f['local']},'tokens':tokens})
    r=subprocess.run(['docker','exec','-i',c['contenedor'],'python3','/tmp/hexacore-seguridad-zap.py','--interno'],input=entrada,text=True,capture_output=True)
    (p/('zap-'+nombre+'.stderr')).write_text(r.stderr)
    if r.returncode: raise RuntimeError('Falló ZAP; revisar salida privada '+nombre)
    d=json.loads(r.stdout);(p/('zap-'+nombre+'.json')).write_text(json.dumps(d,indent=2))
    resumen={}
    for a in d['alertas']:
        k=a['pluginId'];x=resumen.setdefault(k,{'nombre':a['name'],'riesgo':a['risk'],'confianza':a['confidence'],'instancias':0});x['instancias']+=1
    print(json.dumps({'ejecucion':nombre,'version':d['version'],'solicitudes':len(d['solicitudes']),'autenticadas200':sum(s['autenticada'] and s['estado']==200 for s in d['solicitudes']),'pendientes':d['pendientes'],'alertas':resumen},ensure_ascii=False))

if __name__=='__main__':
    if sys.argv[1:] == ['--interno']: print(json.dumps(interno()))
    else: main()
