#!/usr/bin/env python3
"""Nginx/njs/Caddy reales contra dos dobles en red Docker efímera, solo en CI."""
import argparse
import base64
import http.client
import json
import os
from pathlib import Path
import ssl
import subprocess
import tempfile
import time
import uuid

import montaje
from comun import exigir,escribir,json_bytes
from soporte_pruebas import certificados,configuracion


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--imagen',required=True);a=p.parse_args()
    exigir(os.environ.get('GITHUB_ACTIONS')=='true','Solo runner CI; no crea/para recursos en el computador de trabajo')
    propietario=str(uuid.uuid4());prefijo='hxc-zt-ci-'+propietario[:12];creados=[];red=None
    def docker(*args):return subprocess.check_output(['docker',*map(str,args)],text=True).strip()
    def inspeccion(nombre):return json.loads(docker('inspect',nombre))[0]
    def lanzar(sufijo,imagen,args=(),alias=(),montajes=(),publicar=None,env=()):
        nombre=prefijo+'-'+sufijo
        cmd=['run','-d','--name',nombre,'--label','hexacore.zt.ci='+propietario,'--network',prefijo]
        for x in alias:cmd+=['--network-alias',x]
        for x,y in montajes:cmd+=['--mount',f'type=bind,source={x},target={y},readonly']
        if publicar:cmd+=['-p','127.0.0.1::'+str(publicar)]
        for x in env:cmd+=['-e',x]
        docker(*cmd,imagen,*args);creados.append(nombre);return nombre
    def token(clave,roles):
        def b64(x):return base64.urlsafe_b64encode(x).decode().rstrip('=')
        ahora=int(time.time())
        datos=b64(json.dumps(dict(alg='RS256',typ='JWT')).encode())+'.'+b64(json.dumps(dict(
            sub=str(uuid.uuid4()),jti=str(uuid.uuid4()),roles=roles,iss='hexacore-administracion',iat=ahora,exp=ahora+300)).encode())
        firma=subprocess.check_output(['openssl','dgst','-sha256','-sign',str(clave)],input=datos.encode())
        return datos+'.'+b64(firma)
    def pedir(puerto,ruta,metodo='GET',cab=None):
        conexion=http.client.HTTPConnection('127.0.0.1',puerto,timeout=8)
        try:
            conexion.request(metodo,ruta,body=b'{}' if metodo=='POST' else None,headers=cab or {})
            r=conexion.getresponse();return r.status,dict(r.getheaders()),r.read()
        finally:conexion.close()
    with tempfile.TemporaryDirectory(prefix='hexacore-zt-ci-') as tmp:
        d=Path(tmp);certificados(d);(d/'secretos/jwt-publica.pem').chmod(0o644)
        try:
            docker('network','create','--label','hexacore.zt.ci='+propietario,prefijo);red=prefijo
            for img in ['node:22.22.3-alpine','caddy:2.8.4-alpine']:docker('pull',img)
            mock=Path(__file__).with_name('mock_gateway_ci.cjs')
            na=lanzar('a','node:22.22.3-alpine',('node','/mock.cjs'),
                alias=['nucleo','boleteria','portal-web-cliente','portal-web-admin'],montajes=[(mock,'/mock.cjs')],env=['EQUIPO=A'])
            nb=lanzar('b','node:22.22.3-alpine',('node','/mock.cjs'),montajes=[(mock,'/mock.cjs')],env=['EQUIPO=B'])
            ipb=inspeccion(nb)['NetworkSettings']['Networks'][prefijo]['IPAddress']
            c=configuracion(d);c['ip_b']=ipb
            escribir(d/'nginx.conf',montaje.nginx(c));escribir(d/'principal.conf',montaje.principal());escribir(d/'Caddyfile',montaje.caddy(c))
            ng=lanzar('gateway',a.imagen,alias=['api-gateway'],publicar=8080,montajes=[
                (d/'nginx.conf','/etc/nginx/conf.d/default.conf'),(d/'principal.conf','/etc/nginx/nginx.conf'),
                (d/'secretos/jwt-publica.pem','/etc/nginx/claves/jwt-publica.pem')])
            puerto=int(inspeccion(ng)['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'])
            # Precondición de arranque, separada de los casos y sin repetir un caso fallido.
            limite=time.monotonic()+20
            while True:
                try:
                    if pedir(puerto,'/salud')[0]==200:break
                except OSError:pass
                exigir(time.monotonic()<limite,'Gateway no arrancó');time.sleep(0.2)
            docker('exec',ng,'nginx','-t')
            jwt=token(d/'secretos/jwt-privada.pem',['Cliente'])
            organizador=token(d/'secretos/jwt-privada.pem',['Organizador'])
            for ruta,headers,esperado in [('/api/v1/sesiones/actual',{},401),
                ('/api/v1/admin/cuentas',{'Authorization':'Bearer '+jwt},403),
                ('/api/v1/sesiones/actual',{'Authorization':'Bearer a.b.c'},401)]:
                exigir(pedir(puerto,ruta,cab=headers)[0]==esperado,'Cambió autenticación/rol sensible')
            vistos=set();ids=[]
            for i in range(20):
                id=str(uuid.uuid4());ids.append(id)
                codigo,headers,_=pedir(puerto,'/api/v1/cartelera',cab={'X-Demo-Solicitud':id})
                exigir(codigo==200 and headers.get('X-Demo-Solicitud')==id,'Identificación/correlación no coincide')
                vistos.add(headers['X-Servidor'])
            exigir(len(vistos)==2 and ipb+':3001' in vistos,'Los dos destinos no atendieron tráfico')
            logs=docker('logs',ng)
            filas=[json.loads(l) for l in logs.splitlines() if l.startswith('{')]
            exigir(all(any(f.get('solicitud')==id and f.get('http')==200 for f in filas) for id in ids),'Falta correlación en logs')
            # Un POST interrumpido llega una sola vez, aunque exista otro destino.
            estado,_,_=pedir(puerto,'/api/v1/pagos/webhook',metodo='POST',cab={'X-Prueba-Interrumpir':'si'})
            exigir(estado==503,'El fallo de escritura no quedó visible')
            def cuentas(n):
                return json.loads(docker('exec',n,'node','-e',"fetch('http://127.0.0.1:3002/_control').then(r=>r.text()).then(console.log)"))
            exigir(sum(r['metodo']=='POST' for n in [na,nb] for r in cuentas(n))==1,'Se reenvió una escritura')
            # Espera la cuarentena configurada de 10 s antes de la prueba siguiente.
            time.sleep(10.2)
            ca=lanzar('https','caddy:2.8.4-alpine',publicar=443,montajes=[
                (d/'Caddyfile','/etc/caddy/Caddyfile'),(d/'tls.pem','/certificados/certificado.pem'),(d/'tls.key','/certificados/privada.pem')])
            tlsport=int(inspeccion(ca)['NetworkSettings']['Ports']['443/tcp'][0]['HostPort'])
            docker('exec',ca,'caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile')
            # HTTPS con CA y hostname verificados; Host selecciona el portal configurado.
            conexion=http.client.HTTPSConnection('localhost',tlsport,context=ssl.create_default_context(cafile=str(d/'tls.pem')),timeout=8)
            conexion.request('GET','/api/v1/sesiones/actual',headers={'Host':'demo.test','Authorization':'Bearer '+jwt})
            res=conexion.getresponse();exigir(res.status==200,'HTTPS no conserva sesión');res.read();conexion.close()
            sse=http.client.HTTPConnection('127.0.0.1',puerto,timeout=8)
            inicio=time.monotonic();sse.request('GET','/api/v1/monitoreo/prueba',headers={'Authorization':'Bearer '+organizador})
            res=sse.getresponse();exigir(res.status==200 and res.readline().startswith(b'data:'),'SSE no emite su primer frame')
            exigir(time.monotonic()-inicio<1.5,'SSE acumuló la respuesta en vez de transmitir');res.read();sse.close()
            # Solo un doble de CI se detiene. No es una prueba entre computadores ni ZeroTier.
            docker('stop','--time','2',nb)
            codigos=[];servidores=[]
            for i in range(15):
                codigo,headers,_=pedir(puerto,'/api/v1/cartelera');codigos.append(codigo);servidores.append(headers.get('X-Servidor',''))
            exigir(503 in codigos and codigos[-5:]==[200]*5,'No conservó fallo y recuperación posterior')
            exigir(all(not s.startswith(ipb+':') for s in servidores[-5:]),'Después no atendió A')
            print(json.dumps(dict(prueba='infraestructura_simulada_CI',destinos=len(vistos),auth='401/403 conservados',
                post_interrumpido=503,post_recibidos=1,https='CA+hostname verificados',sse='primer frame sin buffering',
                codigos_caida_doble=codigos,resultado='aprobado',distribuida_real=False)))
        finally:
            for nombre in reversed(creados):
                obj=inspeccion(nombre)
                exigir(obj['Config']['Labels'].get('hexacore.zt.ci')==propietario,'No limpiar contenedor ajeno')
                docker('rm','-f',nombre)
            if red:
                obj=json.loads(docker('network','inspect',red))[0]
                exigir(obj['Labels'].get('hexacore.zt.ci')==propietario,'No limpiar red ajena')
                docker('network','rm',red)


if __name__=='__main__':main()
