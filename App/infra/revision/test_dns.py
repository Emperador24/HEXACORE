#!/usr/bin/env python3
"""Fallo DNS dirigido en el gateway CU-015 propio; restaura su config al salir.

No levanta servidores ni modifica Docker DNS. Compara el proxy anterior por
variable con el upstream real, mediante dos rutas temporales de solo lectura.
"""
import fcntl
import json
import time
import urllib.error
import urllib.request
from uuid import uuid4
import revision as r


def pedir(ruta):
    try:
        respuesta = urllib.request.urlopen(f'http://127.0.0.1:18100{ruta}', timeout=15)
    except urllib.error.HTTPError as e:
        respuesta = e
    with respuesta:
        return respuesta.code, respuesta.headers.get('X-Ensayo-DNS'), respuesta.read()


def instalar(texto, marca=None):
    # Mismo inode que el montaje de solo lectura. Las claves no se modifican.
    (r.ESTADO / 'gateway.conf').write_text(texto)
    r.compose('exec', '-T', 'api-gateway', 'nginx', '-t', capturar=True)
    r.compose('exec', '-T', 'api-gateway', 'nginx', '-s', 'reload', capturar=True)
    limite = time.monotonic() + 15
    while True:
        estado, recibida, _ = pedir('/salud')
        if estado == 200 and recibida == marca:
            return
        if time.monotonic() >= limite:
            raise AssertionError('El gateway propio no cargó la configuración del ensayo')
        time.sleep(0.05)  # Solo readiness del reload; ninguna operación de negocio.


def main():
    r.seleccionar_perfil('cu015')
    r.exigir(r.git('branch', '--show-current') == 'feature/sebastian',
             'Ensayo DNS exclusivo de feature/sebastian')
    c = json.loads(r.compose('config', '--format', 'json', capturar=True))
    r.validar_configuracion(c)
    propios = r.contenedores_propios()
    r.comprobar_recursos(c, propios)
    assert any(x['State']['Running'] and x['Config']['Labels']['com.docker.compose.service'] == 'api-gateway' for x in propios)
    with (r.ESTADO / 'operacion.lock').open('a') as bloqueo:
        fcntl.flock(bloqueo, fcntl.LOCK_EX | fcntl.LOCK_NB)
        anterior = (r.ESTADO / 'gateway.conf').read_text()
        r.archivos()
        original = (r.ESTADO / 'gateway.conf').read_text()
        try:
            r.compose('exec', '-T', 'api-gateway', 'nginx', '-t', capturar=True)
        except Exception:
            (r.ESTADO / 'gateway.conf').write_text(anterior)
            raise  # El master todavía conserva la configuración anterior.
        assert 'server nucleo:3002 resolve;' in original
        marca = uuid4().hex
        rutas = '''
    location = /__ensayo_dns_control {
        set $control "nucleo:3002";
        proxy_pass http://$control/api/v1/salud;
    }
    location = /__ensayo_dns_upstream {
        proxy_pass http://nucleo_http/api/v1/salud;
    }
'''
        ensayo = original.replace('server_name _;', f'server_name _;\n    add_header X-Ensayo-DNS "{marca}" always;\n' + rutas, 1)
        try:
            instalar(ensayo, marca)
            assert pedir('/__ensayo_dns_upstream')[0] == 200
            assert pedir('/__ensayo_dns_control')[0] == 200
            # Resolver inaccesible SOLO en la configuración del gateway propio.
            # Al recargar, la zona conserva el resultado anterior. El TTL sigue 5 s
            # y resolver_timeout sigue 3 s: no se amplía ninguno de los dos.
            marca_fallo = uuid4().hex
            fallo = ensayo.replace('resolver 127.0.0.11 ', 'resolver 127.0.0.1:9 ').replace(marca, marca_fallo)
            assert fallo != ensayo
            instalar(fallo, marca_fallo)
            time.sleep(9)  # TTL + espera DNS + margen; no es un retry de negocio.
            control = pedir('/__ensayo_dns_control')[0]
            nuevo = pedir('/__ensayo_dns_upstream')[0]
            assert control == 503, ('El control debe reproducir el fallo DNS', control)
            assert nuevo == 200, ('El upstream debe conservar el destino conocido', nuevo)
            print(json.dumps({'controlDnsCaido': control, 'upstreamDnsCaido': nuevo}))
        finally:
            instalar(original)
        assert pedir('/api/v1/salud')[0] == 200
        assert pedir('/__ensayo_dns_upstream')[0] == 404
        print('DNS original restaurado; salud 200; rutas temporales retiradas.')


if __name__ == '__main__':
    main()
