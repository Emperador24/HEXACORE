#!/usr/bin/env python3
"""
Mide de punta a punta los dos requisitos de «llega a tiempo» de Samuel, con el
sistema arriba y todo por el API Gateway:

    cd App/infra
    ./tiempo-real.py                         # los dos (≈ 1,5 min)
    ./tiempo-real.py ocupacion               # RNF-09: del ingreso al tablero, ≤ 2 s
    ./tiempo-real.py evacuacion              # RNF-17: ≥ 99 % del personal en ≤ 10 s
    ./tiempo-real.py evacuacion --caida      # lo mismo, matando una réplica del Núcleo en la activación

**RNF-09 (CU-025 y CU-019).** Se abre el panel en vivo como lo abre el portal
(Server-Sent Events con el token en la cabecera) y se cronometra desde que se
manda un ingreso hasta que el panel lo muestra:

- Parqueadero: `POST /parqueaderos/eventos/:id/ingresos` → `total.ocupados` del
  flujo de ocupación. Mismo módulo y misma base: mide el ciclo del flujo.
- Monitoreo: `POST /ingresos` (QR en la puerta, Boletería) → `aforo.asistentes`
  del flujo de Monitoreo (Núcleo). Cruza la bandeja de salida, RabbitMQ y el
  consumidor de Operación: es la cadena entera de la arquitectura.

Cada muestra arranca en un instante al azar dentro del ciclo del panel, para
no medir siempre la misma fase.

**RNF-17 (CU-010).** El personal en campo se entera de la evacuación desde la
app móvil, que consulta `GET /emergencias/eventos/:id/activa` cada 4 s. Aquí N
dispositivos simulados hacen exactamente eso (cada uno empieza en una fase al
azar, con las cuentas de Personal de los datos de demo), el organizador
propone y confirma la evacuación, y cada dispositivo anota cuándo la vio. El
reloj empieza cuando se envía la confirmación, que es la activación.

Prepara por la API sus propios recintos y eventos («Medición RNF-09 …»,
«Medición RNF-17 …») y al final los cancela. Para el ingreso por QR carga
unos pocos QR de prueba en la base con `docker exec` (`CARGA_POSTGRES`).

Escribe `informe-atributos/TIEMPO-REAL.md` y `tiempo-real.json`.
"""

import argparse
import datetime
import json
import os
import pathlib
import random
import statistics
import subprocess
import threading
import time
import urllib.error
import urllib.request

API = os.environ.get('CARGA_API', 'http://localhost:8080/api/v1')
CONTRASENA = os.environ.get('CARGA_CONTRASENA', 'hexacore2026')
POSTGRES = os.environ.get('CARGA_POSTGRES', 'hexacore-postgres')
ORGANIZADOR = 'organizador@hexacore.com'
PERSONAL = ['personal@hexacore.com', 'parqueadero@hexacore.com', 'restaurante@hexacore.com',
            'jefepersonal@hexacore.com', 'reemplazo@hexacore.com']
UMBRAL_PANEL_S = 2.0          # RNF-09
UMBRAL_AVISO_S = 10.0         # RNF-17
PORCENTAJE_AVISO = 99.0       # RNF-17
SONDEO_APP_S = 4.0            # app móvil, pantalla de evacuación (main.dart)
SALIDA = pathlib.Path(__file__).resolve().parent / 'informe-atributos'
NEGRITA, VERDE, ROJO, GRIS, FIN = '\033[1m', '\033[32m', '\033[31m', '\033[90m', '\033[0m'


def pedir(ruta, cuerpo=None, token=None, metodo=None, espera=15):
    cabeceras = {'Content-Type': 'application/json'}
    if token:
        cabeceras['Authorization'] = f'Bearer {token}'
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    peticion = urllib.request.Request(f'{API}/{ruta}', data=datos, headers=cabeceras, method=metodo or ('POST' if datos else 'GET'))
    try:
        with urllib.request.urlopen(peticion, timeout=espera) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        cuerpo = e.read()
        try:
            return e.code, json.loads(cuerpo)
        except ValueError:
            return e.code, cuerpo.decode(errors='replace')


def exigir(estado, cuerpo, que):
    if estado not in (200, 201):
        raise SystemExit(f'{que}: HTTP {estado} {str(cuerpo)[:300]}')
    return cuerpo


def sesion(correo):
    return exigir(*pedir('sesiones', {'email': correo, 'contrasena': CONTRASENA}), f'Sesión de {correo}')['token']


def sql(consulta):
    salida = subprocess.run(['docker', 'exec', '-i', POSTGRES, 'psql', '-U', 'hexacore', '-d', 'hexacore', '-Atqc', consulta],
                            capture_output=True, text=True)
    if salida.returncode != 0:
        raise SystemExit(f'PostgreSQL ({POSTGRES}): {salida.stderr.strip()}')
    return salida.stdout.strip()


def esperar(condicion, que, limite=30):
    fin = time.monotonic() + limite
    while time.monotonic() < fin:
        if condicion():
            return
        time.sleep(0.3)
    raise SystemExit(f'{que} no ocurrió en {limite} s.')


def evento_de_medicion(organizador, nombre, zonas):
    """Recinto con zonas y evento publicado para mañana, por la API (como preparar.ts de la demo)."""
    sufijo = format(int(time.time() * 1000), 'x')[-5:].upper()
    recinto = exigir(*pedir('recintos', {
        'nombre': f'Recinto {nombre} {sufijo}', 'ciudad': 'Bogotá', 'direccion': 'Calle de la medición 9',
        'capacidad': sum(z['capacidad'] for z in zonas), 'zonas': zonas}, token=organizador), 'Recinto de medición')['recinto']
    inicio = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)
    creado = exigir(*pedir('eventos', {
        'nombre': f'Medición {nombre} {sufijo}', 'categoria': 'Conciertos', 'artista': 'Medición',
        'recintoId': recinto['id'], 'fechaInicio': inicio.isoformat(), 'fechaFin': (inicio + datetime.timedelta(hours=4)).isoformat(),
        'localidades': [{'nombre': 'General', 'precio': 1000, 'cantidad': sum(z['capacidad'] for z in zonas)}]},
        token=organizador), 'Evento de medición')
    evento = creado.get('evento', creado)
    exigir(*pedir(f'eventos/{evento["id"]}/publicar', {'version': evento['version']}, token=organizador), 'Publicar el evento')
    return {'id': evento['id'], 'nombre': evento['nombre'], 'sufijo': sufijo, 'recinto': recinto}


def cancelar(organizador, evento_id, motivo):
    estado, cuerpo = pedir(f'eventos/{evento_id}', token=organizador)
    if estado == 200:
        version = cuerpo.get('evento', cuerpo).get('version')
        pedir(f'eventos/{evento_id}/cancelar', {'version': version, 'motivo': motivo}, token=organizador)


class Flujo(threading.Thread):
    """Un panel en vivo abierto como lo abre el portal: guarda (instante, datos) de cada evento SSE."""

    def __init__(self, ruta, token):
        super().__init__(daemon=True)
        self.ruta, self.token, self.eventos, self.listo = ruta, token, [], threading.Event()
        self.candado, self.cerrar = threading.Condition(), False

    def run(self):
        peticion = urllib.request.Request(f'{API}/{self.ruta}', headers={'Authorization': f'Bearer {self.token}', 'Accept': 'text/event-stream'})
        with urllib.request.urlopen(peticion, timeout=60) as r:
            tipo, datos = None, []
            for linea in r:
                if self.cerrar:
                    return
                linea = linea.decode().rstrip('\n')
                if linea.startswith('event:'):
                    tipo = linea[6:].strip()
                elif linea.startswith('data:'):
                    datos.append(linea[5:].strip())
                elif linea == '' and datos:
                    momento = time.perf_counter()
                    with self.candado:
                        self.eventos.append((momento, tipo, json.loads('\n'.join(datos))))
                        self.candado.notify_all()
                    self.listo.set()
                    tipo, datos = None, []

    def esperar(self, desde, condicion, limite=10):
        """El primer evento posterior a `desde` que cumple `condicion`; su instante, o None."""
        fin = time.monotonic() + limite
        with self.candado:
            while True:
                for momento, _, datos in self.eventos:
                    if momento >= desde and condicion(datos):
                        return momento
                restante = fin - time.monotonic()
                if restante <= 0:
                    return None
                self.candado.wait(restante)


def resumen(valores):
    orden = sorted(valores)
    if not orden:
        return {'n': 0}
    pct = lambda p: orden[min(len(orden) - 1, int(p * len(orden)))]
    return {'n': len(orden), 'p50': statistics.median(orden), 'p95': pct(0.95), 'max': orden[-1], 'min': orden[0]}


# --- RNF-09 ------------------------------------------------------------------

def medir_ocupacion(organizador, muestras):
    print(f'\n{NEGRITA}RNF-09 · Del ingreso al tablero (≤ {UMBRAL_PANEL_S:.0f} s){FIN}')
    evento = evento_de_medicion(organizador, 'RNF-09', [{'nombre': 'General', 'capacidad': 5000, 'x': 10, 'y': 10, 'ancho': 80, 'alto': 80}])
    exigir(*pedir(f'parqueaderos/eventos/{evento["id"]}/zonas', {'nombre': 'Zona medición', 'capacidad': 5000}, token=organizador),
           'Zona del parqueadero')
    # Unos QR de prueba para la puerta: llegan a Acceso QR por el broker, como un evento real.
    esperar(lambda: sql(f"SELECT count(*) FROM entradas_acceso_qr.eventos_referencia WHERE evento_id = '{evento['id']}'") == '1',
            'El evento en Acceso QR')
    prefijo = f'TR-{evento["sufijo"]}-'
    sql(f"""INSERT INTO entradas_acceso_qr.qr_entradas (entrada_id, evento_id, hash_qr, numero_ticket, localidad_nombre, estado, secuencia)
            SELECT gen_random_uuid(), '{evento['id']}', encode(sha256(convert_to('{prefijo}' || lpad(i::text, 4, '0'), 'UTF8')), 'hex'),
                   'TCK-TR{evento['sufijo']}-' || lpad(i::text, 4, '0'), 'General', 'VALIDA', 1 FROM generate_series(1, {muestras}) AS i""")
    personal = sesion(PERSONAL[0])

    resultados = {}
    casos = [
        ('parqueadero', 'CU-025 · Panel de ocupación del parqueadero', f'parqueaderos/eventos/{evento["id"]}/ocupacion/flujo',
         lambda d: d['total']['ocupados'],
         lambda i: pedir(f'parqueaderos/eventos/{evento["id"]}/ingresos', {'placa': f'M{evento["sufijo"][-3:]}{i:03d}'}, token=organizador)),
        ('monitoreo', 'CU-019 · Panel de monitoreo (QR → broker → Operación)', f'monitoreo/eventos/{evento["id"]}/flujo',
         lambda d: d['aforo']['asistentes'],
         lambda i: pedir('ingresos', {'eventoId': evento['id'], 'codigoQr': f'{prefijo}{i:04d}', 'puntoAcceso': 'Puerta medición'}, token=personal)),
    ]
    for clave, nombre, ruta, contador, ingresar in casos:
        flujo = Flujo(ruta, organizador)
        flujo.start()
        if not flujo.listo.wait(10):
            raise SystemExit(f'El flujo {ruta} no emitió nada en 10 s.')
        tiempos, fallos = [], 0
        print(f'  {nombre}')
        for i in range(1, muestras + 1):
            time.sleep(random.uniform(0.2, 1.4))          # fase al azar dentro del ciclo de 1 s
            with flujo.candado:
                previo = contador(flujo.eventos[-1][2])
            inicio = time.perf_counter()
            estado, cuerpo = ingresar(i)
            if estado not in (200, 201):
                fallos += 1
                print(f'    {ROJO}ingreso {i}: HTTP {estado} {str(cuerpo)[:120]}{FIN}')
                continue
            visto = flujo.esperar(inicio, lambda d: contador(d) > previo)
            if visto is None:
                fallos += 1
                continue
            tiempos.append(visto - inicio)
        flujo.cerrar = True
        r = {'nombre': nombre, 'ruta': ruta, 'muestras': muestras, 'fallos': fallos, **resumen(tiempos),
             'dentro': sum(t <= UMBRAL_PANEL_S for t in tiempos), 'tiempos': tiempos}
        color = VERDE if fallos == 0 and r.get('max', 99) <= UMBRAL_PANEL_S else ROJO
        print(f'    {color}p50 {r["p50"]:.2f} s · p95 {r["p95"]:.2f} s · máx {r["max"]:.2f} s{FIN} · '
              f'{r["dentro"]}/{muestras} dentro de {UMBRAL_PANEL_S:.0f} s · {fallos} sin reflejar')
        resultados[clave] = r
    cancelar(organizador, evento['id'], 'Evento de la medición RNF-09')
    return resultados


# --- RNF-17 ------------------------------------------------------------------

def nucleos():
    salida = subprocess.run(['docker', 'ps', '--filter', 'label=com.docker.compose.service=nucleo', '--format', '{{.Names}}'],
                            capture_output=True, text=True)
    return sorted(salida.stdout.split())


def medir_evacuacion(organizador, dispositivos, caida):
    print(f'\n{NEGRITA}RNF-17 · Aviso de evacuación al personal (≥ {PORCENTAJE_AVISO:.0f} % en ≤ {UMBRAL_AVISO_S:.0f} s){FIN}')
    zonas = [{'nombre': n, 'capacidad': 1000, 'x': x, 'y': 20, 'ancho': 25, 'alto': 60} for n, x in (('Norte', 5), ('Centro', 37), ('Sur', 69))]
    evento = evento_de_medicion(organizador, 'RNF-17', zonas)
    ids = {z['nombre']: z['id'] for z in evento['recinto']['zonas']}
    exigir(*pedir(f'emergencias/recintos/{evento["recinto"]["id"]}/plan', {
        'salidas': [{'nombre': 'Salida A', 'capacidadPorMinuto': 50}, {'nombre': 'Salida B', 'capacidadPorMinuto': 50}],
        'rutas': [{'zonaId': ids[n], 'salida': s, 'prioridad': 1} for n, s in (('Norte', 'Salida A'), ('Centro', 'Salida A'), ('Sur', 'Salida B'))],
    }, token=organizador, metodo='PUT'), 'Plan de evacuación')
    tokens = [sesion(c) for c in PERSONAL]
    esperar(lambda: pedir(f'emergencias/eventos/{evento["id"]}/activa', token=tokens[0])[0] == 200, 'El evento en Operación')

    activacion, parar = [None], threading.Event()
    vistos, errores, consultas, candado = {}, [0], [0], threading.Lock()

    def dispositivo(n):
        token = tokens[n % len(tokens)]
        time.sleep(random.uniform(0, SONDEO_APP_S))          # cada teléfono abrió la app en otro momento
        while not parar.is_set():
            inicio = time.perf_counter()
            estado, cuerpo = pedir(f'emergencias/eventos/{evento["id"]}/activa', token=token, espera=10)
            with candado:
                consultas[0] += 1
                if estado != 200:
                    errores[0] += 1
                elif cuerpo.get('activa') and activacion[0] is not None and n not in vistos:
                    vistos[n] = time.perf_counter() - activacion[0]
            if n in vistos:
                return
            parar.wait(max(0.0, SONDEO_APP_S - (time.perf_counter() - inicio)))

    hilos = [threading.Thread(target=dispositivo, args=(n,), daemon=True) for n in range(dispositivos)]
    for h in hilos:
        h.start()
    time.sleep(SONDEO_APP_S + 2)                              # todos ya están consultando
    propuesta = exigir(*pedir(f'emergencias/eventos/{evento["id"]}/evacuaciones', {
        'tipo': 'PREVENTIVA', 'ubicacion': 'Medición RNF-17', 'nivel': 3, 'alcance': 'TOTAL',
        'descripcion': 'Simulacro de medición: no es una emergencia'}, token=organizador), 'Proponer la evacuación')
    evacuacion = propuesta.get('evacuacion', propuesta)['id']
    replica_caida = None
    if caida:
        vivas = nucleos()
        if len(vivas) < 2:
            raise SystemExit('--caida necesita al menos 2 réplicas del Núcleo (demo-disponibilidad.sh las levanta).')
        replica_caida = vivas[0]
    activacion[0] = time.perf_counter()
    if replica_caida:
        subprocess.run(['docker', 'exec', replica_caida, 'kill', '-9', '1'], capture_output=True)
    exigir(*pedir(f'emergencias/evacuaciones/{evacuacion}/confirmar', {}, token=organizador), 'Confirmar la evacuación')
    time.sleep(UMBRAL_AVISO_S + SONDEO_APP_S)
    parar.set()
    for h in hilos:
        h.join(timeout=12)

    tiempos = list(vistos.values())
    dentro = sum(t <= UMBRAL_AVISO_S for t in tiempos)
    r = {'dispositivos': dispositivos, 'sondeo_s': SONDEO_APP_S, 'replica_caida': replica_caida, 'recibieron': len(tiempos),
         'dentro': dentro, 'porcentaje': 100 * dentro / dispositivos, 'consultas': consultas[0], 'errores': errores[0],
         **resumen(tiempos), 'tiempos': tiempos}

    # El otro canal: avisos que el Núcleo publica en la cola de prioridad (notificaciones_evacuacion).
    estado, reporte = pedir(f'emergencias/evacuaciones/{evacuacion}/reporte', token=organizador)
    if estado == 200:
        r['avisos'] = reporte.get('avisos')
    # Cierre del simulacro: cada zona evacuada y la evacuación finalizada.
    _, detalle = pedir(f'emergencias/evacuaciones/{evacuacion}', token=organizador)
    for zona in (detalle or {}).get('zonas', []):
        pedir(f'emergencias/evacuaciones/{evacuacion}/zonas/{zona.get("zonaId") or zona.get("id")}', {'estado': 'EVACUADA', 'personasRestantes': 0},
              token=organizador, metodo='PATCH')
    pedir(f'emergencias/evacuaciones/{evacuacion}/finalizar', {'observaciones': 'Simulacro de medición RNF-17'}, token=organizador)
    cancelar(organizador, evento['id'], 'Evento de la medición RNF-17')

    cumple = r['porcentaje'] >= PORCENTAJE_AVISO and r['errores'] == 0
    color = VERDE if cumple else ROJO
    print(f'  {dispositivos} dispositivos consultando cada {SONDEO_APP_S:.0f} s'
          + (f', con {replica_caida} muerto en la activación' if replica_caida else ''))
    print(f'  {color}{dentro}/{dispositivos} ({r["porcentaje"]:.1f} %) la vieron en ≤ {UMBRAL_AVISO_S:.0f} s{FIN} · '
          f'p50 {r.get("p50", 0):.2f} s · p95 {r.get("p95", 0):.2f} s · máx {r.get("max", 0):.2f} s · '
          f'{r["errores"]} errores en {r["consultas"]} consultas')
    if r.get('avisos'):
        a = r['avisos']
        print(f'  {GRIS}Cola de avisos: {a.get("entregados")}/{a.get("total")} entregados, '
              f'latencia máx. {((a.get("latenciaMaximaMs") or 0) / 1000):.2f} s{FIN}')
    return r


def escribir(resultados):
    SALIDA.mkdir(exist_ok=True)
    nombre = 'TIEMPO-REAL-caida' if resultados.get('evacuacion', {}).get('replica_caida') else 'TIEMPO-REAL'
    (SALIDA / f'{nombre.lower()}.json').write_text(json.dumps(resultados, ensure_ascii=False, indent=2))
    ahora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    l = ['# Tiempo real (RNF-09) y aviso de evacuación (RNF-17)', '',
         f'Medido el {ahora} con `App/infra/tiempo-real.py`, todo por el API Gateway, en un solo computador '
         '(Docker Desktop). Los paneles son los flujos SSE que abre el portal; los dispositivos imitan la app móvil.', '']
    if 'ocupacion' in resultados:
        l += [f'## RNF-09 · Del ingreso al tablero (umbral {UMBRAL_PANEL_S:.0f} s)', '',
              'Cronómetro: desde que se envía el ingreso hasta que el panel en vivo lo muestra. '
              'Cada muestra empieza en una fase al azar del ciclo de 1 s del panel.', '',
              '| Panel | Muestras | p50 (s) | p95 (s) | Máx. (s) | Dentro de 2 s | Sin reflejar |', '|---|---:|---:|---:|---:|---:|---:|']
        for r in resultados['ocupacion'].values():
            l.append(f'| {r["nombre"]} | {r["muestras"]} | {r.get("p50", 0):.2f} | {r.get("p95", 0):.2f} | '
                     f'**{r.get("max", 0):.2f}** | {r["dentro"]}/{r["muestras"]} | {r["fallos"]} |')
        l += ['', '- **Parqueadero:** el ingreso y el panel están en el mismo módulo y la misma base; '
              'el tiempo es la espera hasta el siguiente ciclo del flujo (1 s) más la consulta.',
              '- **Monitoreo:** el QR se valida en Boletería, el aviso sale por la bandeja de salida (cada 300 ms), '
              'cruza RabbitMQ, lo guarda el consumidor de Operación en el Núcleo y lo muestra el siguiente ciclo del flujo.', '']
    if 'evacuacion' in resultados:
        r = resultados['evacuacion']
        l += [f'## RNF-17 · Aviso de evacuación (≥ {PORCENTAJE_AVISO:.0f} % en ≤ {UMBRAL_AVISO_S:.0f} s)', '',
              f'{r["dispositivos"]} dispositivos simulados consultan la evacuación activa cada {r["sondeo_s"]:.0f} s, como la app '
              'móvil del personal, cada uno desde una fase al azar. El reloj empieza al enviar la confirmación (la activación).'
              + (f' En ese instante se mata con `kill -9` la réplica `{r["replica_caida"]}` del Núcleo.' if r['replica_caida'] else ''), '',
              '| Dispositivos | La vieron en ≤ 10 s | % | p50 (s) | p95 (s) | Máx. (s) | Errores / consultas |',
              '|---:|---:|---:|---:|---:|---:|---:|',
              f'| {r["dispositivos"]} | {r["dentro"]} | **{r["porcentaje"]:.1f}** | {r.get("p50", 0):.2f} | {r.get("p95", 0):.2f} | '
              f'{r.get("max", 0):.2f} | {r["errores"]} / {r["consultas"]} |', '']
        if r.get('avisos'):
            a = r['avisos']
            l += [f'Cola de avisos del Núcleo (altavoces, asistentes y personal): {a.get("entregados")}/{a.get("total")} entregados, '
                  f'latencia máxima {((a.get("latenciaMaximaMs") or 0) / 1000):.2f} s desde que se creó el aviso.', '']
        l += ['- El peor caso es un sondeo completo de la app (4 s) más una respuesta: el diseño deja margen frente a los 10 s.',
              '- Mide la llegada a la app. No mide teléfonos apagados, sin señal o con la app cerrada: '
              'para eso hacen falta notificaciones push o SMS reales, que el prototipo no tiene.', '']
    l += ['## Cómo se reproduce', '', '```bash', 'cd App/infra && ./iniciar.sh --datos-demo --monitoreo',
          './tiempo-real.py                     # RNF-09 y RNF-17',
          './tiempo-real.py evacuacion --caida  # con 2 réplicas del Núcleo (demo-disponibilidad.sh)', '```', '']
    (SALIDA / f'{nombre}.md').write_text('\n'.join(l))
    return SALIDA / f'{nombre}.md'


def main():
    argumentos = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    argumentos.add_argument('medicion', nargs='?', choices=['ocupacion', 'evacuacion'], help='solo una de las dos')
    argumentos.add_argument('--muestras', type=int, default=20, help='ingresos por panel en RNF-09 (20)')
    argumentos.add_argument('--dispositivos', type=int, default=300, help='teléfonos simulados en RNF-17 (300)')
    argumentos.add_argument('--caida', action='store_true', help='RNF-17 matando una réplica del Núcleo al activar')
    opciones = argumentos.parse_args()

    organizador = sesion(ORGANIZADOR)
    resultados = {}
    if opciones.medicion in (None, 'ocupacion'):
        resultados['ocupacion'] = medir_ocupacion(organizador, opciones.muestras)
    if opciones.medicion in (None, 'evacuacion'):
        resultados['evacuacion'] = medir_evacuacion(organizador, opciones.dispositivos, opciones.caida)
    print(f'\n{GRIS}Informe: {escribir(resultados)}{FIN}')

    ok = all(r['fallos'] == 0 and r.get('max', 99) <= UMBRAL_PANEL_S for r in resultados.get('ocupacion', {}).values())
    if 'evacuacion' in resultados:
        ok &= resultados['evacuacion']['porcentaje'] >= PORCENTAJE_AVISO
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
