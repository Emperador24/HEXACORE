"""Valida Compose resuelto y fronteras sin crear recursos ni conectar a datos."""
from pathlib import Path
import itertools
import json
import os
import re
import subprocess

os.chdir(Path(__file__).resolve().parents[3])
resultados = []
for remoto, escalado, registro in itertools.product([False, True], repeat=3):
    nombre = 'base'
    comando = ['docker', 'compose', '-f', 'App/infra/docker-compose.yml']
    for activo, archivo in [(remoto, 'remoto'), (escalado, 'escalado'), (registro, 'registro')]:
        if activo:
            nombre += f'-{archivo}'
            comando += ['-f', f'App/infra/docker-compose.{archivo}.yml']
    comando += ['--profile', 'servicios']
    entorno = os.environ.copy()
    if remoto:
        entorno.update({k: '192.0.2.10' for k in
                        ['HOST_POSTGRES', 'HOST_REDIS', 'HOST_RABBIT', 'HOST_CORREO', 'HOST_PASARELA']})
        entorno['PUERTO_REDIS'] = '6380'
    subprocess.run(comando + ['config', '-q'], check=True, env=entorno)
    configuracion = json.loads(subprocess.check_output(
        comando + ['config', '--format', 'json'], env=entorno, text=True))
    servicios = configuracion['services']
    assert 'nucleo' in servicios and 'autenticacion' not in servicios and 'alimentos' not in servicios and 'eventos-emergencias' not in servicios
    assert len(servicios) == (7 if remoto else 12), (nombre, len(servicios))
    assert 'boleteria' in servicios
    assert not set(servicios).intersection({'ventas','catalogo','cola-virtual','postventa','acceso-qr'})
    assert 'pagos' not in servicios
    migracion = servicios['preparacion-base']
    assert migracion['environment']['POSTGRES_BD'] == 'hexacore'
    assert not any(k.startswith(('REDIS_', 'AUTH_JWT_', 'PAGOS_', 'RABBITMQ_')) for k in migracion['environment'])
    assert not migracion.get('ports')
    assert migracion['restart'] == 'no'
    assert 'dist/compartido/persistencia/preparar-base.js' in migracion['command']
    if not registro:
        assert migracion['build']['context'].endswith('/App/backend')
    if remoto:
        assert migracion['environment']['POSTGRES_HOST'] == '192.0.2.10'
        assert not migracion.get('depends_on')
    assert 'notificaciones' not in servicios and 'trabajador' in servicios
    trabajador = servicios['trabajador']
    assert not trabajador.get('volumes')
    assert not any(k.startswith(('POSTGRES_', 'DB_', 'REDIS_', 'PAGOS_', 'AUTH_JWT_')) for k in trabajador['environment'])
    assert set(trabajador.get('depends_on', {})) == (set() if remoto else {'rabbitmq', 'correo'})
    if not registro:
        assert trabajador['build']['context'].endswith('/App/backend')
        assert trabajador['build']['dockerfile'] == 'Dockerfile.trabajador'
    if remoto:
        assert '192.0.2.10' in trabajador['environment']['RABBITMQ_URL']
        assert '192.0.2.10' in trabajador['environment']['CORREO_PROVEEDOR_URL']
    boleteria = servicios['boleteria']
    bv = boleteria['environment']
    assert bv['POSTGRES_BD'] == 'hexacore'
    assert not any(k.startswith('POSTGRES_BD_') or k.startswith('DB_') for k in bv)
    assert 'PASARELA_SECRETO_WEBHOOK' not in bv
    assert 'AUTH_JWT_CLAVE_PRIVADA_ARCHIVO' not in bv
    assert 'PAGOS_URL' not in bv
    assert boleteria['depends_on']['preparacion-base']['condition'] == 'service_completed_successfully'
    assert not any(v['target'].endswith('jwt-privada.pem') for v in boleteria['volumes'])
    assert 'boleteria' in servicios['api-gateway']['depends_on']
    if remoto:
        assert bv['POSTGRES_HOST'] == bv['REDIS_HOST'] == '192.0.2.10'
        assert set(boleteria['depends_on']) == {'preparacion-base'}
    nucleo = servicios['nucleo']
    variables = nucleo['environment']
    assert variables['POSTGRES_BD'] == bv['POSTGRES_BD']
    assert not any(k.startswith('POSTGRES_BD_') or k.startswith('DB_') for k in variables)
    assert variables['POSTGRES_HOST'] == bv['POSTGRES_HOST']
    assert variables['POSTGRES_PUERTO'] == bv['POSTGRES_PUERTO']
    assert variables['POSTGRES_USUARIO'] == bv['POSTGRES_USUARIO']
    assert variables['POSTGRES_CONTRASENA'] == bv['POSTGRES_CONTRASENA']
    for clave in ['POSTGRES_HOST', 'POSTGRES_PUERTO', 'POSTGRES_USUARIO', 'POSTGRES_CONTRASENA', 'POSTGRES_BD']:
        assert migracion['environment'][clave] == variables[clave]
    assert variables['PAGOS_PROVEEDOR_URL'] == bv['PAGOS_PROVEEDOR_URL']
    assert 'PAGOS_URL' not in variables
    assert variables['PASARELA_SECRETO_WEBHOOK']
    assert nucleo['depends_on']['preparacion-base']['condition'] == 'service_completed_successfully'
    assert 'nucleo' in servicios['api-gateway']['depends_on']
    if remoto:
        assert variables['POSTGRES_HOST'] == variables['REDIS_HOST'] == '192.0.2.10'
        assert str(variables['REDIS_PUERTO']) == '6380'
        assert '192.0.2.10' in variables['RABBITMQ_URL']
        assert '192.0.2.10' in variables['CORREO_PROVEEDOR_URL']
        assert set(nucleo['depends_on']) == {'preparacion-base'}
        for servicio in servicios.values():
            assert not set(servicio.get('depends_on', {})).intersection(
                {'postgres', 'redis', 'rabbitmq', 'correo', 'pasarela'})
    if escalado:
        assert not nucleo.get('ports') and not servicios['boleteria'].get('ports')
    if registro:
        assert all('build' not in servicio for servicio in servicios.values())
        assert all(servicio.get('image') for servicio in servicios.values())
        assert migracion['image'] == nucleo['image']
        volumenes = servicios['api-gateway']['volumes']
        assert len(volumenes) == 1 and volumenes[0]['target'] == '/etc/nginx/claves/jwt-publica.pem'
    resultados.append({'configuracion': nombre, 'servicios': len(servicios), 'resultado': 'aprobado'})

# Los dominios no importan reglas, repositorios o entidades internas del otro.
modulos = ['identidad', 'alimentos', 'personal-logistica', 'entradas', 'finanzas', 'comunicaciones']
for modulo in modulos:
    for archivo in Path(f'App/backend/modulos/{modulo}').rglob('*.ts'):
        for importacion in re.findall(r"from ['\"]([^'\"]+)['\"]", archivo.read_text()):
            if importacion.startswith('.'):
                destino = (archivo.parent / importacion).resolve()
                if modulo == 'alimentos' and destino.is_relative_to(Path('App/backend/modulos/eventos-recintos').resolve()):
                    assert destino == Path('App/backend/modulos/eventos-recintos/consulta-eventos.module').resolve(), (archivo, importacion)
                for otro in set(modulos) - {modulo}:
                    if modulo == 'alimentos' and otro == 'identidad' and destino == Path('App/backend/modulos/identidad/consulta-personal.module').resolve():
                        continue  # API mínima de cuentas existentes para el vínculo local CU-015.
                    if modulo != 'comunicaciones' and otro == 'finanzas' and destino == Path('App/backend/modulos/finanzas/pagos').resolve():
                        continue  # Única API pública financiera; no importar persistencia ajena.
                    assert not destino.is_relative_to(Path(f'App/backend/modulos/{otro}').resolve()), (archivo, importacion)

print(json.dumps(resultados, indent=2))
for archivo in Path('App/backend/modulos/finanzas/pagos').rglob('*.ts'):
    for importacion in re.findall(r"from ['\"]([^'\"]+)['\"]", archivo.read_text()):
        if importacion.startswith('.'):
            destino = (archivo.parent / importacion).resolve()
            assert not destino.is_relative_to(Path('App/backend/apps').resolve()), (archivo, importacion)
print('Configuración resuelta y fronteras entre seis módulos: aprobadas')

# El entorno exclusivo también debe compartir un libro, sin recuperar un servidor.
for base, proyecto in [('hexacore_e2e','hexacore-base-unica-e2e'), ('hexacore_vacia_e2e','hexacore-base-vacia-e2e')]:
    entorno = {**os.environ, 'POSTGRES_BD_PRUEBAS': base}
    for imagen in [False, True]:
        comando = ['docker', 'compose', '-p', proyecto, '-f', 'App/backend/test/docker-compose.e2e.yml']
        if imagen:
            comando += ['-f', 'App/backend/test/docker-compose.imagen.yml']
        subprocess.run(comando + ['config', '-q'], check=True, env=entorno)
        prueba = json.loads(subprocess.check_output(comando + ['config', '--format', 'json'], text=True, env=entorno))
        servicios = prueba['services']
        assert 'pagos' not in servicios and len(servicios) == (10 if imagen else 6)
        assert servicios['preparacion-base']['environment']['POSTGRES_BD'] == base
        for servicio in servicios.values():
            assert all(puerto['host_ip'] == '127.0.0.1' for puerto in servicio.get('ports', []))
        if imagen:
            n, b = [servicios[app]['environment'] for app in ['nucleo', 'boleteria']]
            assert n['POSTGRES_BD'] == b['POSTGRES_BD'] == base
            assert not any(k.startswith(('POSTGRES_BD_', 'DB_')) for k in n | b)
            assert 'PASARELA_SECRETO_WEBHOOK' not in b and 'AUTH_JWT_CLAVE_PRIVADA_ARCHIVO' not in b
            assert servicios['pasarela']['environment']['WEBHOOK_URL'] == 'http://nucleo:3002/api/v1/pagos/webhook'
print('Cuatro configuraciones aisladas A/B (recursos e imágenes/gateway): aprobadas')

for imagen in [False, True]:
    comando = ['docker', 'compose', '-p', 'hexacore-trabajador-e2e', '-f', 'App/backend/test/trabajador/docker-compose.yml']
    if imagen:
        comando += ['--profile', 'imagen']
    subprocess.run(comando + ['config', '-q'], check=True)
    cfg = json.loads(subprocess.check_output(comando + ['config', '--format', 'json'], text=True))
    assert len(cfg['services']) == (3 if imagen else 2)
    if imagen:
        t = cfg['services']['trabajador']
        assert set(t['depends_on']) == {'rabbitmq', 'correo'}
        assert not any(k.startswith(('POSTGRES_', 'DB_', 'REDIS_', 'PAGOS_', 'AUTH_JWT_')) for k in t['environment'])
    for t in cfg['services'].values():
        assert all(puerto['host_ip'] == '127.0.0.1' for puerto in t.get('ports', []))
print('Dos configuraciones exclusivas de Trabajador: aprobadas')

comando = ['docker', 'compose', '-p', 'hexacore-consolidacion-e2e', '-f', 'App/backend/test/consolidacion/docker-compose.yml']
subprocess.run(comando + ['config', '-q'], check=True)
cfg = json.loads(subprocess.check_output(comando + ['config', '--format', 'json'], text=True))
assert set(cfg['services']) == {'postgres'}
pg = cfg['services']['postgres']
assert pg['labels']['hexacore.uso'] == 'ensayo-consolidacion'
assert pg['environment']['POSTGRES_DB'] == 'postgres'
assert pg['ports'][0]['host_ip'] == '127.0.0.1' and str(pg['ports'][0]['published']) == '15437'
assert cfg['volumes']['postgres']['name'] == 'hexacore-consolidacion-e2e_postgres'
assert not pg.get('depends_on')
print('Destino exclusivo de consolidación: PostgreSQL aislado, sin aplicaciones ni destinos habituales')
