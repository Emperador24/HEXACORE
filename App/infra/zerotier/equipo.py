#!/usr/bin/env python3
"""Montaje A/B exclusivo. Ningún comando instala o administra ZeroTier/firewalls."""
import argparse
import json
from pathlib import Path
import platform
import shutil
import socket
import sys

from comun import ejecutar, exigir, json_bytes, escribir, privado, historial, ip_privada
from montaje import Montaje, configurar, crear_secretos


def sondear_puertos(ip, puertos):
    """Bind temporal, sin listen ni tráfico; no requiere Docker o un montaje previo."""
    ip=ip_privada(ip)
    exigir(isinstance(puertos,list) and 1<=len(puertos)<=16 and
           all(type(p) is int and 1<=p<=65535 for p in puertos) and len(set(puertos))==len(puertos),
           'Indica de 1 a 16 puertos distintos entre 1 y 65535')
    abiertos=[];resultados=[]
    try:
        for puerto in puertos:
            try:
                s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);abiertos.append(s)
                s.bind((ip,puerto))  # Sin SO_REUSEADDR: no ignorar listeners existentes.
                resultados.append(dict(puerto=puerto,enlazable=True))
            except OSError as e:
                resultados.append(dict(puerto=puerto,enlazable=False,error=type(e).__name__,errno=e.errno))
    finally:
        for s in abiertos:s.close()
    return dict(ip=ip,puertos=resultados,todos_enlazables=all(r['enlazable'] for r in resultados),
                alcance='Reserva temporal ya liberada, sin escucha; no acredita firewall/ruta desde contenedores')


def detectar():
    d = dict(sistema=platform.system(),arquitectura=platform.machine(),rol_asignado=None,
             zerotier_cli=bool(shutil.which('zerotier-cli')))
    d['disco_checkout_libre_mib']=shutil.disk_usage(Path(__file__).resolve()).free//1048576
    d['disco_motor_docker']='pendiente: comprobar almacenamiento del motor/VM; no equivale al disco del checkout'
    if platform.system()=='Darwin':
        d['memoria_fisica_mib']=int(ejecutar(['sysctl','-n','hw.memsize']).strip())//1048576
        d['cpus']=int(ejecutar(['sysctl','-n','hw.ncpu']).strip())
    elif Path('/proc/meminfo').exists():
        mem={l.split(':')[0]:int(l.split()[1]) for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith(('MemTotal:','MemAvailable:'))}
        d.update(memoria_fisica_mib=mem['MemTotal']//1024,memoria_disponible_mib=mem.get('MemAvailable',0)//1024)
    try:
        info=json.loads(ejecutar(['docker','info','--format','{{json .}}'],timeout=15))
        d['docker']=dict(memoria_mib=info['MemTotal']//1048576,cpus=info['NCPU'],activos=info['ContainersRunning'])
    except (RuntimeError,FileNotFoundError): d['docker']='no comprobado'
    h=historial();d['historia_codigo']=dict(esquemas=len(h),migraciones=sum(x['cantidad'] for x in h))
    return d


def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='accion',required=True)
    sub.add_parser('detectar')
    s=sub.add_parser('puertos');s.add_argument('--ip',required=True);s.add_argument('--puertos',nargs='+',type=int,required=True)
    s=sub.add_parser('crear-secretos');s.add_argument('--destino',required=True)
    s=sub.add_parser('configurar');s.add_argument('--config',required=True);s.add_argument('--directorio',required=True)
    for nombre in ['validar','construir','preparar','iniciar','comprobar','estado','parar','logs']:
        s=sub.add_parser(nombre);s.add_argument('--directorio',required=True)
        if nombre=='estado':s.add_argument('--salida')
        if nombre=='logs':s.add_argument('--seguir',action='store_true')
        if nombre=='preparar':s.add_argument('--cuentas-demo',action='store_true',help='Solo A y tablas vacías: semilla existente de Identidad, una vez')
        if nombre in ['construir','preparar','iniciar','comprobar']:
            s.add_argument('--consulta-zerotier-con-sudo',action='store_true',help='Solo listnetworks mediante sudo -n; autenticar sudo antes, con el propietario')
    a=p.parse_args()
    if a.accion=='detectar':print(json.dumps(detectar(),indent=2));return
    if a.accion=='puertos':
        r=sondear_puertos(a.ip,a.puertos);print(json.dumps(r,indent=2));sys.exit(0 if r['todos_enlazables'] else 1)
    if a.accion=='crear-secretos':crear_secretos(a.destino);print('Secretos nuevos creados; transferir solo con participación de A/B.');return
    if a.accion=='configurar':
        m=configurar(a.config,a.directorio)
        print(json.dumps(dict(proyecto=m['proyecto'],rol=m['configuracion']['rol'],fuente=m['fuente'])));return
    m=Montaje(a.directorio)
    m.consulta_zerotier_con_sudo=getattr(a,'consulta_zerotier_con_sudo',False)
    if a.accion=='validar':
        m.compose('config','-q');print('Compose y archivos sellados válidos; sin recursos creados.');return
    if a.accion=='estado':
        r=m.estado()
        if a.salida:escribir(privado(a.salida),json_bytes(r))
        else:print(json.dumps(r,indent=2))
        return
    if a.accion=='logs':m.logs(a.seguir);return
    with m.bloqueo():
        r=m.preparar(a.cuentas_demo) if a.accion=='preparar' else getattr(m,a.accion)()
    print(json.dumps(r if r is not None else {'accion':a.accion,'resultado':'terminada'}))


if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError,OSError,KeyError) as e:
        print('ERROR: '+str(e),file=sys.stderr);sys.exit(2)
