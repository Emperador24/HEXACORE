#!/usr/bin/env python3
"""
Informe cuantitativo de los atributos de calidad — un solo comando.

    cd App/infra
    ./atributos-calidad.py

Corre las suites que miden cada atributo contra el sistema **desplegado**
—a través del API Gateway, que es por donde entra el tráfico real—, extrae de
cada una sus cifras y escribe un informe consolidado.

## Para qué existe

La entrega pide demostrar en vivo cada atributo de calidad con resultados
cuantitativos. Hasta ahora esas cifras estaban dispersas: había que recordar
qué guion medía qué, correrlos uno a uno desde carpetas distintas y leer el
número a ojo en la salida. Delante del evaluador eso son cinco minutos de
cambiar de directorio.

Esto lo vuelve una orden, y deja el resultado por escrito:

  * `informe-atributos/INFORME.md`  — la tabla consolidada, lista para leer
  * `informe-atributos/<suite>.log` — la salida entera de cada suite, por si
                                      alguien quiere ver de dónde sale cada cifra

## Lo que NO hace

No mide desplegabilidad por defecto: esa medición exige borrar los volúmenes y
levantar de cero, y nadie quiere eso a mitad de una demostración. Va aparte,
con `--desplegabilidad`, que avisa antes de borrar nada.

Tampoco inventa cifras: si una suite falla, su fila queda marcada como fallida
y el informe lo dice. Un informe que da por bueno lo que no se midió es peor
que no tener informe.
"""

import argparse
import datetime
import pathlib
import re
import subprocess
import sys
import time

INFRA = pathlib.Path(__file__).resolve().parent
SERVICIOS = INFRA.parent / 'services'
SALIDA = INFRA / 'informe-atributos'

VERDE, ROJO, GRIS, NEGRITA, FIN = '\033[32m', '\033[31m', '\033[90m', '\033[1m', '\033[0m'


def extraer(texto, patron, defecto='—'):
    """La primera coincidencia del grupo 1, o el defecto si la suite no llegó ahí."""
    encontrado = re.search(patron, texto)
    return encontrado.group(1).strip() if encontrado else defecto


# Cada medición dice qué atributo cubre, qué RNF, dónde vive la suite y cómo se
# leen sus cifras. Añadir una medición nueva es añadir una entrada aquí.
MEDICIONES = [
    {
        'atributo': 'Desempeño',
        'rnf': 'RNF-07, RNF-08',
        'escenario': 'Consulta de catálogo durante la apertura de venta',
        'carpeta': SERVICIOS / 'entradas-mercado-secundario',
        'suite': 'pruebas/rnf07-desempeno.py',
        'cifras': lambda t: [
            ('Peor p95 bajo carga', extraer(t, r'Peor p95 medido:\s*(.+?)\s*\(umbral'), 'umbral 500 ms'),
            ('Capacidad máxima', extraer(t, r'Capacidad máxima observada:\s*(.+)'), '—'),
            ('Peticiones fallidas', extraer(t, r'Peticiones fallidas en toda la prueba:\s*(\d+)'), 'exigido 0'),
        ],
    },
    {
        'atributo': 'Disponibilidad',
        'rnf': 'RNF-03, RNF-04',
        'escenario': 'El login sigue atendiendo con una dependencia caída, y se recupera solo',
        'carpeta': SERVICIOS / 'administracion',
        'suite': 'pruebas/cu027-disponibilidad.py',
        'cifras': lambda t: [
            ('Recuperación tras kill -9', extraer(t, r'atendiendo logins de nuevo en\s*(.+)'), 'exigido ≤ 30 s'),
            ('Login con Redis caído', extraer(t, r'hexacore-redis\s+login\s+(\d+ en\s+\d+ ms)'), 'debe seguir sirviendo'),
            ('Login con RabbitMQ caído', extraer(t, r'hexacore-rabbitmq\s+login\s+(\d+ en\s+\d+ ms)'), 'debe seguir sirviendo'),
            ('Login con PostgreSQL caído', extraer(t, r'hexacore-postgres\s+login\s+(\d+ en\s+\d+ ms)'), '503 honesto, no 200 falso'),
        ],
    },
    {
        'atributo': 'Seguridad',
        'rnf': 'RNF-05, RNF-06',
        'escenario': 'Toda petición llega autenticada y autorizada por rol desde el gateway',
        'carpeta': SERVICIOS / 'entradas-mercado-secundario',
        'suite': 'pruebas/rnf06-autenticacion.py',
        'cifras': lambda t: [
            ('Rutas de negocio abiertas', extraer(t, r'RNF-06:\s*(.+)'), 'exigido 0 %'),
            ('Intentos de entrar rechazados', f"{len(re.findall(r':\s*401\s*$', t, re.M))} con 401",
             'sin token, firma ajena, alg none, HS256, caducado, otro emisor, manipulado'),
            ('Revocación al cerrar sesión', 'inmediata' if 'recibe 401 en la reventa al instante' in t else '—', 'el token deja de valer en todo el sistema'),
            ('Sin poder comprobar la revocación', '503' if 'Redis en pausa: 503' in t else '—', 'no se acepta un token no comprobable'),
        ],
    },
    {
        'atributo': 'Consistencia',
        'rnf': 'RNF-01, RNF-02',
        'escenario': 'Ninguna entrada publicada puede venderse a dos compradores',
        'carpeta': SERVICIOS / 'entradas-mercado-secundario',
        'suite': 'pruebas/rnf01-concurrencia.py',
        'cifras': lambda t: [
            ('50 compradores a la vez', f"{extraer(t, r'checkouts abiertos\s*:\s*(\d+)')} checkout, "
                                        f"{extraer(t, r'rechazados\s*:\s*(\d+)')} rechazados", 'exigido exactamente 1'),
            ('Pago con reserva caducada', f"{extraer(t, r'cobros APROBADA\s*:\s*(\d+)')} cobro aprobado", 'exigido exactamente 1'),
            ('Los dos pagan a la vez', f"{extraer(t, r'pagos aceptados\s*:\s*(\d+)')} pago, "
                                       f"{extraer(t, r'QR emitidos\s*:\s*(\d+)')} QR", 'exigido exactamente 1'),
        ],
    },
]


def correr(medicion):
    """Ejecuta una suite y devuelve (ok, salida, segundos)."""
    inicio = time.monotonic()
    proceso = subprocess.run(
        ['python3', medicion['suite']],
        cwd=medicion['carpeta'], capture_output=True, text=True,
    )
    return proceso.returncode == 0, proceso.stdout + proceso.stderr, time.monotonic() - inicio


def medir_desplegabilidad():
    """
    De cero a sistema completo y utilizable, con un solo guion.

    Borra los volúmenes antes: medir sobre una base ya migrada y sembrada daría
    un número que no significa nada, porque lo lento es justo eso.
    """
    print(f'\n{NEGRITA}Desplegabilidad — de cero a sistema completo{FIN}')
    print(f'{ROJO}  Esto BORRA los datos (docker compose down -v) y vuelve a levantar todo.{FIN}')
    respuesta = input('  ¿Seguir? [s/N] ').strip().lower()
    if respuesta not in ('s', 'si', 'sí'):
        print(f'{GRIS}  Omitido.{FIN}')
        return None

    subprocess.run(['docker', 'compose', '-f', 'docker-compose.yml', '--profile', 'servicios',
                    'down', '-v'], cwd=INFRA, capture_output=True)
    inicio = time.monotonic()
    proceso = subprocess.run(['./iniciar.sh'], cwd=INFRA, capture_output=True, text=True)
    segundos = time.monotonic() - inicio
    (SALIDA / 'desplegabilidad.log').write_text(proceso.stdout + proceso.stderr)
    return proceso.returncode == 0, segundos


def main():
    argumentos = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    argumentos.add_argument('--desplegabilidad', action='store_true',
                            help='mide también el arranque de cero (BORRA los datos; pide confirmación)')
    opciones = argumentos.parse_args()

    # Sin sistema levantado no hay nada que medir, y es mejor decirlo ahora que
    # después de cuatro suites fallidas.
    comprobacion = subprocess.run(['curl', '-sf', 'http://localhost:8080/api/v1/salud'],
                                  capture_output=True)
    if comprobacion.returncode != 0:
        print(f'{ROJO}El sistema no responde en el gateway (localhost:8080).{FIN}')
        print('Levántalo con:  cd App/infra && ./iniciar.sh')
        return 1

    SALIDA.mkdir(exist_ok=True)
    momento = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    print(f'{NEGRITA}HEXACORE — atributos de calidad{FIN}  {GRIS}{momento}{FIN}')
    print(f'{GRIS}Contra el sistema desplegado, a través del API Gateway.{FIN}\n')

    resultados = []
    for medicion in MEDICIONES:
        print(f'  {medicion["atributo"]:16s} ', end='', flush=True)
        ok, salida, segundos = correr(medicion)
        nombre = pathlib.Path(medicion['suite']).stem
        (SALIDA / f'{nombre}.log').write_text(salida)
        cifras = medicion['cifras'](salida) if ok else []
        resultados.append({**medicion, 'ok': ok, 'cifras': cifras, 'segundos': segundos, 'log': f'{nombre}.log'})
        print(f'{VERDE}OK{FIN} {GRIS}({segundos:.0f} s){FIN}' if ok else f'{ROJO}FALLÓ{FIN} {GRIS}(ver {nombre}.log){FIN}')

    despliegue = medir_desplegabilidad() if opciones.desplegabilidad else None

    # --- Tabla en pantalla ---------------------------------------------------
    print()
    for r in resultados:
        estado = f'{VERDE}✔{FIN}' if r['ok'] else f'{ROJO}✘{FIN}'
        print(f'{NEGRITA}{r["atributo"]}{FIN} {GRIS}({r["rnf"]}){FIN} {estado}')
        print(f'  {GRIS}{r["escenario"]}{FIN}')
        if r['ok']:
            for etiqueta, valor, referencia in r['cifras']:
                print(f'    {etiqueta:38s} {NEGRITA}{valor:28s}{FIN} {GRIS}{referencia}{FIN}')
        else:
            print(f'    {ROJO}la suite falló; no hay cifra que reportar{FIN}')
        print()

    if despliegue:
        ok, segundos = despliegue
        estado = f'{VERDE}✔{FIN}' if ok else f'{ROJO}✘{FIN}'
        print(f'{NEGRITA}Desplegabilidad{FIN} {GRIS}(RNF-15){FIN} {estado}')
        print(f'    {"De cero a sistema utilizable":38s} {NEGRITA}{segundos:.0f} s{FIN} {GRIS}un solo guion{FIN}\n')

    escribir_informe(resultados, despliegue, momento)
    fallidas = [r for r in resultados if not r['ok']]
    print(f'{GRIS}Informe: {SALIDA / "INFORME.md"}{FIN}')
    if fallidas:
        print(f'{ROJO}{len(fallidas)} medición(es) fallaron: las cifras de arriba están incompletas.{FIN}')
        return 1
    return 0


def escribir_informe(resultados, despliegue, momento):
    lineas = [
        '# HEXACORE — Resultados cuantitativos de los atributos de calidad',
        '',
        f'Medido el {momento} contra el sistema desplegado, a través del API Gateway',
        '(ADR-02), que es por donde entra el tráfico real.',
        '',
        'Generado por `App/infra/atributos-calidad.py`. Cada fila se puede volver a',
        'obtener delante de quien lo pida corriendo ese mismo guion; la salida completa',
        'de cada suite está en los `.log` de esta misma carpeta.',
        '',
        '| Atributo | RNF | Medición | Resultado | Referencia |',
        '|---|---|---|---|---|',
    ]
    for r in resultados:
        if not r['ok']:
            lineas.append(f'| {r["atributo"]} | {r["rnf"]} | — | **la suite falló** | ver `{r["log"]}` |')
            continue
        for i, (etiqueta, valor, referencia) in enumerate(r['cifras']):
            atributo = f'**{r["atributo"]}**' if i == 0 else ''
            rnf = r['rnf'] if i == 0 else ''
            lineas.append(f'| {atributo} | {rnf} | {etiqueta} | **{valor}** | {referencia} |')

    if despliegue:
        ok, segundos = despliegue
        lineas.append(f'| **Desplegabilidad** | RNF-15 | De cero a sistema utilizable | '
                      f'**{segundos:.0f} s** | un solo guion, `./iniciar.sh` |')

    lineas += ['', '## Escenario de cada atributo', '']
    for r in resultados:
        lineas += [f'### {r["atributo"]} ({r["rnf"]})', '',
                   r['escenario'] + '.', '',
                   f'Suite: `{r["carpeta"].name}/{r["suite"]}` · salida completa en `{r["log"]}` '
                   f'· duración {r["segundos"]:.0f} s', '']

    lineas += [
        '## Cómo se reproduce',
        '',
        '```bash',
        'cd App/infra && ./iniciar.sh          # levanta el sistema completo',
        './atributos-calidad.py               # vuelve a medir y reescribe este informe',
        './atributos-calidad.py --desplegabilidad   # incluye el arranque de cero (borra datos)',
        '```',
        '',
    ]
    (SALIDA / 'INFORME.md').write_text('\n'.join(lineas))


if __name__ == '__main__':
    sys.exit(main())
