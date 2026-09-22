"""
Tokens de sesión para las pruebas de integración del CU-011.

Las suites usan clientes con UUID aleatorios, que no existen en el Servicio de
Administración y por tanto no pueden iniciar sesión. Así que las pruebas
**fabrican** sus tokens, firmándolos con la clave privada de desarrollo,
exactamente como lo haría Administración.

Es copia literal del ayudante de `entradas-mercado-secundario`: los servicios no
comparten código (ADR-01), y duplicar veinte líneas de prueba cuesta menos que
crear un paquete común entre microservicios.

Esto solo es posible porque esa clave está en el repositorio
(`App/infra/claves-desarrollo/`). En producción es imposible, y es justo lo que
se busca: `cu011-autenticacion.py` comprueba que un token firmado con cualquier otra
clave se rechaza.

Python no trae RSA en su biblioteca estándar; se firma con `openssl`.
"""

import base64
import functools
import json
import pathlib
import subprocess
import time
import uuid

CLAVES = pathlib.Path(__file__).resolve().parents[3] / 'infra' / 'claves-desarrollo'
CLAVE_PRIVADA = CLAVES / 'jwt-privada.pem'
EMISOR = 'hexacore-administracion'


def b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b'=').decode()


def firmar(cabecera: dict, contenido: dict, clave=CLAVE_PRIVADA) -> str:
    """Un JWT RS256 con la cabecera y el contenido dados."""
    entrada = f"{b64(json.dumps(cabecera).encode())}.{b64(json.dumps(contenido).encode())}"
    firma = subprocess.run(
        ['openssl', 'dgst', '-sha256', '-sign', str(clave)],
        input=entrada.encode(), capture_output=True, check=True,
    ).stdout
    return f'{entrada}.{b64(firma)}'


def contenido_para(usuario: str, roles=('Cliente',), vida=3600, **cambios) -> dict:
    ahora = int(time.time())
    contenido = {'sub': usuario, 'roles': list(roles), 'jti': str(uuid.uuid4()),
                 'iat': ahora, 'exp': ahora + vida, 'iss': EMISOR}
    contenido.update(cambios)
    return contenido


@functools.lru_cache(maxsize=None)
def token_para(usuario: str, roles=('Cliente',)) -> str:
    """Token válido para `usuario`. Se reutiliza: firmar cuesta un proceso."""
    return firmar({'alg': 'RS256', 'typ': 'JWT'}, contenido_para(usuario, roles))


def cabeceras(usuario: str, roles=('Cliente',)) -> dict:
    return {'Authorization': f'Bearer {token_para(usuario, tuple(roles))}',
            'Content-Type': 'application/json'}
