#!/usr/bin/env python3
"""Comprobación de lectura, ejecutada por CD en su servidor, después de desplegar.
No inicia, detiene, descarga ni modifica contenedores.
"""
import json
import pathlib
import re
import subprocess
import sys

def main():
    sha = sys.argv[1]
    if not re.fullmatch(r'[a-f0-9]{40}', sha): raise ValueError('SHA inválido')
    base = pathlib.Path(__file__).resolve().parent
    compose = ['docker', 'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.registro.yml', '-f', 'docker-compose.produccion.yml', '--profile', 'servicios']
    resultado = []
    for servicio in ['nucleo','boleteria','trabajador','pasarela','correo','api-gateway','portal-web-cliente','portal-web-admin']:
        ids = subprocess.check_output([*compose, 'ps', '-q', servicio], cwd=base, text=True).split()
        if not ids: raise ValueError('Falta una aplicación desplegada')
        for identificador in ids:
            c = json.loads(subprocess.check_output(['docker', 'inspect', identificador], text=True))[0]
            if c['Config']['Labels'].get('org.opencontainers.image.revision') != sha or not c['State']['Running']:
                raise ValueError('Revisión desplegada divergente')
            resultado.append({'servicio':servicio,'revision':sha,'imagen':c['Image']})
    print(json.dumps({'revision':sha,'aplicaciones':resultado,'alcance':'Contenedores activos del servidor CD; no solo etiqueta solicitada'}))

if __name__=='__main__':
    try: main()
    except Exception:
        print('No se acreditó la revisión de las ocho aplicaciones desplegadas.',file=sys.stderr)
        raise SystemExit(1)
