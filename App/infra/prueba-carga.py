#!/usr/bin/env python3
"""
Prueba de carga de desempeño (RNF-07, RNF-08) sobre los casos de uso de Samuel,
con su reporte e interpretación. Se corre en vivo, con el sistema arriba:

    cd App/infra
    ./prueba-carga.py              # 3 escenarios × 5 niveles × 12 s (≈ 4,5 min)
    ./prueba-carga.py --rapida     # 3 niveles × 8 s (≈ 2 min), para la sustentación

Todo entra por el API Gateway (:8080), como el tráfico real. Mientras dura cada
nivel lee en Prometheus (monitoreo, `iniciar.sh --monitoreo`) cuánta CPU gastó
cada contenedor; con eso el informe dice **qué** se satura y **por qué**, y no
solo cuánto tarda. Sin el monitoreo arriba la prueba corre igual, sin esa parte.

Escribe `informe-atributos/CARGA.md` (tabla, gráfica en texto e interpretación)
y `informe-atributos/carga.json` con los datos crudos.
"""

import argparse
import datetime
import json
import os
import pathlib
import statistics
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get('CARGA_API', 'http://localhost:8080/api/v1')
PROMETHEUS = os.environ.get('CARGA_PROMETHEUS', 'http://localhost:8080/grafana/api/datasources/proxy/uid/prometheus/api/v1')
CONTRASENA = os.environ.get('CARGA_CONTRASENA', 'hexacore2026')
ORGANIZADOR = 'organizador@hexacore.com'
CLIENTE = 'cliente@hexacore.com'
UMBRAL_P95_MS = 500
SALIDA = pathlib.Path(__file__).resolve().parent / 'informe-atributos'
NEGRITA, VERDE, ROJO, GRIS, FIN = '\033[1m', '\033[32m', '\033[31m', '\033[90m', '\033[0m'


def pedir(ruta, cuerpo=None, token=None, espera=30):
    cabeceras = {'Content-Type': 'application/json'}
    if token:
        cabeceras['Authorization'] = f'Bearer {token}'
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    peticion = urllib.request.Request(f'{API}/{ruta}', data=datos, headers=cabeceras, method='POST' if datos else 'GET')
    try:
        with urllib.request.urlopen(peticion, timeout=espera) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def sesion(correo):
    estado, cuerpo = pedir('sesiones', {'email': correo, 'contrasena': CONTRASENA})
    if estado != 200:
        raise SystemExit(f'No se pudo iniciar sesión como {correo}: HTTP {estado}. ¿Están los datos de demo?')
    return json.loads(cuerpo)['token']


def escenarios():
    """Los tres, con su caso de uso, el programa que los atiende y la ruta."""
    organizador, cliente = sesion(ORGANIZADOR), sesion(CLIENTE)
    estado, cuerpo = pedir('eventos?estado=PUBLICADO', token=organizador)
    publicados = json.loads(cuerpo) if estado == 200 else []
    if not publicados:
        raise SystemExit('No hay eventos publicados: el panel de ocupación no tiene qué mostrar.')
    evento = publicados[0]['id']
    return [
        {'id': 'cu006', 'nombre': 'CU-006 · Catálogo de reventa', 'programa': 'Boletería', 'servicio': 'boleteria',
         'ruta': 'reventa/publicaciones', 'token': cliente},
        {'id': 'cu026', 'nombre': 'CU-026 · Eventos del organizador', 'programa': 'Núcleo', 'servicio': 'nucleo',
         'ruta': 'eventos', 'token': organizador},
        {'id': 'cu025', 'nombre': 'CU-025 · Panel de ocupación del parqueadero', 'programa': 'Núcleo', 'servicio': 'nucleo',
         'ruta': f'parqueaderos/eventos/{evento}/ocupacion', 'token': organizador},
    ]


def nivel(escenario, concurrencia, segundos):
    """`concurrencia` usuarios pidiendo sin pausa durante `segundos`."""
    latencias, fallos, candado = [], [0], threading.Lock()
    fin = time.monotonic() + segundos

    def usuario():
        while time.monotonic() < fin:
            inicio = time.perf_counter()
            try:
                estado, _ = pedir(escenario['ruta'], token=escenario['token'], espera=10)
            except Exception:
                estado = 0
            ms = (time.perf_counter() - inicio) * 1000
            with candado:
                if estado == 200:
                    latencias.append(ms)
                else:
                    fallos[0] += 1

    hilos = [threading.Thread(target=usuario, daemon=True) for _ in range(concurrencia)]
    desde = time.time()
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    hasta = time.time()
    orden = sorted(latencias) or [0.0]
    pct = lambda p: orden[min(len(orden) - 1, int(p * len(orden)))]
    return {
        'concurrencia': concurrencia, 'desde': desde, 'hasta': hasta,
        'peticiones': len(latencias), 'fallos': fallos[0],
        'por_segundo': len(latencias) / (hasta - desde),
        'p50': statistics.median(orden), 'p95': pct(0.95), 'p99': pct(0.99),
        'cpu': cpu_por_contenedor(desde, hasta),
    }


def prometheus(consulta, momento):
    url = f'{PROMETHEUS}/query?' + urllib.parse.urlencode({'query': consulta, 'time': f'{momento:.3f}'})
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return json.loads(r.read())['data']['result']
    except Exception:
        return None


def cpu_por_contenedor(desde, hasta):
    """
    % de un núcleo que usó cada contenedor durante el nivel. Toma la primera y la
    última muestra del contador de CPU que caen **dentro** de [desde, hasta] y
    divide por el tiempo real entre ellas: así no se mezcla con lo que pasaba
    antes o después del nivel.
    """
    time.sleep(2.5)  # la última muestra del nivel llega en el raspado siguiente (cada 2 s)
    ventana = int(hasta - desde) + 5
    series = prometheus(f'container_cpu_usage_seconds_total[{ventana}s]', hasta)
    if not series:
        return {}
    uso = {}
    for serie in series:
        dentro = [(float(t), float(v)) for t, v in serie['values'] if desde <= float(t) <= hasta]
        if len(dentro) >= 2 and dentro[-1][0] > dentro[0][0]:
            (t1, v1), (t2, v2) = dentro[0], dentro[-1]
            uso[serie['metric'].get('name')] = max(0.0, (v2 - v1) / (t2 - t1) * 100)
    return dict(sorted(uso.items(), key=lambda x: -x[1])[:6])


def replicas(servicio):
    """Cuántas instancias de un programa ve Prometheus ahora."""
    r = prometheus(f'count(container_memory_working_set_bytes{{servicio="{servicio}"}})', time.time())
    return int(float(r[0]['value'][1])) if r else None


def interpretar(esc, niveles):
    """Lo que dice cada escenario, en frases: cumple o no, dónde se dobla la curva y quién lo frena."""
    ultimo = niveles[-1]
    mejor = max(niveles, key=lambda n: n['por_segundo'])
    frases = []
    cumple = all(n['p95'] <= UMBRAL_P95_MS for n in niveles) and all(n['fallos'] == 0 for n in niveles)
    frases.append(
        f"**{'Cumple' if cumple else 'No cumple'} RNF-07**: p95 de {ultimo['p95']:.0f} ms con {ultimo['concurrencia']} "
        f"usuarios a la vez (umbral {UMBRAL_P95_MS} ms) y {sum(n['fallos'] for n in niveles)} peticiones fallidas.")

    # La rodilla: el primer nivel en que el rendimiento casi no sube y la latencia sí.
    rodilla = next((b for a, b in zip(niveles, niveles[1:])
                    if b['por_segundo'] < a['por_segundo'] * 1.15 and b['p95'] > a['p95'] * 1.5), None)
    if rodilla:
        frases.append(
            f"**Saturación desde {rodilla['concurrencia']} usuarios**: el rendimiento se queda en unas "
            f"{mejor['por_segundo']:.0f} peticiones/s y a partir de ahí cada usuario más solo espera en cola; "
            f"por eso la latencia crece casi en proporción a la concurrencia (Ley de Little: con el rendimiento "
            f"fijo, más usuarios en el sistema es más tiempo de respuesta).")
    else:
        frases.append(f"El rendimiento siguió subiendo hasta {mejor['por_segundo']:.0f} peticiones/s: no se alcanzó la saturación.")

    if ultimo['cpu']:
        detalle = ', '.join(f'{n} {c:.0f} %' for n, c in list(ultimo['cpu'].items())[:4])
        # Node ejecuta el código en un solo hilo: su techo es ~1 núcleo por réplica. PostgreSQL
        # reparte las conexiones en procesos y puede usar todos los núcleos, así que 90 % no lo
        # satura. Por eso se mira primero el proceso del servicio, y Postgres solo cuenta si pasa
        # de varios núcleos.
        propios = {n: c for n, c in ultimo['cpu'].items() if esc['servicio'] in n}
        postgres = next((c for n, c in ultimo['cpu'].items() if 'postgres' in n), 0)
        if propios and max(propios.values()) >= 65:
            quien, cuanto = max(propios.items(), key=lambda x: x[1])
            replicas_txt = 'cada réplica' if len(propios) > 1 else 'el proceso'
            causa = (f"{replicas_txt} de {esc['programa']} ronda el {cuanto:.0f} % de un núcleo y no sube aunque lleguen más "
                     f"usuarios. Node ejecuta el código de la aplicación en un solo hilo: ese es su techo, y ahí está el cuello de "
                     f"botella. Más réplicas detrás del gateway reparten justo eso (RNF-10)")
            if postgres >= 80:
                causa += (f"; PostgreSQL gasta {postgres:.0f} %, pero reparte el trabajo en varios procesos y núcleos, así que "
                          f"todavía no es el límite")
        elif postgres >= 300:
            causa = (f"PostgreSQL usa {postgres:.0f} % (más de tres núcleos): el límite está en la consulta y la base; más réplicas "
                     f"del servicio no ayudarían, sí un índice o una caché de la lectura")
        else:
            quien, cuanto = next(iter(ultimo['cpu'].items()))
            causa = (f"ningún componente llega a su techo (el que más, {quien}, {cuanto:.0f} %): el límite es la máquina "
                     f"compartida, donde el generador de carga compite por la misma CPU que el sistema")
        frases.append(f"**Por qué:** con {ultimo['concurrencia']} usuarios, {causa}. CPU por contenedor (% de un núcleo): {detalle}.")
    return frases


def barra(valor, maximo, ancho=30):
    return '█' * max(1, round(valor / maximo * ancho)) if maximo else ''


def main():
    argumentos = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    argumentos.add_argument('--rapida', action='store_true', help='3 niveles × 8 s, para la demostración en vivo')
    argumentos.add_argument('--escenario', choices=['cu006', 'cu026', 'cu025'], action='append', help='solo estos escenarios')
    opciones = argumentos.parse_args()
    concurrencias, segundos = ((10, 100, 200), 8) if opciones.rapida else ((1, 10, 50, 100, 200), 12)

    lista = [e for e in escenarios() if not opciones.escenario or e['id'] in opciones.escenario]
    print(f'{NEGRITA}Prueba de carga por el gateway{FIN} {GRIS}({API}; {len(concurrencias)} niveles × {segundos} s){FIN}')
    if not prometheus('up', time.time()):
        print(f'{GRIS}  Sin Prometheus: no habrá CPU por contenedor. Arranca con ./iniciar.sh --monitoreo.{FIN}')

    resultados = []
    for esc in lista:
        esc['replicas'] = replicas(esc['servicio'])
        print(f'\n{NEGRITA}{esc["nombre"]}{FIN} {GRIS}→ {esc["programa"]}, {esc["replicas"] or "?"} réplica(s), GET /{esc["ruta"]}{FIN}')
        print(f'  {"usuarios":>8} {"p50 ms":>8} {"p95 ms":>8} {"p99 ms":>8} {"pet/s":>8} {"fallos":>7}')
        niveles = []
        for c in concurrencias:
            n = nivel(esc, c, segundos)
            niveles.append(n)
            color = VERDE if n['p95'] <= UMBRAL_P95_MS and n['fallos'] == 0 else ROJO
            print(f'  {c:>8} {n["p50"]:>8.1f} {color}{n["p95"]:>8.1f}{FIN} {n["p99"]:>8.1f} {n["por_segundo"]:>8.1f} {n["fallos"]:>7}')
        frases = interpretar(esc, niveles)
        for f in frases:
            print('  ' + f.replace('**', ''))
        resultados.append({**{k: v for k, v in esc.items() if k != 'token'}, 'niveles': niveles, 'interpretacion': frases})

    escribir(resultados, segundos)
    print(f'\n{GRIS}Informe: {SALIDA / "CARGA.md"}{FIN}')
    return 0 if all(n['p95'] <= UMBRAL_P95_MS and n['fallos'] == 0 for r in resultados for n in r['niveles']) else 1


def escribir(resultados, segundos):
    SALIDA.mkdir(exist_ok=True)
    (SALIDA / 'carga.json').write_text(json.dumps(resultados, ensure_ascii=False, indent=2))
    ahora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    lineas = [
        '# Prueba de carga — casos de uso de Samuel', '',
        f'Medida el {ahora} por el API Gateway con `App/infra/prueba-carga.py`: cada nivel son N usuarios '
        f'pidiendo sin pausa durante {segundos} s. Umbral RNF-07: p95 ≤ {UMBRAL_P95_MS} ms sin fallos. '
        'La CPU por contenedor sale de Prometheus (tablero de Grafana en `/grafana/`).', '',
    ]
    for r in resultados:
        maximo = max(n['por_segundo'] for n in r['niveles'])
        lineas += [f'## {r["nombre"]}', '',
                   f'{r["programa"]}, {r["replicas"] or "?"} réplica(s) · `GET /api/v1/{r["ruta"].split("/eventos/")[0]}…`', '',
                   '| Usuarios | p50 (ms) | p95 (ms) | p99 (ms) | Peticiones/s | Fallos | Más CPU (% de un núcleo) |',
                   '|---:|---:|---:|---:|---:|---:|---|']
        for n in r['niveles']:
            cpu = ', '.join(f'{k} {v:.0f}' for k, v in list(n['cpu'].items())[:3]) or '—'
            lineas.append(f'| {n["concurrencia"]} | {n["p50"]:.1f} | **{n["p95"]:.1f}** | {n["p99"]:.1f} | '
                          f'{n["por_segundo"]:.0f} | {n["fallos"]} | {cpu} |')
        lineas += ['', '```text', 'Peticiones/s por nivel de usuarios']
        lineas += [f'{n["concurrencia"]:>5} │{barra(n["por_segundo"], maximo)} {n["por_segundo"]:.0f}' for n in r['niveles']]
        lineas += ['```', '', '**Interpretación**', ''] + [f'- {f}' for f in r['interpretacion']] + ['']
    lineas += [
        '## Lo que hay que tener en cuenta al leer las cifras', '',
        '- El generador de carga, el gateway, los dos programas y PostgreSQL corren en el mismo computador: '
        'compiten por la misma CPU. Las cifras son un piso, no la capacidad de un despliegue con máquinas separadas.',
        '- Entre corridas seguidas el p95 varía en torno a ±30 %: se comparan tendencias (dónde se satura y quién), '
        'no décimas de milisegundo.',
        '- Son lecturas: miden la ruta caliente de cada caso de uso (lo que miles consultan a la vez). '
        'Las escrituras con bloqueo se miden en las pruebas de concurrencia.', '',
        '## Cómo se reproduce', '', '```bash', 'cd App/infra && ./iniciar.sh --datos-demo --monitoreo',
        './prueba-carga.py            # o --rapida en vivo', '```', '']
    (SALIDA / 'CARGA.md').write_text('\n'.join(lineas))


if __name__ == '__main__':
    raise SystemExit(main())
