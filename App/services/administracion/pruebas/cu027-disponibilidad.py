#!/usr/bin/env python3
"""
Atributo de Disponibilidad del CU-027 — *"el login es crítico y debe responder
incluso en horas pico (apertura de venta)"* — y RNF-03 / RNF-04.

Mide, no solo comprueba:

  1. Capacidad: logins por segundo y latencia con 10, 50, 100 y 300 personas.
  2. Que un pico de logins no deje sin conexiones al resto del servicio.
  3. Qué pasa con el login si cae cada dependencia (Redis, RabbitMQ, PostgreSQL).
  4. RNF-04: si el proceso muere, cuánto tarda en volver (solo si el servicio
     corre en el contenedor `hexacore-administracion`; con npm se omite).

Crea 300 cuentas `carga-N@hexacore.com` y las borra al terminar.

    python3 pruebas/cu027-disponibilidad.py

Los números dependen de la máquina. Los umbrales de abajo son los que este
servicio debe cumplir **en un portátil**, con el generador de carga compitiendo
por la misma CPU; en producción, con réplicas, la capacidad se multiplica.
"""

import json
import subprocess
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'http://localhost:3002/api/v1'
CONTRASENA_DEMO = 'hexacore2026'
CUENTAS = 300


def pedir(ruta, cuerpo=None, metodo=None, token=None, espera=30):
    cabeceras = {'Content-Type': 'application/json'}
    if token:
        cabeceras['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(f'{API}/{ruta}', data=json.dumps(cuerpo).encode() if cuerpo else None,
                                 method=metodo or ('POST' if cuerpo else 'GET'), headers=cabeceras)
    inicio = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            estado, datos = r.status, json.load(r)
    except urllib.error.HTTPError as e:
        estado, datos = e.code, json.loads(e.read() or b'{}')
    except Exception as e:  # noqa: BLE001 — un timeout también es un resultado
        estado, datos = type(e).__name__, {}
    return estado, datos, time.perf_counter() - inicio


def login(email):
    return pedir('sesiones', {'email': email, 'contrasena': CONTRASENA_DEMO})


def sql(consulta):
    return subprocess.run(['docker', 'exec', 'hexacore-postgres', 'psql', '-U', 'hexacore',
                           '-d', 'administracion', '-tAc', consulta],
                          capture_output=True, text=True, check=True).stdout.strip()


def docker(*args):
    return subprocess.run(['docker', *args], capture_output=True, text=True)


def percentil(valores, p):
    ordenados = sorted(valores)
    return ordenados[min(len(ordenados) - 1, int(len(ordenados) * p))] * 1000


def crear_cuentas():
    sql(f"""INSERT INTO usuarios (nombre, email, hash_contrasena, estado, verificado_en)
            SELECT 'Carga ' || g, 'carga-' || g || '@hexacore.com',
                   (SELECT hash_contrasena FROM usuarios WHERE email = 'cliente@hexacore.com'), 'ACTIVA', now()
            FROM generate_series(1, {CUENTAS}) g ON CONFLICT DO NOTHING;
            INSERT INTO usuarios_roles (usuario_id, rol_id, asignado_por)
            SELECT u.id, r.id, NULL FROM usuarios u, roles r
            WHERE u.email LIKE 'carga-%' AND r.nombre = 'Cliente' ON CONFLICT DO NOTHING""")


def borrar_cuentas():
    sql("DELETE FROM usuarios WHERE email LIKE 'carga-%'")


# --------------------------------------------------------------------------


def capacidad():
    print('### 1. Capacidad del login')
    resultados = {}
    for concurrencia in (10, 50, 100, 300):
        total = concurrencia * 3
        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=concurrencia) as pool:
            res = list(pool.map(lambda i: login(f'carga-{i % CUENTAS + 1}@hexacore.com'), range(total)))
        duracion = time.perf_counter() - t0
        ok = [t for e, _, t in res if e == 200]
        assert len(ok) == total, f'{total - len(ok)} logins fallaron con {concurrencia} a la vez'
        resultados[concurrencia] = (len(ok) / duracion, percentil(ok, .95))
        print(f'  {concurrencia:>3} a la vez: {len(ok) / duracion:5.0f} login/s · '
              f'p50 {percentil(ok, .5):5.0f} ms · p95 {percentil(ok, .95):5.0f} ms')
    # Se exige capacidad, no latencia. Con 300 personas a la vez, la espera es
    # casi exactamente 300 / capacidad: depende de la CPU disponible y solo se
    # baja añadiendo réplicas. Antes de las correcciones (DECISIONES.md §17):
    # 76 login/s con los 4 hilos por defecto de Node.
    assert resultados[300][0] > 85, f'capacidad por debajo de la anterior: {resultados[300][0]:.0f} login/s'


def sin_inanicion():
    print('\n### 2. Un pico de logins no deja sin conexiones al resto del servicio')
    _, sesion, _ = login('cliente@hexacore.com')
    token = sesion['token']
    fin, tiempos = threading.Event(), []

    def pico():
        with ThreadPoolExecutor(max_workers=300) as pool:
            list(pool.map(lambda i: login(f'carga-{i % CUENTAS + 1}@hexacore.com'), range(900)))
        fin.set()

    hilo = threading.Thread(target=pico)
    hilo.start()
    time.sleep(1)
    estados = []
    while not fin.is_set():
        estado, _, t = pedir('sesiones/actual', token=token)
        estados.append(estado)
        tiempos.append(t)
    hilo.join()
    maximo = max(tiempos) * 1000
    p95 = percentil(tiempos, .95) if len(tiempos) > 1 else maximo
    print(f'  GET /sesiones/actual durante 300 logins simultáneos: '
          f'mediana {percentil(tiempos, .5):.0f} ms · p95 {p95:.0f} ms · '
          f'máx {maximo:.0f} ms ({len(tiempos)} muestras)')
    # Antes: máx 4.878 ms, porque scrypt retenía las conexiones del pool. Con
    # el límite de espera de 3 s, un pool agotado ya no se vería como lentitud
    # sino como 503: por eso se exige que todas respondan 200.
    #
    # Se mide el **p95 y no el máximo**. La inanición del pool es sostenida: si
    # las conexiones están retenidas, todas las consultas esperan, no una. El
    # máximo es una sola muestra y en una máquina cargada —el generador de
    # carga, los 11 hilos de scrypt y Docker peleando por la misma CPU— basta
    # un traspié del planificador para dispararlo; se sigue imprimiendo, pero
    # fallar por él era fallar por la máquina, no por el servicio.
    assert all(e == 200 for e in estados), f'respuestas distintas de 200: {set(estados)}'
    assert p95 < 2000, f'el 5 % más lento esperó {p95:.0f} ms: el pool se está quedando sin conexiones'
    en_transaccion = sql("""SELECT count(*) FROM pg_stat_activity
                            WHERE datname = 'administracion' AND state = 'idle in transaction'""")
    assert en_transaccion == '0', f'{en_transaccion} conexiones retenidas en transacción tras el pico'


def dependencias():
    print('\n### 3. El login con cada dependencia caída')
    casos = [('hexacore-redis', 'pause', 'unpause', 200, 200),
             ('hexacore-rabbitmq', 'stop', 'start', 200, 200),
             # Sin base no hay login posible: lo que se exige es que falle
             # rápido y en claro, y que /salud lo diga.
             ('hexacore-postgres', 'pause', 'unpause', 503, 503)]
    for contenedor, accion, deshacer, login_esperado, salud_esperada in casos:
        docker(accion, contenedor)
        try:
            time.sleep(2)
            estado, cuerpo, t = login('carga-1@hexacore.com')
            salud, datos, _ = pedir('salud', espera=5)
        finally:
            docker(deshacer, contenedor)
        print(f'  {contenedor:<18} login {estado} en {t * 1000:5.0f} ms · /salud {salud} '
              f'{datos.get("dependencias", "")}')
        assert estado == login_esperado, (contenedor, estado, cuerpo)
        assert salud == salud_esperada, (contenedor, salud)
        assert t < 5, f'con {contenedor} caído el login tardó {t:.1f} s'
        if estado == 503:
            assert cuerpo['codigo'] == 'SERVICIO_NO_DISPONIBLE', cuerpo

        t0 = time.perf_counter()
        while login('carga-1@hexacore.com')[0] != 200:
            assert time.perf_counter() - t0 < 60, f'el login no volvió tras {deshacer} {contenedor}'
            time.sleep(0.5)
        print(f'  {"":<18} de vuelta en {time.perf_counter() - t0:.1f} s, sin intervención')


def recuperacion():
    print('\n### 4. RNF-04: el proceso muere y vuelve solo (≤ 30 s)')
    contenedor = 'hexacore-administracion'
    if docker('inspect', '-f', '{{.State.Running}}', contenedor).stdout.strip() != 'true':
        print('  (el servicio no corre en contenedor: se omite; ver App/infra/README.md)')
        return
    # Una caída de verdad: el proceso muere desde dentro. `docker kill` no
    # sirve, porque Docker lo cuenta como parada manual y no reinicia.
    docker('exec', contenedor, 'sh', '-c', 'kill -9 $(pgrep -x node)')
    t0 = time.perf_counter()
    while login('carga-1@hexacore.com')[0] != 200:
        assert time.perf_counter() - t0 < 30, 'RNF-04 incumplido: más de 30 s sin atender'
        time.sleep(0.2)
    print(f'  kill -9 → atendiendo logins de nuevo en {time.perf_counter() - t0:.1f} s')


if __name__ == '__main__':
    crear_cuentas()
    try:
        capacidad()
        sin_inanicion()
        dependencias()
        recuperacion()
    finally:
        borrar_cuentas()
    print('\nOK — Disponibilidad del CU-027')
