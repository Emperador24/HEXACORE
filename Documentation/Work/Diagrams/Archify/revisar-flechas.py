#!/usr/bin/env python3
"""
Revisa que las flechas de las vistas se lean bien, algo que el validador de
Archify no comprueba del todo:

- dos flechas no recorren el mismo tramo (segmentos colineales que se solapan);
- dos flechas que llegan a la misma caja no llegan al mismo punto, ni a menos
  de MINIMO px una de otra.

Lee las coordenadas reales de cada relación del SVG generado
(`data-composition-points`).

    ./revisar-flechas.py 01-contexto.html 02-contenedores.html …

Termina con 1 si encuentra algún problema.
"""
import re
import sys
from itertools import combinations

TOLERANCIA = 3   # px: dos tramos a menos de esto se consideran el mismo
MINIMO = 24      # px: separación mínima entre dos puntas en la misma caja


def relaciones(html):
    svg = html[html.find('<svg'):html.find('</svg>')]
    for m in re.finditer(r'<path[^>]*data-edge-id="([^"]+)"[^>]*>', svg):
        etiqueta = m.group(0)
        hacia = re.search(r'data-edge-to="([^"]+)"', etiqueta).group(1)
        puntos = re.search(r'data-composition-points="([^"]+)"', etiqueta).group(1)
        yield m.group(1), hacia, [tuple(map(float, p.split(','))) for p in puntos.split(';')]


def tramos(puntos):
    return [(a, b) for a, b in zip(puntos, puntos[1:]) if a != b]


def solapan(s, t):
    (ax, ay), (bx, by) = s
    (cx, cy), (dx, dy) = t
    if ay == by and cy == dy and abs(ay - cy) <= TOLERANCIA:
        uno, otro = sorted((ax, bx)), sorted((cx, dx))
    elif ax == bx and cx == dx and abs(ax - cx) <= TOLERANCIA:
        uno, otro = sorted((ay, by)), sorted((cy, dy))
    else:
        return 0
    return min(uno[1], otro[1]) - max(uno[0], otro[0])


def revisar(ruta):
    rels = list(relaciones(open(ruta, encoding='utf-8').read()))
    problemas = []
    for (id1, hacia1, p1), (id2, hacia2, p2) in combinations(rels, 2):
        for s in tramos(p1):
            for t in tramos(p2):
                largo = solapan(s, t)
                if largo > TOLERANCIA:
                    problemas.append(f'«{id1}» y «{id2}» comparten {largo:.0f} px de tramo cerca de {s[0]}')
        if hacia1 == hacia2:
            (x1, y1), (x2, y2) = p1[-1], p2[-1]
            distancia = ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5
            if distancia < MINIMO:
                problemas.append(f'«{id1}» y «{id2}» llegan a «{hacia1}» a {distancia:.0f} px una de otra')
    return len(rels), problemas


hubo = False
for ruta in sys.argv[1:]:
    total, problemas = revisar(ruta)
    print(f'{ruta}: {total} flechas, {len(problemas)} problemas')
    for p in problemas:
        print('  -', p)
    hubo |= bool(problemas)
sys.exit(1 if hubo else 0)
