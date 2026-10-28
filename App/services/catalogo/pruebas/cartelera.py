"""
Ayudas de las pruebas de integración del Catálogo.

Es la parte de `entradas-mercado-secundario/pruebas/venta.py` que la cartelera
necesita, apuntando al puerto del nuevo servicio. Se copia y no se importa:
cada microservicio tiene que poder probarse solo, sin el código del otro
(RNF-18). Los ids son los de la semilla, que es la misma proyección en las dos
bases.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

API = 'http://localhost:3004/api/v1'

# --- Eventos de la semilla (ver src/persistencia/semillas/datos-demo.ts) ---
FEST = 'e0000001-0000-4000-8000-000000000001'        # a 90 días
ROCK = 'e0000002-0000-4000-8000-000000000002'        # a 45 días
GALA = 'e0000003-0000-4000-8000-000000000003'        # a 30 días · aforo lleno (CU-002B)
VERANO = 'e0000004-0000-4000-8000-000000000004'      # ya se celebró
FERIA = 'e0000005-0000-4000-8000-000000000005'       # a 16 días
SINFONICA = 'e0000006-0000-4000-8000-000000000006'   # a 50 días
CLASICO = 'e0000007-0000-4000-8000-000000000007'     # a 36 días
SALSA = 'e0000008-0000-4000-8000-000000000008'       # a 63 días · agotado
CAFE = 'e0000009-0000-4000-8000-000000000009'        # a 9 días
MAGO = 'e000000a-0000-4000-8000-00000000000a'        # BORRADOR: no debe verse
VOLEIBOL = 'e000000b-0000-4000-8000-00000000000b'    # CANCELADO: no debe verse
STANDUP = 'e000000c-0000-4000-8000-00000000000c'     # a 4 días: cancelación PARCIAL
JAZZ = 'e000000d-0000-4000-8000-00000000000d'        # a 0,8 días: fuera de plazo


def pedir(metodo, ruta, usuario=None, cuerpo=None, espera=60, roles=('Cliente',)):
    """
    Una petición al servicio. Sin `usuario`, va sin cabecera de sesión.

    La ruta se escribe legible —`cartelera?ciudad=Medellín`— y se codifica
    aquí: una petición HTTP solo admite ASCII, y sin esto una tilde revienta
    en el cliente antes de llegar al servicio.
    """
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    encabezados = cabeceras(usuario, roles) if usuario else {'Content-Type': 'application/json'}
    destino = f'{API}/{urllib.parse.quote(ruta, safe="/?&=")}'
    req = urllib.request.Request(destino, data=datos, method=metodo, headers=encabezados)
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            cuerpo_respuesta = r.read()
            return r.status, (json.loads(cuerpo_respuesta) if cuerpo_respuesta else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def titulo(texto):
    print(f'\n### {texto}')


def correr(pasos):
    """
    Ejecuta los pasos en orden y falla a la primera. Devuelve el código de
    salida que espera `cobertura-integracion.sh`.
    """
    for paso in pasos:
        paso()
    print(f'\nTodo bien: {len(pasos)} bloques.')
    return 0


def resembrar():
    """Deja la base como la describe `datos-demo.ts`. Trunca antes de insertar."""
    subprocess.run(['npm', 'run', 'semilla'], capture_output=True, check=True)
