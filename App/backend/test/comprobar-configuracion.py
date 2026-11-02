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
    pagos = servicios['pagos']
    assert pagos['environment']['POSTGRES_BD_PAGOS'] == 'pagos'
    assert not any(v['target'].endswith('jwt-privada.pem') for v in pagos['volumes'])
    if not registro:
        assert pagos['build']['context'].endswith('/App/backend')
        assert pagos['build']['dockerfile'] == 'Dockerfile.pagos'
    if remoto:
        assert pagos['environment']['POSTGRES_HOST'] == '192.0.2.10'
        assert not pagos.get('depends_on')
    boleteria = servicios['boleteria']
    bv = boleteria['environment']
    for key,base in {'VENTAS':'entradas_mercado_secundario','CATALOGO':'catalogo','POSTVENTA':'postventa','ACCESO_QR':'acceso_qr'}.items():
        assert bv[f'POSTGRES_BD_{key}'] == base
    assert bv['PAGOS_URL'] == 'http://pagos:3008/api/v1'
    assert not any(v['target'].endswith('jwt-privada.pem') for v in boleteria['volumes'])
    assert 'boleteria' in servicios['api-gateway']['depends_on']
    if remoto:
        assert bv['POSTGRES_HOST'] == bv['REDIS_HOST'] == '192.0.2.10'
        assert set(boleteria['depends_on']) == {'pagos'}
    nucleo = servicios['nucleo']
    variables = nucleo['environment']
    assert variables['POSTGRES_BD_ADMINISTRACION'] == 'administracion'
    assert variables['POSTGRES_BD_PEDIDOS'] == 'pedidos'
    assert variables['DB_NAME'] == 'eventos_emergencias'
    assert variables['PAGOS_URL'] == 'http://pagos:3008/api/v1'
    assert 'nucleo' in servicios['api-gateway']['depends_on']
    if remoto:
        assert variables['POSTGRES_HOST'] == variables['DB_HOST'] == variables['REDIS_HOST'] == '192.0.2.10'
        assert str(variables['REDIS_PUERTO']) == '6380'
        assert '192.0.2.10' in variables['RABBITMQ_URL']
        assert '192.0.2.10' in variables['CORREO_PROVEEDOR_URL']
        assert set(nucleo['depends_on']) == {'pagos'}
        for servicio in servicios.values():
            assert not set(servicio.get('depends_on', {})).intersection(
                {'postgres', 'redis', 'rabbitmq', 'correo', 'pasarela'})
    if escalado:
        assert not nucleo.get('ports') and not servicios['boleteria'].get('ports')
    if registro:
        assert all('build' not in servicio for servicio in servicios.values())
        assert all(servicio.get('image') for servicio in servicios.values())
        volumenes = servicios['api-gateway']['volumes']
        assert len(volumenes) == 1 and volumenes[0]['target'] == '/etc/nginx/claves/jwt-publica.pem'
    resultados.append({'configuracion': nombre, 'servicios': len(servicios), 'resultado': 'aprobado'})

# Los dominios no importan reglas, repositorios o entidades internas del otro.
modulos = ['identidad', 'alimentos', 'personal-logistica', 'entradas', 'finanzas']
for modulo in modulos:
    for archivo in Path(f'App/backend/modulos/{modulo}').rglob('*.ts'):
        for importacion in re.findall(r"from ['\"]([^'\"]+)['\"]", archivo.read_text()):
            if importacion.startswith('.'):
                destino = (archivo.parent / importacion).resolve()
                for otro in set(modulos) - {modulo}:
                    if otro == 'finanzas' and destino == Path('App/backend/modulos/finanzas/pagos').resolve():
                        continue  # API pública preparada; en este hito los clientes siguen usando HTTP.
                    assert not destino.is_relative_to(Path(f'App/backend/modulos/{otro}').resolve()), (archivo, importacion)

print(json.dumps(resultados, indent=2))
for archivo in Path('App/backend/modulos/finanzas/pagos').rglob('*.ts'):
    for importacion in re.findall(r"from ['\"]([^'\"]+)['\"]", archivo.read_text()):
        if importacion.startswith('.'):
            destino = (archivo.parent / importacion).resolve()
            assert not destino.is_relative_to(Path('App/backend/apps').resolve()), (archivo, importacion)
print('Configuración resuelta y fronteras entre cinco módulos: aprobadas')
