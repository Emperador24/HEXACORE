#!/usr/bin/env python3
"""
CU-006 de extremo a extremo: publicar, reservar, pagar y transferir.

Recorre el flujo básico (pasos 1-11) y los tres caminos de excepción que
dependen de la pasarela:

    CU-006G   el pago es rechazado
    CU-006I   la pasarela responde 502
    CU-006I   la pasarela no responde nunca (timeout real de 10 s)

y comprueba en la base de datos lo que el caso de uso declara como
post-condiciones: la propiedad cambió, el QR anterior ya no existe (RNF-02) y
la transferencia quedó registrada en el historial (RNF-11).

Necesita la infraestructura y el servicio levantados:

    docker compose -f ../../../infra/docker-compose.yml up -d
    npm run migracion:correr && npm run semilla && npm run start:dev
    python3 pruebas/cu006-flujo-completo.py

Resiembra al empezar, así que no depende del estado que dejen otras pruebas.
"""

import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid

API = 'http://localhost:3001/api/v1'
ANA = 'a0000001-0000-4000-8000-000000000001'
BRUNO = 'a0000002-0000-4000-8000-000000000002'
E1 = '20000000-0000-4000-8000-000000000001'
E3 = '20000000-0000-4000-8000-000000000003'
E4 = '20000000-0000-4000-8000-000000000004'
# Palco VIP de Ana. Se reserva para el caso del timeout porque E1 ya quedó
# vendida en el flujo básico y no se puede volver a publicar.
E2 = '20000000-0000-4000-8000-000000000002'


def pedir(metodo, ruta, usuario, cuerpo=None, espera=60):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f'{API}/{ruta}', data=datos, method=metodo,
                                 headers={'x-usuario-id': usuario, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def sql(consulta):
    return subprocess.run(
        ['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
         '-d', 'entradas_mercado_secundario', '-tAc', consulta],
        capture_output=True, text=True).stdout.strip()


def resembrar():
    subprocess.run(['npm', 'run', 'semilla'], capture_output=True, check=True)
    subprocess.run(['redis-cli', '-p', '6380', 'FLUSHALL'], capture_output=True)


def camino_feliz():
    print('### Flujo básico — pasos 1 a 11')
    comprador = str(uuid.uuid4())
    _, pub = pedir('POST', 'reventa/publicaciones', ANA, {'entradaId': E1, 'precio': 300000})
    qr_antes = sql(f"SELECT codigo_qr FROM entradas WHERE id='{E1}'")
    _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)
    estado, compra = pedir('POST', f"reventa/checkout/{ck['id']}/pagar", comprador,
                           {'metodoPago': 'TARJETA', 'token': 'tok_ok'})

    assert estado == 200, (estado, compra)
    assert compra['transferida'] is True
    print(f"  {ck['numeroTransaccion']} · QR {qr_antes} -> {compra['codigoQr']}")

    # Post-condición 1: la propiedad se actualizó.
    assert sql(f"SELECT propietario_id FROM entradas WHERE id='{E1}'") == comprador
    # Post-condición 2 y RNF-02: el QR anterior ya no existe en ninguna fila.
    assert sql(f"SELECT count(*) FROM entradas WHERE codigo_qr='{qr_antes}'") == '0'
    # Post-condición 3 y RNF-11: la transferencia quedó auditada.
    cadena = sql(f"SELECT string_agg(motivo::text,' -> ' ORDER BY id) "
                 f"FROM historial_propietarios WHERE entrada_id='{E1}'")
    assert cadena == 'EMISION -> REVENTA', cadena
    # El reparto cuadra al centavo.
    assert sql(f"SELECT precio = comision + neto_vendedor FROM transacciones_reventa "
               f"WHERE id='{ck['id']}'") == 't'
    print(f"  propiedad cambiada · QR viejo inexistente · historial: {cadena}")


def pago_rechazado():
    print('\n### CU-006G — el pago es rechazado')
    comprador = str(uuid.uuid4())
    _, pub = pedir('POST', 'reventa/publicaciones', BRUNO, {'entradaId': E3, 'precio': 110000})
    _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)
    estado, r = pedir('POST', f"reventa/checkout/{ck['id']}/pagar", comprador,
                      {'metodoPago': 'TARJETA', 'token': 'tok_rechazo'})

    assert estado == 409 and r['codigo'] == 'CU-006G', (estado, r)
    assert sql(f"SELECT estado FROM transacciones_reventa WHERE id='{ck['id']}'") == 'RECHAZADA'
    # Se sabe que no hubo cargo, así que la publicación vuelve al mercado ya.
    assert sql(f"SELECT estado FROM publicaciones_reventa WHERE id='{pub['id']}'") == 'ACTIVA'
    otro, _ = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", str(uuid.uuid4()))
    assert otro == 201, 'tras un rechazo, otra persona debería poder reservarla'
    print(f"  HTTP {estado} · transacción RECHAZADA · la publicación vuelve al mercado")


def pasarela_caida():
    print('\n### CU-006I — la pasarela responde 502')
    comprador = str(uuid.uuid4())
    _, pub = pedir('POST', 'reventa/publicaciones',
                   'a0000003-0000-4000-8000-000000000003', {'entradaId': E4, 'precio': 150000})
    _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)
    estado, r = pedir('POST', f"reventa/checkout/{ck['id']}/pagar", comprador,
                      {'metodoPago': 'PSE', 'token': 'tok_error'})

    assert estado == 503 and r['codigo'] == 'CU-006I', (estado, r)
    assert r['requiereConciliacion'] is True
    assert sql(f"SELECT estado FROM transacciones_reventa WHERE id='{ck['id']}'") == 'FALLIDA'
    # El bloqueo NO se libera: como no se sabe si hubo cargo, dejar entrar a
    # otro comprador podría acabar en dos cobros por una sola entrada.
    otro, cuerpo = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", str(uuid.uuid4()))
    assert otro == 409 and cuerpo['codigo'] == 'CU-006H', (otro, cuerpo)
    print(f"  HTTP {estado} · transacción FALLIDA · la publicación queda retenida hasta conciliar")


def pasarela_muda():
    print('\n### CU-006I — la pasarela no responde nunca')
    comprador = str(uuid.uuid4())
    _, pub = pedir('POST', 'reventa/publicaciones', ANA, {'entradaId': E2, 'precio': 700000})
    assert 'id' in pub, pub
    _, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)

    inicio = time.time()
    estado, r = pedir('POST', f"reventa/checkout/{ck['id']}/pagar", comprador,
                      {'metodoPago': 'TARJETA', 'token': 'tok_timeout'})
    transcurrido = time.time() - inicio

    assert estado == 503 and r['codigo'] == 'CU-006I', (estado, r)
    # El adaptador tiene que cortar por su cuenta: sin timeout, la petición
    # quedaría colgada para siempre con el bloqueo puesto.
    assert 9 < transcurrido < 15, f'el timeout no se respetó ({transcurrido:.1f} s)'
    print(f"  cortó a los {transcurrido:.1f} s por su propio timeout · HTTP {estado}")


def sin_datos_de_tarjeta():
    print('\n### RNF-05 — la pasarela rechaza cualquier dato de tarjeta')
    req = urllib.request.Request(
        'http://localhost:3099/pagos', method='POST',
        data=json.dumps({'monto': 1, 'token': 'tok_ok', 'cvv': '123'}).encode(),
        headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req)
        raise AssertionError('la pasarela aceptó datos de tarjeta')
    except urllib.error.HTTPError as e:
        assert e.code == 400
        print(f"  HTTP {e.code} · {json.loads(e.read())['error']}")


if __name__ == '__main__':
    resembrar()
    camino_feliz()
    pago_rechazado()
    pasarela_caida()
    pasarela_muda()
    sin_datos_de_tarjeta()
    print('\nTODAS LAS ASERCIONES PASARON')
