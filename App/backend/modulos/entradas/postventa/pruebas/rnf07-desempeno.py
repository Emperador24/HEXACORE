#!/usr/bin/env python3
"""
Atributo de **Rendimiento** — RNF-07 y RNF-08, medidos sobre el sistema real.

Los RNF de rendimiento hablan de la apertura de venta (CU-001) y de la
validación del QR en el ingreso (CU-002), que todavía no están implementados.
Lo que sí existe es el **mercado secundario (CU-006)**, y su consulta de
publicaciones es exactamente el mismo tipo de operación que RNF-07 describe:
una lectura de catálogo que miles de personas hacen a la vez en cuanto se abre
algo. Así que el umbral se aplica aquí.

Mide tres cosas, todas a través del **API Gateway** (que es como entra el
tráfico de verdad):

  1. Latencia p50/p95/p99 y peticiones por segundo del catálogo de reventa,
     con 1, 10, 50, 100 y 200 personas a la vez.
  2. Lo mismo para el detalle de una publicación, que toca más tablas.
  3. Si hay más de una instancia del servicio, cuánto mejora la latencia
     (la evidencia de que escalar horizontalmente sirve — RNF-10).

    python3 pruebas/rnf07-desempeno.py

Necesita la infraestructura arriba y las cuentas de ejemplo sembradas:

    docker compose -f ../../infra/docker-compose.yml --profile servicios up -d
    npm run semilla          # en este servicio y en administracion

Los números dependen de la máquina: aquí el generador de carga compite por la
misma CPU que el servicio y la base. En producción, con réplicas en máquinas
distintas, la capacidad es mayor.
"""

import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'http://localhost:8080/api/v1'
# Dos cuentas, y no una: el catálogo **no muestra las publicaciones propias**
# —nadie se compra su propia entrada—, así que quien vende y quien consulta
# tienen que ser personas distintas, igual que en el uso real.
CUENTA_VENDEDORA = 'cliente@hexacore.com'
CUENTA_COMPRADORA = 'bruno@hexacore.com'
CONTRASENA_DEMO = 'hexacore2026'

# RNF-07: p95 <= 500 ms. El umbral del RNF es con 2.000 usuarios concurrentes
# contra un despliegue real; aquí se mide en un portátil, así que se comprueba
# con la carga que un portátil puede generar sin falsear el resultado.
UMBRAL_P95_MS = 500
CONCURRENCIAS = (1, 10, 50, 100, 200)
PETICIONES_POR_NIVEL = 400


def pedir(ruta, cuerpo=None, metodo=None, token=None, espera=30):
    cabeceras = {'Content-Type': 'application/json'}
    if token:
        cabeceras['Authorization'] = f'Bearer {token}'
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    peticion = urllib.request.Request(
        f'{API}/{ruta}', data=datos, headers=cabeceras,
        method=metodo or ('POST' if datos else 'GET'))
    try:
        with urllib.request.urlopen(peticion, timeout=espera) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        cuerpo_error = e.read()
        try:
            return e.code, json.loads(cuerpo_error or b'{}')
        except json.JSONDecodeError:
            return e.code, {'crudo': cuerpo_error.decode(errors='replace')}


def cronometrar(ruta, token):
    """Una petición. Devuelve (milisegundos, ok)."""
    inicio = time.perf_counter()
    estado, _ = pedir(ruta, token=token)
    return (time.perf_counter() - inicio) * 1000, 200 <= estado < 300


def percentil(valores, p):
    """p-ésimo percentil por interpolación lineal, sin numpy."""
    if not valores:
        return float('nan')
    ordenados = sorted(valores)
    if len(ordenados) == 1:
        return ordenados[0]
    posicion = (len(ordenados) - 1) * p / 100
    bajo = int(posicion)
    alto = min(bajo + 1, len(ordenados) - 1)
    return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (posicion - bajo)


def medir(titulo, ruta, token, concurrencia, total=PETICIONES_POR_NIVEL):
    """Lanza `total` peticiones con `concurrencia` hilos a la vez."""
    # Una pasada corta primero: la primera petición paga compilación JIT y
    # apertura del pool de conexiones, y contarla desvirtúa la mediana.
    for _ in range(5):
        cronometrar(ruta, token)

    inicio = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrencia) as pool:
        resultados = list(pool.map(lambda _: cronometrar(ruta, token), range(total)))
    transcurrido = time.perf_counter() - inicio

    latencias = [ms for ms, ok in resultados if ok]
    fallos = sum(1 for _, ok in resultados if not ok)

    return {
        'titulo': titulo,
        'concurrencia': concurrencia,
        'total': total,
        'fallos': fallos,
        'rps': total / transcurrido,
        'p50': percentil(latencias, 50),
        'p95': percentil(latencias, 95),
        'p99': percentil(latencias, 99),
        'media': statistics.mean(latencias) if latencias else float('nan'),
    }


def imprimir_cabecera():
    print(f'{"Concurrencia":>13} {"p50 (ms)":>10} {"p95 (ms)":>10} {"p99 (ms)":>10} '
          f'{"pet/s":>9} {"fallos":>7}')
    print(' ' + '-' * 63)


def imprimir_fila(m):
    marca = '' if m['p95'] <= UMBRAL_P95_MS else '  <-- supera el umbral'
    print(f'{m["concurrencia"]:>13} {m["p50"]:>10.1f} {m["p95"]:>10.1f} {m["p99"]:>10.1f} '
          f'{m["rps"]:>9.1f} {m["fallos"]:>7}{marca}')


def instancias_activas(token):
    """Cuántas réplicas **de este servicio** hay detrás del gateway.

    Se pregunta por una ruta de reventa y no por `/salud`: esa la atiende el
    servicio de Administración, y contar sus instancias aquí daría un número
    que no tiene nada que ver con el que se está midiendo.
    """
    vistas = set()
    for _ in range(20):
        peticion = urllib.request.Request(
            f'{API}/reventa/publicaciones',
            headers={'Authorization': f'Bearer {token}'})
        try:
            with urllib.request.urlopen(peticion, timeout=5) as r:
                servidor = r.headers.get('X-Servidor')
                if servidor:
                    vistas.add(servidor)
        except urllib.error.URLError:
            pass
    return vistas


def lista(respuesta):
    """El cuerpo de una respuesta como lista, venga pelada o envuelta."""
    if isinstance(respuesta, list):
        return respuesta
    if isinstance(respuesta, dict):
        for clave in ('publicaciones', 'entradas', 'datos', 'items'):
            if isinstance(respuesta.get(clave), list):
                return respuesta[clave]
    return []


def sembrar_publicaciones(token_vendedor, token_consulta, cuantas=5):
    """Publica algunas entradas de la cuenta de ejemplo para que el catálogo
    tenga contenido. Las que no se puedan publicar (ya vendidas, evento sin
    reventa, ventana cerrada) se saltan: son los caminos de excepción del
    CU-006 y aquí no interesan."""
    estado, mias = pedir('reventa/mis-entradas', token=token_vendedor)
    if estado != 200:
        return []
    entradas = lista(mias)
    publicadas = 0
    for entrada in entradas:
        if publicadas >= cuantas:
            break
        estado, _ = pedir('reventa/publicaciones', {'entradaId': entrada['id'], 'precio': 150000},
                          token=token_vendedor)
        if 200 <= estado < 300:
            publicadas += 1
    if publicadas:
        print(f'  Se publicaron {publicadas} entradas para tener catálogo que consultar')
    estado, catalogo = pedir('reventa/publicaciones', token=token_consulta)
    return lista(catalogo) if estado == 200 else []


def iniciar_sesion(email):
    estado, sesion = pedir('sesiones', {'email': email, 'contrasena': CONTRASENA_DEMO})
    if estado not in (200, 201):
        print(f'  No se pudo iniciar sesión con {email} ({estado}): {sesion}')
        return None
    return sesion['token']


def main():
    print('### Preparación')
    token_vendedor = iniciar_sesion(CUENTA_VENDEDORA)
    token = iniciar_sesion(CUENTA_COMPRADORA)
    if not token or not token_vendedor:
        print('  ¿Están la infraestructura arriba y la semilla corrida?')
        return 1
    print(f'  Sesiones de {CUENTA_VENDEDORA} y {CUENTA_COMPRADORA}, por el gateway')

    estado, catalogo = pedir('reventa/publicaciones', token=token)
    if estado != 200:
        print(f'  El catálogo de reventa no responde ({estado}): {catalogo}')
        return 1
    publicaciones = lista(catalogo)

    # Medir contra un catálogo vacío no diría gran cosa: la consulta no llegaría
    # a tocar los join que sí paga en producción. Si está vacío, se publican unas
    # cuantas entradas de la propia cuenta de ejemplo.
    if not publicaciones:
        publicaciones = sembrar_publicaciones(token_vendedor, token)
    print(f'  {len(publicaciones)} publicaciones en el mercado secundario')

    replicas = instancias_activas(token)
    print(f'  Instancias del servicio detrás del gateway: {len(replicas) or "?"} '
          f'({", ".join(sorted(replicas)) if replicas else "sin cabecera"})')

    print()
    print('### RNF-07 — catálogo del mercado secundario (lectura de muchos a la vez)')
    print(f'    Umbral: p95 <= {UMBRAL_P95_MS} ms')
    imprimir_cabecera()
    medidas_catalogo = []
    for c in CONCURRENCIAS:
        m = medir('catálogo', 'reventa/publicaciones', token, c)
        medidas_catalogo.append(m)
        imprimir_fila(m)

    print()
    print('### Detalle de una publicación (toca más tablas que el listado)')
    if publicaciones:
        pub_id = publicaciones[0]['id']
        imprimir_cabecera()
        for c in (1, 50, 200):
            imprimir_fila(medir('detalle', f'reventa/publicaciones/{pub_id}', token, c))
    else:
        print('  (se omite: no hay publicaciones sembradas)')

    print()
    print('### Veredicto')
    peor = max(medidas_catalogo, key=lambda m: m['p95'])
    fallos = sum(m['fallos'] for m in medidas_catalogo)
    print(f'  Peor p95 medido: {peor["p95"]:.1f} ms con {peor["concurrencia"]} '
          f'peticiones simultáneas (umbral {UMBRAL_P95_MS} ms)')
    print(f'  Capacidad máxima observada: {max(m["rps"] for m in medidas_catalogo):.1f} '
          f'peticiones por segundo')
    print(f'  Peticiones fallidas en toda la prueba: {fallos}')

    if peor['p95'] <= UMBRAL_P95_MS and fallos == 0:
        print()
        print(f'OK — RNF-07 se cumple con hasta {max(CONCURRENCIAS)} peticiones simultáneas')
        return 0
    print()
    print('ATENCIÓN — se superó el umbral o hubo fallos; revisar arriba en qué nivel')
    return 1


if __name__ == '__main__':
    sys.exit(main())
