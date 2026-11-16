"""
Limpieza de Redis para las suites del CU-006.

Antes se hacía `FLUSHALL`. Dejó de ser aceptable cuando Redis pasó a guardar
también las sesiones revocadas que publica el Servicio de Administración
(ADR-03): vaciarlo entero **reabría sesiones cerradas** en toda la reventa. Así
que solo se borra lo que es de este servicio, las claves `reventa:*`.
"""

import subprocess

_BORRAR_POR_PATRON = "for _, k in ipairs(redis.call('KEYS', ARGV[1])) do redis.call('DEL', k) end return 1"


def limpiar_reventa():
    subprocess.run(['redis-cli', '-p', '6380', 'EVAL', _BORRAR_POR_PATRON, '0', 'reventa:*'],
                   capture_output=True, check=True)
