"""Validaciones y archivos privados del montaje. Solo biblioteca estándar."""
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

CARPETA = Path(__file__).resolve().parent
RAIZ = CARPETA.parents[2]
INFRA = CARPETA.parent
LABEL = 'hexacore.zerotier'
PUERTOS = dict(https=443, nucleo_b=3002, boleteria_b=3001, postgres=5432,
               redis=6380, rabbitmq=5672, correo=3098, pasarela=3099)


def exigir(condicion, mensaje):
    if not condicion:
        raise ValueError(mensaje)


def huella(datos):
    return hashlib.sha256(datos).hexdigest()


def json_bytes(datos):
    return (json.dumps(datos, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def privado(ruta):
    p = Path(ruta).expanduser().absolute()
    exigir(not p.is_symlink(), 'No se admiten enlaces simbólicos: ' + str(p))
    p = p.resolve()
    if p.is_relative_to(RAIZ):
        exigir(p.is_relative_to(CARPETA / '.privado'), 'Dentro del repo usa zerotier/.privado/')
    exigir(p != Path.home() and p != Path('/'), 'Directorio privado demasiado amplio')
    return p


def escribir(ruta, datos):
    """Exclusivo: nunca sobrescribir archivos/secretos previos."""
    p = Path(ruta)
    with p.open('xb') as f:
        os.chmod(p, 0o600)
        f.write(datos if isinstance(datos, bytes) else datos.encode())


def leer_json(ruta, secreto=False):
    p = Path(ruta)
    exigir(p.is_file() and not p.is_symlink(), 'Archivo inexistente o enlazado: ' + str(p))
    if secreto and os.name != 'nt':
        exigir(not stat.S_IMODE(p.stat().st_mode) & 0o077, 'Archivo secreto requiere modo 600: ' + str(p))
    exigir(p.stat().st_size <= 2_000_000, 'Archivo de configuración demasiado grande')
    return json.loads(p.read_text())


def ip_privada(valor):
    exigir(isinstance(valor,str),'La IP debe ser texto RFC1918 asignado por ZeroTier')
    try:
        ip = ipaddress.IPv4Address(valor)
    except (ValueError, TypeError):
        raise ValueError('Falta una IPv4 privada asignada de ZeroTier') from None
    redes = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
    exigir(any(ip in ipaddress.IPv4Network(n) for n in redes), 'Solo se admiten direcciones RFC1918 de la VPN')
    return str(ip)


def dominio(valor):
    exigir(isinstance(valor, str) and len(valor) <= 253 and re.fullmatch(
        r'(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}', valor),
        'Nombre DNS HTTPS inválido o marcador sin completar')
    return valor


def validar_config(c):
    exigir(isinstance(c, dict), 'La configuración debe ser un objeto JSON')
    campos = {'demo', 'rol', 'red_zerotier', 'ip_a', 'ip_b', 'dominio_cliente',
              'dominio_admin', 'puertos', 'secretos', 'tls'}
    exigir(set(c) == campos, 'Campos de configuración desconocidos o incompletos')
    exigir(isinstance(c['demo'], str) and re.fullmatch(r'[a-z][a-z0-9-]{2,23}', c['demo']), 'Identificador de demo inválido')
    exigir(c['rol'] in ('A', 'B'), 'Selecciona A o B explícitamente; no se deduce del equipo')
    exigir(isinstance(c['red_zerotier'], str) and re.fullmatch(r'[a-f0-9]{16}', c['red_zerotier']), 'Falta ID de red ZeroTier autorizado')
    for k in ('ip_a', 'ip_b'):
        ip_privada(c[k])
    exigir(c['ip_a'] != c['ip_b'], 'A y B deben ser computadores con IP distintas')
    for k in ('dominio_cliente', 'dominio_admin'):
        dominio(c[k])
    exigir(c['dominio_cliente'] != c['dominio_admin'], 'Los dos portales requieren nombres distintos')
    exigir(isinstance(c['puertos'], dict) and set(c['puertos']) == set(PUERTOS), 'Mapa de puertos incompleto')
    exigir(all(type(p) is int and 1 <= p <= 65535 for p in c['puertos'].values()), 'Puerto inválido')
    exigir(len(set(c['puertos'].values())) == len(PUERTOS), 'Puertos publicados repetidos')
    exigir(isinstance(c['secretos'], str) and '<' not in c['secretos'], 'Falta directorio de secretos propios')
    if c['rol'] == 'A':
        exigir(isinstance(c['tls'], dict) and set(c['tls']) == {'certificado', 'privada', 'ca'}, 'A requiere certificado TLS, privada y CA')
        exigir(all(isinstance(v, str) and '<' not in v for v in c['tls'].values()), 'Faltan rutas TLS reales')
    else:
        exigir(c['tls'] is None, 'B no recibe la clave TLS de A: tls debe ser null')
    return c


def entorno():
    # No heredar .env, COMPOSE_*, HOST_*, proveedores ni credenciales de otros ensayos.
    e = {k: v for k, v in os.environ.items() if k in
         {'PATH', 'HOME', 'TMPDIR', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'LANG', 'SYSTEMROOT'}}
    exigir(not os.environ.get('DOCKER_HOST'), 'No se admite DOCKER_HOST: selecciona un Docker local')
    e.update(COMPOSE_PARALLEL_LIMIT='1', COMPOSE_BAKE='false', COMPOSE_ANSI='never')
    return e


def ejecutar(args, *, entrada=None, timeout=60):
    try:
        p = subprocess.run([str(a) for a in args], cwd=RAIZ, env=entorno(), input=entrada,
                           text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        def texto(v): return v.decode(errors='replace') if isinstance(v,bytes) else (v or '')
        raise FalloHerramienta(args,124,texto(e.stdout),texto(e.stderr)) from None
    if p.returncode:
        # Los errores de Compose/AMQP pueden contener credenciales. No volcarlos a stdout.
        raise FalloHerramienta(args,p.returncode,p.stdout,p.stderr)
    return p.stdout


class FalloHerramienta(RuntimeError):
    def __init__(self,args,codigo,salida,error):
        super().__init__(f'{args[0]} {args[1] if len(args)>1 else ""} falló (salida {codigo}); revisar diagnóstico privado')
        self.datos=dict(comando=[str(x) for x in args],codigo=codigo,stdout=salida,stderr=error)


def git(*args):
    return ejecutar(['git', *args]).strip()


# A y B montan la misma versión publicada: la de main, que es lo que se entrega.
RAMA_DEMO = 'main'


def rama():
    exigir(git('branch', '--show-current') == RAMA_DEMO, f'Solo {RAMA_DEMO}')


def limpio(sha):
    rama()
    exigir(git('rev-parse', 'HEAD') == sha, 'Cambió el SHA: configurar otro ámbito con la misma versión A/B')
    exigir(not git('status', '--porcelain', '--untracked-files=all'), 'Conserva/commit los cambios locales antes de construir o iniciar')


def docker_local():
    nombre = ejecutar(['docker', 'context', 'show']).strip()
    d = json.loads(ejecutar(['docker', 'context', 'inspect', nombre]))[0]
    exigir(d['Endpoints']['docker']['Host'].startswith(('unix://', 'npipe://')), 'No se opera un Docker remoto')
    return nombre


def red_local(c, *, con_sudo=False):
    """Solo consulta; sudo -n únicamente por opción explícita, nunca instalación/join/set."""
    exigir(type(con_sudo) is bool,'La opción de consulta ZeroTier debe ser booleana')
    args = (['sudo','-n'] if con_sudo else []) + ['zerotier-cli','-j','listnetworks']
    redes = json.loads(ejecutar(args))
    red = next((r for r in redes if r.get('nwid', r.get('id')) == c['red_zerotier']), None)
    exigir(red and red.get('status') == 'OK' and red.get('type') == 'PRIVATE', 'La red privada ZeroTier debe estar autorizada y OK')
    propia = c['ip_a' if c['rol'] == 'A' else 'ip_b']
    exigir(propia in {str(ipaddress.ip_interface(x).ip) for x in red.get('assignedAddresses', [])},
           'La IP del rol no está asignada a este miembro ZeroTier')
    return propia


def historial():
    fuente = (RAIZ / 'App/backend/compartido/persistencia/historia.ts').read_text().split('// Procedencia')[0]
    filas = re.findall(r"conexion: '[^']+'[^\n]*esquema: '([^']+)'[^\n]*historial: '([^']+)'[^\n]*migraciones: \[([^\]]+)\]", fuente)
    exigir(bool(filas), 'No se pudo leer el registro vigente de migraciones')
    return [{'esquema': e, 'historial': h, 'cantidad': len(m.split(','))} for e, h, m in filas]


def directorio_temporal():
    return Path(tempfile.mkdtemp(prefix='hexacore-zt-'))
