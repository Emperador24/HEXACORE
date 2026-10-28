"""Ayudas de las pruebas de integración de la Cola virtual."""
import json
import urllib.error
import urllib.request

from identidad import cabeceras

API = 'http://localhost:3009/api/v1'
EVENTO = 'e0000001-0000-4000-8000-000000000001'


def pedir(metodo, ruta, usuario=None, cuerpo=None, espera=30):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    cab = cabeceras(usuario) if usuario else {'Content-Type': 'application/json'}
    peticion = urllib.request.Request(f'{API}/{ruta}', data=datos, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(peticion, timeout=espera) as r:
            cuerpo = r.read()
            return r.status, (json.loads(cuerpo) if cuerpo else None)
    except urllib.error.HTTPError as e:
        cuerpo = e.read()
        return e.code, (json.loads(cuerpo) if cuerpo else None)


def titulo(texto):
    print(f'\n{texto}')


def correr(pasos):
    for paso in pasos:
        paso()
