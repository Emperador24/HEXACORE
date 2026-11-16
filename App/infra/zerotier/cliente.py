#!/usr/bin/env python3
"""Observador C: una petición por muestra, TLS verificado, sin renovación/reintento."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.client import HTTPSConnection, HTTPException
import json
import os
from pathlib import Path
import re
import signal
import socket
import ssl
import statistics
import sys
import threading
import time
from urllib.parse import urlsplit
import uuid

from comun import (dominio, exigir, escribir, huella, ip_privada, json_bytes,
                   leer_json, privado, red_local)

RUTAS = {'publica':'/api/v1/cartelera', 'autenticada':'/api/v1/sesiones/actual'}
MAXIMO = 1048576


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def instante(texto):
    return datetime.fromisoformat(texto.replace('Z','+00:00')).timestamp()


def validar(c):
    exigir(isinstance(c,dict) and set(c)=={'demo','fuente','red_zerotier','ip_a','ip_b','ip_c','url','ca','upstreams_a','puertos_b'},'Campos C desconocidos/incompletos')
    exigir(all(isinstance(c[k],str) for k in ['demo','fuente','red_zerotier','url']),'Campos de texto C inválidos')
    exigir(re.fullmatch(r'[a-z][a-z0-9-]{2,23}',c['demo']) is not None,'Identificador de demo inválido')
    exigir(re.fullmatch(r'[a-f0-9]{40}',c['fuente']) is not None,'Falta SHA común de A/B')
    exigir(re.fullmatch(r'[a-f0-9]{16}',c['red_zerotier']) is not None,'Falta red privada autorizada')
    ips=[ip_privada(c[k]) for k in ['ip_a','ip_b','ip_c']]
    exigir(len(set(ips))==3,'A, B y C deben ser equipos/IP distintos')
    u=urlsplit(c['url'])
    exigir(u.scheme=='https' and not u.username and not u.password and u.path in ('','/') and not u.query and not u.fragment,'C requiere un origen HTTPS estable, sin credenciales/query')
    dominio(u.hostname)
    exigir(u.port is None or 1<=u.port<=65535,'Puerto HTTPS inválido')
    exigir(c['ca'] is None or (isinstance(c['ca'],str) and Path(c['ca']).is_file()),'Falta CA de confianza en C; null usa confianza del sistema')
    exigir(isinstance(c['upstreams_a'],dict) and set(c['upstreams_a'])==set(RUTAS) and all(isinstance(x,str) for x in c['upstreams_a'].values()),'Copiar upstreams_a reales del estado de A')
    exigir(isinstance(c['puertos_b'],dict) and set(c['puertos_b'])==set(RUTAS) and all(type(x) is int and 1<=x<=65535 for x in c['puertos_b'].values()),'Puertos publicados de B inválidos')
    for nombre,addr in c['upstreams_a'].items():
        partes=addr.split(':')
        exigir(len(partes)==2 and partes[1]==('3001' if nombre=='publica' else '3002'),'Upstream A inválido')
        ip_privada(partes[0])
        exigir(partes[0]!=c['ip_b'],'No confundir upstream A con dirección publicada de B')
    return c


def comprobar(c):
    validar(c)
    red_local(dict(rol='B',ip_b=c['ip_c'],red_zerotier=c['red_zerotier']))
    u=urlsplit(c['url'])
    ips={r[4][0] for r in socket.getaddrinfo(u.hostname,u.port or 443,type=socket.SOCK_STREAM)}
    exigir(ips=={c['ip_a']},'El nombre HTTPS no resuelve exclusivamente a la IP de A desde C')
    contexto=ssl.create_default_context(cafile=c['ca'])
    with socket.create_connection((u.hostname,u.port or 443),timeout=5) as sock:
        with contexto.wrap_socket(sock,server_hostname=u.hostname) as tls:
            return dict(https='verificado',tls=tls.version(),url=c['url'])


def http(url, ca, ruta, *, token=None, metodo='GET', datos=None, solicitud=None, timeout=8):
    """Conexión nueva; sin redirects, caché, proxies de entorno o reenvío."""
    u=urlsplit(url)
    exigir(u.scheme=='https','Solo HTTPS')
    contexto=ssl.create_default_context(cafile=ca)
    conexion=HTTPSConnection(u.hostname,u.port or 443,timeout=timeout,context=contexto)
    cabeceras={'Accept':'application/json','Connection':'close','Cache-Control':'no-cache, no-store','Pragma':'no-cache'}
    if token:cabeceras['Authorization']='Bearer '+token
    if solicitud:cabeceras['X-Demo-Solicitud']=solicitud
    if datos is not None:
        cabeceras.update({'Content-Type':'application/json','X-Hexacore-Cliente':'web'})
    estado=0; hs={}; cuerpo=b''; error=None
    try:
        conexion.request(metodo,ruta,body=json.dumps(datos).encode() if datos is not None else None,headers=cabeceras)
        r=conexion.getresponse();estado=r.status;hs={k.lower():v for k,v in r.getheaders()}
        cuerpo=r.read(MAXIMO+1)
        if len(cuerpo)>MAXIMO:error='RESPUESTA_DEMASIADO_GRANDE';cuerpo=b''
    except (OSError,HTTPException,ValueError) as e:
        error=type(e).__name__  # Nunca valores del body, cookie, credencial o excepción.
    finally:conexion.close()
    return estado,hs,cuerpo,error


def equipo(c,nombre,servidor):
    if servidor==c['upstreams_a'][nombre]:return 'A'
    if servidor==c['ip_b']+':'+str(c['puertos_b'][nombre]):return 'B'
    return 'desconocido'


def muestra(c,nombre,token,identidad,solicitud):
    inicio=time.monotonic_ns();fecha=utc()
    estado,headers,cuerpo,error=http(c['url'],c['ca'],RUTAS[nombre],token=token if nombre=='autenticada' else None,solicitud=solicitud)
    identidad_actual=None;cantidad=None;valido=False
    try:
        dato=json.loads(cuerpo)
        if nombre=='publica':
            valido=isinstance(dato,dict) and isinstance(dato.get('eventos'),list) and type(dato.get('total')) is int
            if valido:cantidad=dato['total']
        else:
            valido=isinstance(dato,dict) and isinstance(dato.get('id'),str)
            if valido:identidad_actual=huella(dato['id'].encode());valido=identidad_actual==identidad
    except (ValueError,TypeError):pass
    servidor=headers.get('x-servidor','')[:512]
    return dict(tipo='respuesta',solicitud=solicitud,lectura=nombre,ruta=RUTAS[nombre],inicio_utc=fecha,fin_utc=utc(),
                inicio_ns=inicio,fin_ns=time.monotonic_ns(),duracion_ms=(time.monotonic_ns()-inicio)/1e6,
                http=estado,error_transporte=error,servidor=servidor,equipo=equipo(c,nombre,servidor),
                correlacion=headers.get('x-demo-solicitud')==solicitud,contenido_valido=valido,
                identidad_sha256=identidad_actual,total_publico=cantidad,cuerpo_sha256=huella(cuerpo))


def append(ruta,obj):
    datos=(json.dumps(obj,separators=(',',':'))+'\n').encode()
    fd=os.open(ruta,os.O_CREAT|os.O_WRONLY|os.O_APPEND,0o600)
    try:
        exigir(os.write(fd,datos)==len(datos),'Escritura de evidencia incompleta');os.fsync(fd)
    finally:os.close(fd)


def leer_lineas(ruta):
    p=Path(ruta)
    if not p.exists():return []
    # Una última línea truncada se informa como error; no desaparece del análisis.
    salida=[]
    for n,linea in enumerate(p.read_text().splitlines(),1):
        try:salida.append(json.loads(linea))
        except ValueError:salida.append(dict(tipo='registro_incompleto',linea=n))
    return salida


def iniciar(c,sesion,destino,duracion=180,intervalo=0.5):
    comprobar(c)
    exigir(30<=duracion<=600 and 0.2<=intervalo<=2,'Duración 30–600 s e intervalo 0,2–2 s')
    s=leer_json(sesion,secreto=True)
    exigir(isinstance(s.get('token'),str) and isinstance(s.get('identidad_sha256'),str),'Sesión propia incompleta')
    exigir(0<len(s['token'])<=16384 and not any(x in s['token'] for x in '\r\n'),'Token con formato de cabecera inválido')
    exigir(instante(s['expiraEn'])-time.time()>=duracion+15,'La sesión debe cubrir toda la medición; no se renueva automáticamente')
    d=privado(destino);exigir(not d.exists(),'Conservar ensayos anteriores; usar directorio nuevo')
    d.mkdir(mode=0o700,parents=True)
    meta=dict(configuracion=c,inicio_utc=utc(),inicio_ns=time.monotonic_ns(),pid=os.getpid(),
              sesion_sha256=huella(s['token'].encode()),identidad_sha256=s['identidad_sha256'],
              intervalo_s=intervalo,timeout_s=8,duracion_s=duracion)
    escribir(d/'metadatos.json',json_bytes(meta))
    parada=threading.Event();escritura=threading.Lock()
    for sig in (signal.SIGINT,signal.SIGTERM):signal.signal(sig,lambda *_:parada.set())
    def lector(nombre):
        while not parada.is_set():
            ahora=time.monotonic();solicitud=str(uuid.uuid4())
            with escritura:append(d/'lecturas.jsonl',dict(tipo='inicio',solicitud=solicitud,lectura=nombre,inicio_ns=time.monotonic_ns(),utc=utc()))
            try:r=muestra(c,nombre,s['token'],s['identidad_sha256'],solicitud)
            except Exception as e:
                with escritura:append(d/'lecturas.jsonl',dict(tipo='error_lector',solicitud=solicitud,error=type(e).__name__))
                parada.set();raise
            r['sesion_sha256']=meta['sesion_sha256'] if nombre=='autenticada' else None
            with escritura:append(d/'lecturas.jsonl',r)
            parada.wait(max(0,intervalo-(time.monotonic()-ahora)))
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futuros=[pool.submit(lector,n) for n in RUTAS]
            try:
                fin=time.monotonic()+duracion
                while not parada.wait(0.5):
                    temp=d/'latido.tmp';temp.write_text(str(time.monotonic_ns()));os.chmod(temp,0o600);temp.replace(d/'latido')
                    for futuro in futuros:
                        if futuro.done():futuro.result();raise RuntimeError('Lector terminado antes del fin')
                    if time.monotonic()>=fin:break
            finally:parada.set()
            for futuro in futuros:futuro.result()
    finally:
        parada.set();escribir(d/'finalizado.json',json_bytes(dict(utc=utc(),fin_ns=time.monotonic_ns())))


def crear_sesion(c,credenciales,salida):
    comprobar(c)
    cuenta=leer_json(credenciales,secreto=True)
    exigir(set(cuenta)=={'email','contrasena'},'Archivo de credenciales propio: email y contrasena')
    estado,_,cuerpo,error=http(c['url'],c['ca'],'/api/v1/sesiones',metodo='POST',datos=cuenta)
    exigir(estado==200 and error is None,'Login falló; no se reintenta automáticamente: '+str(estado)+' '+str(error))
    r=json.loads(cuerpo)
    escribir(privado(salida),json_bytes(dict(token=r['token'],expiraEn=r['expiraEn'],identidad_sha256=huella(r['usuario']['id'].encode()))))


def importar_logs(d,entrada):
    exigir((d/'metadatos.json').is_file(),'Iniciar el registro de C antes de importar logs')
    for linea in entrada:
        try:
            r=json.loads(linea)
            exigir(set(r)=={'utc','solicitud','metodo','ruta','http','servidor','duracion_s','upstream_s'},'Formato de log no esperado')
            exigir(r['ruta'] in RUTAS.values() and r['metodo']=='GET','Log ajeno al observador')
            exigir(re.fullmatch(r'[a-f0-9-]{36}',r['solicitud']) is not None,'ID no correlacionable')
            instante(r['utc'])
            append(d/'gateway.jsonl',r)
        except (ValueError,TypeError,KeyError):
            append(d/'importacion-errores.jsonl',dict(utc=utc(),error='LOG_NO_VALIDO',sha256=huella(linea.encode())))


def exitoso(r):
    return r.get('tipo')=='respuesta' and r['http']==200 and r['error_transporte'] is None and r['correlacion'] and r['contenido_valido'] and r['equipo'] in ('A','B')


def acreditar(d,estado_a,estado_b,ahora_ns=None):
    """Puerta cerrada por defecto: respuestas de negocio, ID+upstream+HTTP en logs."""
    ahora_ns=ahora_ns or time.monotonic_ns()
    m=leer_json(d/'metadatos.json');c=m['configuracion']
    exigir(not (d/'finalizado.json').exists(),'C ya terminó; no habilitar apagado')
    exigir((d/'latido').exists() and 0<=ahora_ns-int((d/'latido').read_text())<=3_000_000_000,'El registrador de C no está activo')
    os.kill(m['pid'],0)
    for estado,rol in [(estado_a,'A'),(estado_b,'B')]:
        exigir(estado.get('rol')==rol and estado.get('demo')==c['demo'] and estado.get('fuente')==c['fuente'] and
               estado.get('red_zerotier')==c['red_zerotier'] and estado.get('ip_a')==c['ip_a'] and estado.get('ip_b')==c['ip_b'] and
               estado.get('puertos_b')==c['puertos_b'], 'Versiones/red/equipos A/B no corresponden')
        for nombre in ['nucleo','boleteria']:
            filas=[x for x in estado['contenedores'] if x['servicio']==nombre]
            exigir(len(filas)==1 and filas[0]['estado']=='running' and filas[0]['salud']=='healthy','Inventario A/B incompleto')
    exigir(estado_a['upstreams_a']==c['upstreams_a'],'Cambió la IP Docker de A: actualizar configuración de C')
    lecturas=leer_lineas(d/'lecturas.jsonl')
    exigir(not any(x.get('tipo') in ('registro_incompleto','error_lector') for x in lecturas),'Registro de C incompleto; conservar y diagnosticar')
    logs={x.get('solicitud'):x for x in leer_lineas(d/'gateway.jsonl')}
    proof={}
    for nombre in RUTAS:
        recientes=[r for r in lecturas if r.get('tipo')=='respuesta' and r['lectura']==nombre and 0<=ahora_ns-r['fin_ns']<=30_000_000_000]
        exigir(len(recientes)>=10 and all(exitoso(x) for x in recientes[-10:]),'Falta línea base sin errores recientes: '+nombre)
        exigir(len({r['cuerpo_sha256'] for r in recientes[-10:]})==1,'Los datos de A/B no coinciden; congelar las escrituras del ensayo: '+nombre)
        if nombre=='autenticada':
            exigir(all(r['sesion_sha256']==m['sesion_sha256'] and r['identidad_sha256']==m['identidad_sha256'] for r in recientes),'Cambió sesión o identidad')
        else:exigir(all(r.get('total_publico',0)>0 for r in recientes[-10:]),'Preparar al menos un evento publicado propio; no usar salud ni cartelera vacía como prueba de datos')
        for eq in ['A','B']:
            candidatos=[r for r in recientes if r['equipo']==eq and exitoso(r) and (eq!='B' or ahora_ns-r['fin_ns']<=10_000_000_000)]
            validos=[]
            for r in candidatos:
                l=logs.get(r['solicitud'])
                if l and l.get('http')==200 and l.get('servidor')==r['servidor'] and l.get('ruta')==r['ruta'] and abs(instante(l['utc'])-instante(r['fin_utc']))<=2:
                    validos.append(r['solicitud'])
            exigir(len(validos)>=3,f'Faltan 3 respuestas reales recientes de {eq}/{nombre} correlacionadas con gateway')
            proof[eq+'/'+nombre]=validos[-3:]
    return dict(utc=utc(),ns=ahora_ns,prueba=proof,fuente=c['fuente'],sesion_sha256=m['sesion_sha256'])


def armar(d,a,b):
    prueba=acreditar(d,a,b)
    append(d/'marcas.jsonl',dict(tipo='armado',**prueba))
    print('REPARTO ACREDITADO. C sigue midiendo. Marcar apagar-b dentro de 5 s; apagado físico manual por el responsable de B.')


def marcar(d,tipo,a=None,b=None):
    marcas=leer_lineas(d/'marcas.jsonl')
    if tipo=='apagar-b':
        armados=[r for r in marcas if r.get('tipo')=='armado']
        exigir(armados and 0<=time.monotonic_ns()-armados[-1]['ns']<=5_000_000_000,'Armar con tráfico reciente antes del apagado')
        exigir(not any(r.get('tipo')=='apagar-b' for r in marcas),'Una caída por registro; no sobrescribir ensayos')
        prueba=acreditar(d,a,b)
    else:
        exigir(any(r.get('tipo')=='apagar-b' for r in marcas),'Falta marca previa de apagado')
        exigir(not any(r.get('tipo')==tipo for r in marcas),'Marca ya registrada')
        prueba=dict(utc=utc(),ns=time.monotonic_ns())
    append(d/'marcas.jsonl',dict(tipo=tipo,**prueba))
    print('Marca registrada; ninguna máquina/proceso ha sido detenido por el observador.')


def informe(d):
    m=leer_json(d/'metadatos.json');todos=leer_lineas(d/'lecturas.jsonl')
    marcas=leer_lineas(d/'marcas.jsonl');rs=[r for r in todos if r.get('tipo')=='respuesta']
    caida=next((x['ns'] for x in marcas if x.get('tipo')=='apagar-b'),None)
    confirmada=next((x['ns'] for x in marcas if x.get('tipo')=='b-apagado'),None)
    resultado=dict(url=m['configuracion']['url'],fuente=m['configuracion']['fuente'],muestras=len(rs),
        http={},errores_transporte={},registros_incompletos=sum(x.get('tipo')=='registro_incompleto' for x in todos),
        errores_lector=sum(x.get('tipo')=='error_lector' for x in todos),
        errores_importacion=len(leer_lineas(d/'importacion-errores.jsonl')),lecturas={},
        intervalo_s=m['intervalo_s'],timeout_s=m['timeout_s'],apagado_manual_declarado=confirmada is not None,
        afirmacion='Evidencia de C; revisar apagado físico, configuración y registros reales A/B. No acredita disponibilidad mensual.')
    for r in rs:
        k=str(r['http']);resultado['http'][k]=resultado['http'].get(k,0)+1
        if r['error_transporte']:
            k=r['error_transporte'];resultado['errores_transporte'][k]=resultado['errores_transporte'].get(k,0)+1
    for nombre in RUTAS:
        xs=sorted([r for r in rs if r['lectura']==nombre],key=lambda r:r['inicio_ns'])
        post=[r for r in xs if caida is not None and r['inicio_ns']>=caida]
        corte=confirmada or caida
        estables=[r for r in post if corte is not None and r['inicio_ns']>=corte]
        seguidas=[];primera=None;estable=None
        for r in estables:
            if exitoso(r) and r['equipo']=='A':
                if primera is None:primera=r['fin_ns']
                seguidas.append(r)
                if len(seguidas)==10:estable=r['fin_ns'];break
            else:seguidas=[]
        previos=[r for r in xs if caida is not None and r['fin_ns']<caida and exitoso(r)]
        ultimo=previos[-1] if previos else None
        validas_post=[r for r in post if exitoso(r)]
        iguales=bool(ultimo and validas_post and all(r['cuerpo_sha256']==ultimo['cuerpo_sha256'] for r in validas_post))
        tiempos=sorted(r['duracion_ms'] for r in xs)
        exitos=[r['fin_ns'] for r in xs if exitoso(r)]
        resultado['lecturas'][nombre]=dict(posteriores=len(post),errores=sum(not exitoso(r) for r in post),
            latencia_mediana_ms=statistics.median(tiempos) if tiempos else None,
            latencia_p95_ms=tiempos[max(0,(95*len(tiempos)+99)//100-1)] if tiempos else None,
            mayor_intervalo_entre_exitos_ms=max((b-a for a,b in zip(exitos,exitos[1:])),default=0)/1e6,
            en_curso_al_marcar=sum(caida is not None and r['inicio_ns']<caida<r['fin_ns'] for r in xs),
            interrumpidas=sum(caida is not None and r['inicio_ns']<caida<r['fin_ns'] and not exitoso(r) for r in xs),
            respuestas_b_tras_confirmacion=sum(confirmada is not None and r['inicio_ns']>=confirmada and exitoso(r) and r['equipo']=='B' for r in xs),
            primera_a_ms=(primera-caida)/1e6 if primera and caida else None,
            diez_a_consecutivas_ms=(estable-caida)/1e6 if estable and caida else None,
            datos_sin_cambio=iguales,
            sesion_sin_cambio=all(r.get('sesion_sha256')==m['sesion_sha256'] for r in post) if nombre=='autenticada' and post else None,
            identidad_sin_cambio=all(r.get('identidad_sha256')==m['identidad_sha256'] for r in post if r['http']==200 and r['error_transporte'] is None) if nombre=='autenticada' and validas_post else None,
            intervalo_desde_ultimo_exito_ms=(primera-ultimo['fin_ns'])/1e6 if primera and ultimo else None)
    inicios={r['solicitud'] for r in todos if r.get('tipo')=='inicio'}
    terminadas={r['solicitud'] for r in rs}
    resultado['solicitudes_sin_fin']=len(inicios-terminadas)
    return resultado


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='accion',required=True)
    for n in ['comprobar','sesion','iniciar']:
        s=sub.add_parser(n);s.add_argument('--config',required=True)
        if n=='sesion':s.add_argument('--credenciales',required=True);s.add_argument('--salida',required=True)
        if n=='iniciar':
            s.add_argument('--sesion',required=True);s.add_argument('--directorio',required=True)
            s.add_argument('--duracion',type=int,default=180);s.add_argument('--intervalo',type=float,default=0.5)
    for n in ['importar-logs','reparto','armar','marcar','informe']:
        s=sub.add_parser(n);s.add_argument('--directorio',required=True)
        if n in ['reparto','armar','marcar']:
            s.add_argument('--estado-a',required=True);s.add_argument('--estado-b',required=True)
        if n=='marcar':s.add_argument('--evento',choices=['apagar-b','b-apagado','b-restaurado'],required=True)
    a=p.parse_args()
    if a.accion in ['comprobar','sesion','iniciar']:
        c=validar(leer_json(a.config))
        if a.accion=='comprobar':print(json.dumps(comprobar(c)));return
        if a.accion=='sesion':crear_sesion(c,a.credenciales,a.salida);print('Sesión propia guardada en archivo privado; sin reintentos.');return
        iniciar(c,a.sesion,a.directorio,a.duracion,a.intervalo);return
    d=privado(a.directorio)
    if a.accion=='importar-logs':importar_logs(d,sys.stdin);return
    if a.accion=='informe':print(json.dumps(informe(d),indent=2));return
    ea,eb=leer_json(a.estado_a),leer_json(a.estado_b)
    if a.accion=='reparto':
        print(json.dumps(dict(estado='reparto_acreditado',armado=False,evidencia=acreditar(d,ea,eb)),indent=2));return
    if a.accion=='armar':armar(d,ea,eb)
    else:marcar(d,a.evento,ea,eb)


if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError,OSError,KeyError) as e:
        print('ERROR: '+str(e),file=sys.stderr);sys.exit(2)
