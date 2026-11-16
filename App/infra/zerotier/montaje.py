"""Deriva un Compose cerrado a partir del base; no modifica el entorno habitual."""
from contextlib import contextmanager
import copy
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import uuid
from urllib.parse import quote

from comun import (CARPETA, INFRA, RAIZ, LABEL, ejecutar, entorno, exigir, escribir,
                   git, historial, huella, json_bytes, leer_json, limpio, privado,
                   rama, red_local, docker_local, validar_config, FalloHerramienta)

DATOS = ['postgres', 'redis', 'rabbitmq', 'pasarela', 'correo']
APPS_A = ['nucleo', 'boleteria', 'trabajador', 'api-gateway', 'portal-web-cliente', 'portal-web-admin', 'caddy']
APPS_B = ['nucleo', 'boleteria']
SERVICIOS_A = set(DATOS + APPS_A + ['preparacion-base'])


def crear_secretos(destino):
    rama()
    d = privado(destino)
    exigir(not d.exists(), 'No se sobrescriben secretos/directorios previos')
    d.mkdir(mode=0o700, parents=True)
    escribir(d / 'comun.json', json_bytes({k: secrets.token_hex(32) for k in
              ['postgres', 'rabbitmq', 'servicios', 'webhook']}))
    ejecutar(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072', '-out', d / 'jwt-privada.pem'])
    os.chmod(d / 'jwt-privada.pem', 0o600)
    pub = ejecutar(['openssl', 'pkey', '-in', d / 'jwt-privada.pem', '-pubout'])
    escribir(d / 'jwt-publica.pem', pub)


def comprobar_claves(d):
    claves = leer_json(d / 'comun.json', secreto=True)
    exigir(set(claves) == {'postgres', 'rabbitmq', 'servicios', 'webhook'}, 'Secretos incompletos')
    exigir(all(isinstance(x, str) and re.fullmatch(r'[a-f0-9]{64}', x) for x in claves.values()), 'Usar secretos propios generados por crear-secretos')
    pub = ejecutar(['openssl', 'pkey', '-in', d / 'jwt-privada.pem', '-pubout']).strip()
    exigir(pub == (d / 'jwt-publica.pem').read_text().strip(), 'Par JWT no correspondiente')
    desarrollo = (INFRA / 'claves-desarrollo/jwt-publica.pem').read_text().strip()
    exigir(pub != desarrollo, 'No se admiten claves JWT de desarrollo')
    rsa=ejecutar(['openssl','rsa','-pubin','-in',d/'jwt-publica.pem','-text','-noout'])
    bits=re.search(r'Public-Key:\s*\((\d+) bit\)',rsa)
    exigir(bits is not None and int(bits[1])>=2048,'JWT requiere RSA de al menos 2048 bits')
    if os.name != 'nt':
        exigir(not (d / 'jwt-privada.pem').stat().st_mode & 0o077, 'La privada JWT requiere modo 600')
    return claves


def comprobar_tls(c):
    if c['rol'] != 'A':
        return
    t = c['tls']
    exigir(all(Path(x).is_file() for x in t.values()), 'Faltan archivos TLS reales en A')
    if os.name != 'nt': exigir(not Path(t['privada']).stat().st_mode & 0o077,'La privada TLS requiere modo 600')
    ejecutar(['openssl', 'x509', '-in', t['certificado'], '-checkend', '3600', '-noout'])
    for host in ('dominio_cliente', 'dominio_admin'):
        ejecutar(['openssl', 'verify', '-CAfile', t['ca'], '-untrusted', t['certificado'],
                  '-verify_hostname', c[host], t['certificado']])
    pub_cert = ejecutar(['openssl', 'x509', '-in', t['certificado'], '-pubkey', '-noout']).strip()
    pub_key = ejecutar(['openssl', 'pkey', '-in', t['privada'], '-pubout']).strip()
    exigir(pub_cert == pub_key, 'La privada TLS no corresponde al certificado')


def nginx(c):
    """Conserva exactamente rutas, njs, auth_request, permisos y parámetros SSE."""
    s = (RAIZ / 'App/gateway/nginx.conf').read_text()
    for nombre, local, puerto in [('nucleo', 3002, c['puertos']['nucleo_b']), ('boleteria', 3001, c['puertos']['boleteria_b'])]:
        viejo = f'    server {nombre}:{local} resolve;'
        exigir(s.count(viejo) == 1, 'Cambió el upstream base: revisar el generador')
        s = s.replace(viejo, f'    server {nombre}:{local} resolve max_fails=1 fail_timeout=10s;\n'
                      f'    server {c["ip_b"]}:{puerto} max_fails=1 fail_timeout=10s;')
    ancla = '    proxy_connect_timeout 5s;'
    exigir(s.count(ancla) == 1, 'Cambió el timeout base')
    s = s.replace(ancla, '    # Sin reenvío de ninguna solicitud: los fallos quedan visibles en C.\n'
                  '    proxy_next_upstream off;\n    proxy_next_upstream_tries 1;\n' + ancla)
    ancla = '    add_header X-Servidor $upstream_addr always;'
    exigir(s.count(ancla) == 1, 'Cambió la identificación de upstream')
    s = s.replace(ancla, ancla + '\n    add_header X-Demo-Solicitud $demo_solicitud always;')
    mapa = ('map $http_x_demo_solicitud $demo_solicitud {\n'
            '    default $request_id;\n    "~^[a-f0-9-]{36}$" $http_x_demo_solicitud;\n}\n\n')
    return mapa + s


def principal():
    s = (RAIZ / 'App/gateway/nginx-principal.conf').read_text()
    inicio = s.index('    log_format  main ')
    fin = s.index('    sendfile', inicio)
    formato = ('    log_format zt escape=json \'{"utc":"$time_iso8601","solicitud":"$demo_solicitud",'
               '"metodo":"$request_method","ruta":"$uri","http":$status,'
               '"servidor":"$upstream_addr","duracion_s":$request_time,'
               '"upstream_s":"$upstream_response_time"}\';\n'
               '    access_log /var/log/nginx/access.log zt;\n\n')
    return s[:inicio] + formato + s[fin:]


def caddy(c):
    # Reutiliza los dos portales y API del mismo origen; certificados provistos, sin ACME ni CA automática.
    s = '{\n    admin off\n    auto_https disable_redirects\n}\n'
    for clave, servicio, puerto in [('dominio_cliente', 'portal-web-cliente', 4200), ('dominio_admin', 'portal-web-admin', 4201)]:
        s += f'''https://{c[clave]}:{c['puertos']['https']} {{
    tls /certificados/certificado.pem /certificados/privada.pem
    encode zstd gzip
    handle /api/* {{
        reverse_proxy api-gateway:8080 {{
            lb_try_duration 0
            flush_interval -1
        }}
    }}
    handle {{
        reverse_proxy {servicio}:{puerto}
    }}
}}
'''
    return s


def base_compose():
    return json.loads(ejecutar(['docker', 'compose', '--env-file', os.devnull, '-f', INFRA / 'docker-compose.yml',
                               '--profile', 'servicios', 'config', '--format', 'json']))


def bind(origen, destino):
    return {'type': 'bind', 'source': str(origen), 'target': destino, 'read_only': True}


def derivar(base, c, d, propietario, sha):
    proyecto = 'hxc-zt-' + c['demo'] + '-' + c['rol'].lower()
    labels = {LABEL: propietario, LABEL + '.fuente': sha, LABEL + '.rol': c['rol'],
              LABEL + '.checkout': huella(str(RAIZ).encode())}
    nombres = SERVICIOS_A if c['rol'] == 'A' else set(APPS_B)
    servicios = {n: copy.deepcopy(base['services'][n]) for n in nombres if n != 'caddy'}
    k = leer_json(d / 'comun.json', secreto=True)
    bd, usuario, vhost = 'hexacore_zt_' + c['demo'].replace('-', '_'), 'demo_zerotier', 'demo-' + c['demo']
    host = c['ip_a']
    p = c['puertos']
    for nombre, s in servicios.items():
        exigir(not any(s.get(k) for k in ['network_mode','privileged','devices','cap_add','pid','ipc','external_links']), 'Servicio base con acceso al host: revisar explícitamente')
        if nombre in APPS_B:
            exigir(s.get('command') is None and s.get('entrypoint') is None,'Las apps deben conservar su main; no ejecutar comandos administrativos')
        for clave_inicio in ('command','entrypoint'):
            if s.get(clave_inicio) is None:s.pop(clave_inicio,None)
        for clave in ('container_name', 'profiles', 'ports', 'volumes', 'depends_on', 'environment'):
            s.pop(clave, None)
        s['labels'] = labels.copy()
        s['networks'] = {'default': None}
        if 'build' in s:
            # Mantiene Dockerfiles/contextos originales. Nunca etiqueta imágenes habituales.
            s['image'] = proyecto + '-' + ('nucleo' if nombre == 'preparacion-base' else nombre) + ':' + sha[:12]
            s['build']['labels'] = labels.copy()
        if nombre in ('nucleo', 'boleteria', 'preparacion-base'):
            sql_host = 'postgres' if c['rol'] == 'A' else host
            s['environment'] = dict(NODE_ENV='production', POSTGRES_HOST=sql_host,
                POSTGRES_PUERTO=str(5432 if c['rol'] == 'A' else p['postgres']), POSTGRES_BD=bd,
                POSTGRES_USUARIO=usuario, POSTGRES_CONTRASENA=k['postgres'],
                POSTGRES_MAX_CONEXIONES='10', POSTGRES_ESPERA_MAXIMA_MS='3000')
            s['environment'].update(DEMO_ID=c['demo'],DEMO_FUENTE=sha,DEMO_ROL=c['rol'])
        if nombre in ('nucleo', 'boleteria', 'trabajador'):
            s.setdefault('environment', {}).update(NODE_ENV='production',
                RABBITMQ_URL=f'amqp://{usuario}:{quote(k["rabbitmq"], safe="")}@' +
                ('rabbitmq:5672' if c['rol'] == 'A' else f'{host}:{p["rabbitmq"]}') + '/' + vhost,
                CORREO_PROVEEDOR_URL='http://' + ('correo:3098' if c['rol'] == 'A' else f'{host}:{p["correo"]}'),
                CORREO_PROVEEDOR='simulado',
                CORREO_URL_BASE_ENLACES=f'https://{c["dominio_cliente"]}:{p["https"]}/cuenta')
            s['user'] = f'{os.getuid() if hasattr(os,"getuid") else 1000}:{os.getgid() if hasattr(os,"getgid") else 1000}'
        if nombre in ('nucleo', 'boleteria'):
            s['environment'].update(PUERTO='3002' if nombre == 'nucleo' else '3001', PREFIJO_API='api/v1',
                AUTH_JWT_EMISOR='hexacore-administracion', AUTH_JWT_CLAVE_PUBLICA_ARCHIVO='/claves/jwt-publica.pem',
                TOKEN_SERVICIOS=k['servicios'], REDIS_HOST='redis' if c['rol'] == 'A' else host,
                REDIS_PUERTO=str(6379 if c['rol'] == 'A' else p['redis']), PAGOS_PROVEEDOR='simulada',
                PAGOS_PROVEEDOR_URL='http://' + ('pasarela:3099' if c['rol'] == 'A' else f'{host}:{p["pasarela"]}'),
                PASARELA_TIMEOUT_MS='10000')
            s['volumes'] = [bind(d / 'jwt-publica.pem', '/claves/jwt-publica.pem')]
        if nombre == 'boleteria':
            # Conservar el aforo explícito del montaje actual (25), no caer al
            # default del código (100) al reconstruir el entorno sin secretos.
            s['environment']['COLA_AFORO_CONCURRENTE'] = base['services'][nombre]['environment']['COLA_AFORO_CONCURRENTE']
        if nombre == 'nucleo':
            s['environment']['AUTH_JWT_CLAVE_PRIVADA_ARCHIVO'] = '/claves/jwt-privada.pem'
            s['environment']['PASARELA_SECRETO_WEBHOOK'] = k['webhook']
            s['volumes'] += [bind(d / 'jwt-privada.pem', '/claves/jwt-privada.pem'),
                            bind(CARPETA / 'sonda.cjs', '/demo/sonda.cjs'), bind(d / 'historial.json', '/demo/historial.json')]
            if c['rol']=='A':s['volumes'].append(bind(CARPETA/'preparacion-demo.cjs','/demo/preparacion-demo.cjs'))
        if nombre == 'trabajador':
            s['environment']['PUERTO'] = '3006'
    def publicar(n, direccion, publicado, destino):
        servicios[n].setdefault('ports', []).append(dict(target=destino, published=str(publicado), host_ip=direccion, protocol='tcp'))
    if c['rol'] == 'B':
        publicar('nucleo', c['ip_b'], p['nucleo_b'], 3002)
        publicar('boleteria', c['ip_b'], p['boleteria_b'], 3001)
    else:
        for nombre, destino in [('postgres',5432), ('redis',6379), ('rabbitmq',5672), ('correo',3098), ('pasarela',3099)]:
            publicar(nombre, c['ip_a'], p[nombre], destino)
        servicios['postgres']['environment'] = dict(POSTGRES_USER=usuario, POSTGRES_PASSWORD=k['postgres'], POSTGRES_DB='postgres')
        servicios['postgres']['healthcheck']['test'] = ['CMD-SHELL', 'pg_isready -U ' + usuario]
        servicios['postgres']['volumes'] = [dict(type='volume',source='postgres-datos',target='/var/lib/postgresql/data'),
                                            bind(d / '01-base.sql', '/docker-entrypoint-initdb.d/01-base.sql')]
        servicios['redis']['volumes'] = [dict(type='volume',source='redis-datos',target='/data')]
        servicios['rabbitmq']['environment'] = dict(RABBITMQ_DEFAULT_USER=usuario, RABBITMQ_DEFAULT_PASS=k['rabbitmq'], RABBITMQ_DEFAULT_VHOST=vhost)
        servicios['rabbitmq']['volumes'] = [dict(type='volume',source='rabbitmq-datos',target='/var/lib/rabbitmq')]
        servicios['pasarela']['environment'] = dict(WEBHOOK_URL='http://api-gateway:8080/api/v1/pagos/webhook', SECRETO_WEBHOOK=k['webhook'])
        servicios['api-gateway']['volumes'] = [bind(d / 'nginx.conf', '/etc/nginx/conf.d/default.conf'),
            bind(d / 'nginx-principal.conf', '/etc/nginx/nginx.conf'),
            bind(d / 'autenticacion.js', '/etc/nginx/njs/autenticacion.js'),
            bind(d / 'autenticar.conf', '/etc/nginx/hexacore/autenticar.conf'),
            bind(d / 'jwt-publica.pem', '/etc/nginx/claves/jwt-publica.pem')]
        for n in ['portal-web-cliente','portal-web-admin']:
            servicios[n]['volumes'] = [bind(INFRA / 'produccion/configuracion.js', '/usr/share/nginx/html/configuracion.js')]
        servicios['caddy'] = dict(image='caddy:2.8.4-alpine', restart='unless-stopped', labels=labels.copy(),
            networks={'default':None}, volumes=[bind(d / 'Caddyfile','/etc/caddy/Caddyfile'),
            bind(d / 'certificado.pem','/certificados/certificado.pem'), bind(d / 'tls-privada.pem','/certificados/privada.pem')],
            ports=[dict(target=p['https'], published=str(p['https']), host_ip=c['ip_a'], protocol='tcp')])
    volumenes = {v: dict(name=proyecto+'-'+v, labels=labels.copy()) for v in
                 (['postgres-datos','redis-datos','rabbitmq-datos'] if c['rol']=='A' else [])}
    return dict(name=proyecto, services=servicios, volumes=volumenes,
                networks={'default':dict(name=proyecto+'-red',labels=labels.copy())})


def configurar(config, destino):
    rama()
    c = validar_config(leer_json(config))
    origen = privado(c['secretos'])
    comprobar_claves(origen)
    comprobar_tls(c)
    d = privado(destino)
    exigir(not d.exists(), 'Ámbito ya existente: se conserva; usa otro directorio para configurar')
    base = base_compose()  # Solo render de Compose; no crea recursos ni consulta el daemon.
    contexto = docker_local()
    d.mkdir(mode=0o700, parents=True)
    for n in ('comun.json','jwt-privada.pem','jwt-publica.pem'):
        escribir(d / n, (origen / n).read_bytes())
    # La pública no es un secreto: njs la lee con el UID del worker nginx.
    # El directorio host continúa en 700; ambas privadas permanecen en 600.
    os.chmod(d/'jwt-publica.pem',0o644)
    escribir(d / 'historial.json', json_bytes(historial()))
    sha, propietario = git('rev-parse','HEAD'), str(uuid.uuid4())
    if c['rol'] == 'A':
        for n in ['autenticacion.js','autenticar.conf']:
            escribir(d / n, (RAIZ / 'App/gateway' / n).read_bytes())
        for n, contenido in [('nginx.conf',nginx(c)),('nginx-principal.conf',principal()),('Caddyfile',caddy(c))]:
            escribir(d / n, contenido)
        escribir(d / 'certificado.pem',Path(c['tls']['certificado']).read_bytes())
        escribir(d / 'tls-privada.pem',Path(c['tls']['privada']).read_bytes())
        # Caddy corre como root en su imagen; las apps usan UID local para leer privadas 600.
        escribir(d / '01-base.sql',f'CREATE DATABASE hexacore_zt_{c["demo"].replace("-","_")} OWNER demo_zerotier;\n')
        # initdb cambia al UID postgres antes de leer este SQL sin credenciales.
        os.chmod(d/'01-base.sql',0o644)
    compose = derivar(base,c,d,propietario,sha)
    escribir(d / 'compose.json',json_bytes(compose))
    m = dict(version=1, configuracion=c, fuente=sha, propietario=propietario, contexto=contexto,
             checkout=huella(str(RAIZ).encode()), proyecto=compose['name'],
             archivos={p.name:huella(p.read_bytes()) for p in d.iterdir() if p.is_file()})
    escribir(d / 'montaje.json',json_bytes(m))
    return m


class Montaje:
    def __init__(self, ruta):
        rama()
        self.d = privado(ruta)
        self.m = leer_json(self.d / 'montaje.json', secreto=True)
        self.c = validar_config(self.m['configuracion'])
        exigir(self.m['checkout'] == huella(str(RAIZ).encode()), 'Ámbito de otro checkout')
        exigir(self.m['contexto'] == docker_local(), 'Cambió el contexto Docker')
        for nombre, h in self.m['archivos'].items():
            exigir(Path(nombre).name == nombre and huella((self.d/nombre).read_bytes()) == h, 'Archivo de montaje alterado: ' + nombre)
        self.cfg = leer_json(self.d / 'compose.json', secreto=True)
        esperado = derivar(base_compose(),self.c,self.d,self.m['propietario'],self.m['fuente'])
        exigir(self.cfg == esperado and self.cfg['name'] == self.m['proyecto'], 'Compose no corresponde al montaje cerrado')

    @contextmanager
    def bloqueo(self):
        p = self.d / 'operacion.lock'
        fd = os.open(p, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        try:
            os.write(fd,str(os.getpid()).encode()); yield
        finally:
            os.close(fd); p.unlink()

    def compose(self, *args, timeout=60):
        try:
            return ejecutar(['docker','compose','--project-name',self.m['proyecto'],'--env-file',os.devnull,
                             '-f',self.d/'compose.json',*args],timeout=timeout)
        except FalloHerramienta as e:
            carpeta=self.d/'fallos';carpeta.mkdir(mode=0o700,exist_ok=True)
            ruta=carpeta/(str(uuid.uuid4())+'.json');escribir(ruta,json_bytes(e.datos))
            raise RuntimeError('Comando falló, sin reintento. Diagnóstico privado: '+str(ruta)) from None

    def contenedores(self):
        ids = ejecutar(['docker','ps','-aq','--filter','label=com.docker.compose.project='+self.m['proyecto']]).split()
        return json.loads(ejecutar(['docker','inspect',*ids])) if ids else []

    def recursos(self):
        existentes = self.contenedores()
        for r in existentes:
            e = r['Config']['Labels']; n = e.get('com.docker.compose.service')
            exigir(n in self.cfg['services'] and e.get(LABEL) == self.m['propietario'] and
                   e.get(LABEL+'.checkout') == self.m['checkout'] and e.get(LABEL+'.rol') == self.c['rol'], 'Contenedor ajeno en el ámbito; no se modifica')
        for tipo, plural in [('volume','volumes'),('network','networks')]:
            nombres = set(ejecutar(['docker',tipo,'ls','--format','{{.Name}}']).splitlines())
            for r in self.cfg[plural].values():
                if r['name'] in nombres:
                    obj = json.loads(ejecutar(['docker',tipo,'inspect',r['name']]))[0]
                    exigir((obj.get('Labels') or {}).get(LABEL) == self.m['propietario'], 'Volumen/red ajeno: se conserva')
        return existentes

    def capacidad(self):
        info = json.loads(ejecutar(['docker','info','--format','{{json .}}']))
        minimo = 6144 if self.c['rol']=='A' else 3072
        exigir(info['MemTotal']/1048576 >= minimo, f'Docker requiere al menos {minimo} MiB para este rol; no se cambian límites globales')
        stats = ejecutar(['docker','stats','--no-stream','--format','{{json .}}'],timeout=30)
        usados = 0; uso_propio = 0
        nombres_propios = {r['Name'].lstrip('/') for r in self.contenedores()}
        for linea in stats.splitlines():
            v = json.loads(linea)['MemUsage'].split('/')[0].strip()
            m = re.fullmatch(r'([0-9.]+)\s*([KMGT]?i?B)',v)
            exigir(m is not None, 'No se pudo determinar memoria ocupada')
            unidades = {'B':1,'kB':1000,'KB':1000,'MB':1000000,'GB':1000000000,'KiB':1024,'MiB':1048576,'GiB':1073741824,'TiB':1099511627776}
            consumo = float(m[1])*unidades[m[2]]
            usados += consumo
            if json.loads(linea).get('Name') in nombres_propios: uso_propio += consumo
        libre = (info['MemTotal']-usados)/1048576
        pendiente = max(512, (4096 if self.c['rol']=='A' else 1536)-uso_propio/1048576)
        exigir(libre >= pendiente, 'Capacidad libre insuficiente; no se detienen otros proyectos')
        return dict(docker_mib=round(info['MemTotal']/1048576), libre_estimada_mib=round(libre), cpus=info['NCPU'])

    def puertos(self, contenedores):
        propios = {(x['HostIp'],int(x['HostPort'])) for r in contenedores if r['State']['Running']
                   for ps in (r['NetworkSettings'].get('Ports') or {}).values() if ps for x in ps}
        for s in self.cfg['services'].values():
            for p in s.get('ports',[]):
                destino = (p['host_ip'],int(p['published']))
                if destino in propios: continue
                with socket.socket() as sock:
                    try: sock.bind(destino)
                    except PermissionError:
                        # Un usuario del grupo Docker no necesita privilegio de bind(443).
                        # En Linux se comprueba IP enlazable y listeners sin elevar permisos.
                        with socket.socket() as prueba: prueba.bind((destino[0],0))
                        listeners=ejecutar(['ss','-H','-ltn'])
                        for linea in listeners.splitlines():
                            campos=linea.split();local=campos[3] if len(campos)>=5 else ''
                            host,_,port=local.rpartition(':')
                            exigir(not (port==str(destino[1]) and host.strip('[]') in [destino[0],'0.0.0.0','::','*']), 'Puerto ocupado; no se libera')
                    except OSError: raise ValueError('IP no enlazable o puerto ocupado: '+str(destino)+'; no se libera') from None

    def previo(self):
        limpio(self.m['fuente'])
        cs = self.recursos()
        red_local(self.c)
        self.puertos(cs)
        return self.capacidad()

    def construir(self):
        self.previo()
        nombres = [n for n,s in self.cfg['services'].items() if 'build' in s and n!='preparacion-base']
        self.compose('build',*sorted(nombres),timeout=3600)

    def imagenes(self):
        disponibles=set(ejecutar(['docker','image','ls','--format','{{.Repository}}:{{.Tag}}']).splitlines())
        for imagen in {s['image'] for s in self.cfg['services'].values() if 'build' in s}:
            exigir(imagen in disponibles,'Construir las imágenes propias antes de preparar/iniciar')
            i=json.loads(ejecutar(['docker','image','inspect',imagen]))[0]
            e=i['Config'].get('Labels') or {}
            exigir(e.get(LABEL)==self.m['propietario'] and e.get(LABEL+'.fuente')==self.m['fuente'], 'Imagen ajena o de otra fuente: se conserva')

    def preparar(self,cuentas_demo=False):
        exigir(self.c['rol']=='A','B no ejecuta preparación, migraciones ni semillas')
        self.previo()
        self.imagenes()
        if (self.d/'preparada.json').exists():
            previa=leer_json(self.d/'preparada.json')
            exigir(previa['fuente']==self.m['fuente'] and (not cuentas_demo or previa.get('cuentas_demo')),'Preparación de otra versión o sin esas cuentas; no resembrar')
            return 'ya preparada: no se repite SQL'
        exigir(not any(r['State']['Running'] and r['Config']['Labels'].get('com.docker.compose.service') in APPS_A
                       for r in self.recursos()),'No preparar con aplicaciones propias en ejecución; conservar y diagnosticar')
        self.compose('up','-d','--wait','--no-build',*DATOS,timeout=180)
        self.compose('up','-d','--no-deps','--no-build','preparacion-base')
        self.compose('wait','preparacion-base',timeout=180)
        # Verificar el estado real, no inferir éxito por disponibilidad de PostgreSQL.
        r = [r for r in self.recursos() if r['Config']['Labels']['com.docker.compose.service']=='preparacion-base']
        exigir(len(r)==1 and r[0]['State']['Status']=='exited' and r[0]['State']['ExitCode']==0,'Preparación incompleta; conservar diagnóstico antes de repetir')
        args=['run','--rm','--no-deps','--entrypoint','node','nucleo','/demo/preparacion-demo.cjs']
        if cuentas_demo:args.append('--cuentas-demo')
        resultado=self.compose(*args,timeout=150)
        escribir(self.d/('preparacion-'+str(uuid.uuid4())+'.log'),resultado)
        escribir(self.d/'preparada.json',json_bytes(dict(fuente=self.m['fuente'],historial=historial(),cuentas_demo=cuentas_demo)))
        return 'preparada desde A'

    def sonda(self, en_ejecucion=False):
        prefijo = ['exec','-T','nucleo'] if en_ejecucion else ['run','--rm','--no-deps','--entrypoint','node','nucleo']
        if en_ejecucion: prefijo += ['node']
        return json.loads(self.compose(*prefijo,'/demo/sonda.cjs',timeout=25).strip().splitlines()[-1])

    def iniciar(self):
        self.previo()
        self.imagenes()
        if self.c['rol']=='A': exigir((self.d/'preparada.json').is_file(),'Ejecutar preparar una vez desde A antes de iniciar')
        self.sonda()  # B comprueba SQL preparado y los cinco proveedores desde su contenedor.
        self.compose('up','-d','--wait','--no-deps','--no-build',*(APPS_A if self.c['rol']=='A' else APPS_B),timeout=180)

    def comprobar(self):
        self.previo()
        r = self.sonda(en_ejecucion=True)
        if self.c['rol']=='A':
            self.compose('exec','-T','api-gateway','nginx','-t')
            for n in ['nucleo_b','boleteria_b']:
                url=f'http://{self.c["ip_b"]}:{self.c["puertos"][n]}/api/v1/salud'
                salud=json.loads(self.compose('exec','-T','api-gateway','wget','-qO-','-T','5',url,timeout=10))
                exigir(salud.get('estado')=='arriba','B degradado: no declarar listo')
            r['gateway_a_b']='arriba'
        return r

    def parar(self):
        self.recursos()  # No requiere nueva versión limpia: permite parar el montaje anterior propio.
        self.compose('stop','--timeout','30',*sorted(self.cfg['services']),timeout=150)

    def estado(self):
        cs=self.recursos()
        datos=[]; a={}
        for r in cs:
            n=r['Config']['Labels']['com.docker.compose.service']
            datos.append(dict(servicio=n,id=r['Id'][:12],imagen=r['Image'],estado=r['State']['Status'],salud=r['State'].get('Health',{}).get('Status')))
            if self.c['rol']=='A' and n in APPS_B and r['State']['Running']:
                red=r['NetworkSettings']['Networks'].get(self.cfg['networks']['default']['name'],{})
                if red.get('IPAddress'): a['autenticada' if n=='nucleo' else 'publica']=red['IPAddress']+(':'+str(3002 if n=='nucleo' else 3001))
        return dict(proyecto=self.m['proyecto'],demo=self.c['demo'],rol=self.c['rol'],fuente=self.m['fuente'],
                    red_zerotier=self.c['red_zerotier'],ip_a=self.c['ip_a'],ip_b=self.c['ip_b'],contenedores=datos,upstreams_a=a,
                    puertos_b=dict(publica=self.c['puertos']['boleteria_b'],autenticada=self.c['puertos']['nucleo_b']))

    def logs(self, seguir=False, segundos=30):
        exigir(self.c['rol']=='A','Los logs correlacionados se leen en gateway de A')
        self.recursos()
        args=['docker','compose','--project-name',self.m['proyecto'],'--env-file',os.devnull,'-f',str(self.d/'compose.json'),
              'logs','--no-log-prefix','--no-color','--since',str(segundos)+'s']
        if seguir: args.append('--follow')
        args.append('api-gateway')
        with subprocess.Popen(args,cwd=RAIZ,env=entorno(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True) as proc:
            try:
                for linea in proc.stdout:
                    try: r=json.loads(linea)
                    except ValueError: continue
                    if r.get('ruta') in ['/api/v1/cartelera','/api/v1/sesiones/actual'] and r.get('metodo')=='GET':
                        print(json.dumps(r),flush=True)
                exigir(proc.wait()==0,'Falló lectura de logs: se conserva como fallo, no como ausencia de tráfico')
            finally:
                if proc.poll() is None: proc.terminate(); proc.wait(timeout=10)
