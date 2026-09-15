#!/usr/bin/env python3
"""
Flujo alterno CU-006D: "La publicación expira sin haberse vendido".

Comprueba las cuatro propiedades del barrido de expiración:

  1. Una publicación vencida se cierra y su entrada vuelve al vendedor, que
     puede volver a publicarla.
  2. Una publicación vigente NO se toca.
  3. Una publicación vencida **con una compra en curso** se respeta: el bloqueo
     de checkout sigue vivo y esa compra merece terminar.
  4. El trabajo es idempotente: ejecutarlo dos veces no cambia nada la segunda.
  5. Dos barridos solapados no expiran la misma publicación dos veces. Puede
     pasar de verdad: el endpoint de mantenimiento no toma el bloqueo de tarea
     —si alguien lo fuerza a mano, quiere que se ejecute ya— y podría coincidir
     con el ciclo programado.

Se dispara con el endpoint de mantenimiento en vez de esperar al cron de diez
minutos. Las fechas de vencimiento se fuerzan por SQL: es la única forma de
tener una publicación caducada sin esperar a que pase un evento real.

    docker compose -f ../../../infra/docker-compose.yml up -d
    npm run migracion:correr && npm run semilla && npm run start:dev
    python3 pruebas/cu006d-expiracion.py
"""

import json
import subprocess
import urllib.error
import urllib.request
import uuid

API = 'http://localhost:3001/api/v1'
ANA = 'a0000001-0000-4000-8000-000000000001'
BRUNO = 'a0000002-0000-4000-8000-000000000002'
CARLA = 'a0000003-0000-4000-8000-000000000003'
E1 = '20000000-0000-4000-8000-000000000001'
E2 = '20000000-0000-4000-8000-000000000002'
E3 = '20000000-0000-4000-8000-000000000003'


def pedir(metodo, ruta, usuario, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f'{API}/{ruta}', data=datos, method=metodo,
                                 headers={'x-usuario-id': usuario, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
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


def vencer(publicacion_id):
    """Adelanta la fecha de expiración al pasado, como si el evento ya hubiera empezado."""
    sql(f"UPDATE publicaciones_reventa SET fecha_expiracion = now() - interval '1 hour' "
        f"WHERE id='{publicacion_id}'")


def barrer():
    estado, resultado = pedir('POST', 'reventa/mantenimiento/expirar-publicaciones', ANA)
    assert estado == 200, (estado, resultado)
    return resultado


def publicar(usuario, entrada, precio):
    estado, pub = pedir('POST', 'reventa/publicaciones', usuario, {'entradaId': entrada, 'precio': precio})
    assert estado == 201, (estado, pub)
    return pub


def vencida_se_cierra():
    print('### 1. Una publicación vencida se cierra y la entrada vuelve al vendedor')
    pub = publicar(ANA, E1, 300000)
    assert sql(f"SELECT estado FROM entradas WHERE id='{E1}'") == 'EN_REVENTA'
    vencer(pub['id'])

    resultado = barrer()
    assert resultado['expiradas'] >= 1, resultado

    assert sql(f"SELECT estado FROM publicaciones_reventa WHERE id='{pub['id']}'") == 'EXPIRADA'
    assert sql(f"SELECT fecha_cierre IS NOT NULL FROM publicaciones_reventa WHERE id='{pub['id']}'") == 't'
    # La entrada vuelve a VALIDA: si se quedara EN_REVENTA, el índice único
    # parcial impediría a su dueña volver a publicarla nunca más.
    assert sql(f"SELECT estado FROM entradas WHERE id='{E1}'") == 'VALIDA'
    print('  publicación EXPIRADA con fecha de cierre · entrada VALIDA otra vez')

    # Y lo que de verdad importa para el vendedor: puede volver a publicarla.
    otra = publicar(ANA, E1, 280000)
    assert otra['estado'] == 'ACTIVA'
    print(f"  la vendedora pudo republicarla: {otra['precio']}")


def vigente_no_se_toca():
    print('\n### 2. Una publicación vigente no se toca')
    pub = publicar(BRUNO, E3, 110000)
    barrer()
    assert sql(f"SELECT estado FROM publicaciones_reventa WHERE id='{pub['id']}'") == 'ACTIVA'
    assert sql(f"SELECT estado FROM entradas WHERE id='{E3}'") == 'EN_REVENTA'
    print('  sigue ACTIVA y su entrada sigue EN_REVENTA')


def con_checkout_en_curso_se_respeta():
    print('\n### 3. Una vencida con una compra en curso se respeta')
    pub = publicar(CARLA, '20000000-0000-4000-8000-000000000004', 150000)
    comprador = str(uuid.uuid4())
    estado, ck = pedir('POST', f"reventa/publicaciones/{pub['id']}/checkout", comprador)
    assert estado == 201, (estado, ck)
    # La ventana se cierra justo mientras esta persona está pagando.
    vencer(pub['id'])

    resultado = barrer()
    assert resultado['omitidasPorCheckout'] >= 1, resultado
    # Expirarla ahora rompería una compra a medio cobrar.
    assert sql(f"SELECT estado FROM publicaciones_reventa WHERE id='{pub['id']}'") == 'ACTIVA'
    print(f"  omitida por checkout vivo · sigue ACTIVA ({resultado['omitidasPorCheckout']} omitida/s)")

    # Al cancelar, el bloqueo se libera y el siguiente barrido ya puede cerrarla.
    pedir('DELETE', f"reventa/checkout/{ck['id']}", comprador)
    resultado = barrer()
    assert sql(f"SELECT estado FROM publicaciones_reventa WHERE id='{pub['id']}'") == 'EXPIRADA'
    print('  tras cancelar la compra, el siguiente barrido sí la expira')


def barridos_solapados_no_se_pisan():
    print('\n### 5. Dos barridos a la vez no expiran lo mismo dos veces')
    from concurrent.futures import ThreadPoolExecutor

    # Se resiembra: las pruebas anteriores dejaron estas entradas vendidas o
    # expiradas, y con una sola publicación esta comprobación no probaría nada.
    resembrar()

    # Tres publicaciones vencidas a la vez.
    publicaciones = []
    for usuario, entrada, precio in ((ANA, E1, 300000), (BRUNO, E3, 110000),
                                     (CARLA, '20000000-0000-4000-8000-000000000004', 150000)):
        estado, pub = pedir('POST', 'reventa/publicaciones', usuario,
                            {'entradaId': entrada, 'precio': precio})
        if estado == 201:
            vencer(pub['id'])
            publicaciones.append(pub['id'])
    assert publicaciones, 'no se pudo preparar ninguna publicación vencida'

    with ThreadPoolExecutor(max_workers=5) as pool:
        resultados = list(pool.map(lambda _: barrer(), range(5)))

    # La suma tiene que ser exactamente el número de publicaciones vencidas: si
    # dos barridos contaran la misma, el UPDATE condicional no estaría haciendo
    # su trabajo.
    total = sum(r['expiradas'] for r in resultados)
    assert total == len(publicaciones), f'{total} expiraciones para {len(publicaciones)} publicaciones'
    for pub_id in publicaciones:
        assert sql(f"SELECT estado FROM publicaciones_reventa WHERE id='{pub_id}'") == 'EXPIRADA'
    print(f'  {len(publicaciones)} publicaciones · 5 barridos simultáneos · {total} expiraciones en total')


def barrer_dos_veces_es_inocuo():
    print('\n### 4. Ejecutarlo dos veces seguidas no cambia nada')
    primero = barrer()
    segundo = barrer()
    assert segundo['expiradas'] == 0, segundo
    print(f"  primera pasada: {primero['expiradas']} expiradas · segunda: {segundo['expiradas']}")


if __name__ == '__main__':
    resembrar()
    vencida_se_cierra()
    vigente_no_se_toca()
    con_checkout_en_curso_se_respeta()
    barrer_dos_veces_es_inocuo()
    barridos_solapados_no_se_pisan()
    print('\nTODAS LAS ASERCIONES PASARON')
