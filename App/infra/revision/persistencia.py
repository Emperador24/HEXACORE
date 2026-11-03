"""Referencia privada de revisión antes/después de parar: solo huellas y conteos."""
import argparse
import json
import revision as r

TABLAS = ['identidad.usuarios', 'alimentos.pedidos', 'alimentos.detalles_pedido',
          'alimentos.productos', 'alimentos.transacciones_pedido', 'entradas_ventas.compras',
          'entradas_ventas.entradas', 'entradas_ventas.historial_propietarios',
          'finanzas_pagos.transacciones_pago', 'personal_logistica.empleados',
          'personal_logistica.turnos', 'migracion_control.procedencia', 'migracion_control.revision_demo']


def referencia():
    consultas = [f"SELECT jsonb_build_object('tabla','{t}','cantidad',count(*),'huella',"
                 f"md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'))) FROM {t} t;"
                 for t in TABLAS]
    datos = r.sql('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n' +
                  '\n'.join(consultas) + '\nCOMMIT;')
    return [json.loads(linea) for linea in datos.splitlines() if linea.startswith('{')]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('accion', choices=['guardar', 'comparar'])
    a = p.parse_args()
    c = json.loads(r.compose('config', '--format', 'json', capturar=True))
    r.validar_configuracion(c)
    r.comprobar_recursos(c, r.contenedores_propios())
    actual = referencia()
    r.exigir(len(actual) == len(TABLAS), 'Referencia incompleta')
    # Se necesitan operaciones revisadas, no solo tablas vacías.
    for t in ('alimentos.pedidos', 'entradas_ventas.compras', 'finanzas_pagos.transacciones_pago'):
        r.exigir(next(f['cantidad'] for f in actual if f['tabla'] == t) > 0, 'Falta operación de prueba: ' + t)
    ruta = r.ESTADO / 'persistencia.json'
    if a.accion == 'guardar':
        r.exigir(not ruta.exists(), 'Ya existe referencia: conservarla o moverla explícitamente antes de capturar otra')
        ruta.write_text(json.dumps(actual, indent=2) + '\n')
        print('Referencia guardada: 13 tablas, solo huellas y conteos; no ejecutar compras/login hasta comparar')
    else:
        r.exigir(actual == json.loads(ruta.read_text()), 'Diferencias después de reinicio; se conservan ambas evidencias')
        print('Persistencia comprobada: 13/13 tablas idénticas, incluidas compras, QR, libro y procedencia')


if __name__ == '__main__':
    main()
