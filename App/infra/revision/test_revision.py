"""Guardas del entorno de revisión: config real; sin crear/modificar recursos."""
import copy
import json
import os
import socket
import subprocess
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import revision as r


class SeguridadRevision(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads(r.compose('config', '--format', 'json', capturar=True))

    def test_configuracion_resuelta_y_variables_host_ignoradas(self):
        with patch.dict(os.environ, {'HOST_POSTGRES': 'habitual', 'POSTGRES_BD': 'referencia_a',
                                     'HOST_RABBIT': 'habitual', 'COMPOSE_PROJECT_NAME': 'ajeno'}):
            c = json.loads(r.compose('config', '--format', 'json', capturar=True))
        r.validar_configuracion(c)
        self.assertEqual(c['name'], r.PROYECTO)
        self.assertEqual(c['services']['nucleo']['environment']['POSTGRES_BD'], r.BASE)
        self.assertFalse(c['services']['preparacion-base'].get('build'))

    def test_perfil_cu015_tiene_destinos_puertos_claves_y_recursos_propios(self):
        c = json.loads(subprocess.check_output(['python3', str(r.CARPETA / 'revision.py'),
                        '--perfil', 'cu015', 'config'], text=True))
        self.assertEqual(c['name'], 'hexacore-cu015-sebastian')
        self.assertEqual(c['services']['nucleo']['environment']['POSTGRES_BD'], 'hexacore_cu015')
        puertos = {int(p['published']) for s in c['services'].values() for p in s.get('ports', [])}
        self.assertFalse(puertos & r.PUERTOS)
        for tipo in ('volumes', 'networks'):
            for recurso in c[tipo].values():
                self.assertTrue(recurso['name'].startswith('hexacore-cu015-sebastian-'))
        for v in c['services']['nucleo']['volumes']:
            if 'jwt-' in v['source']:
                self.assertIn('.estado-cu015/', v['source'])

    def test_config_detached_no_autoriza_operaciones_del_entorno(self):
        with patch.object(r, 'PERFIL', 'cu015'):
            for rama in ('', 'develop', 'feature/otra'):
                with self.subTest(rama=rama), patch.object(r, 'git', return_value=rama):
                    r.validar_rama('config')
                    for accion in ('iniciar', 'parar', 'estado', 'logs'):
                        with self.assertRaisesRegex(RuntimeError, 'feature/sebastian'):
                            r.validar_rama(accion)
            with patch.object(r, 'git', return_value='feature/sebastian'):
                r.validar_rama('iniciar')
                r.validar_rama('parar')

    def test_sondas_http_conservan_intervalos_y_esperas(self):
        for nombre in ('nucleo', 'boleteria', 'trabajador'):
            s = self.config['services'][nombre]
            h = s['healthcheck']
            self.assertEqual(h['test'], ['CMD', 'sh', '/revision/sonda-salud.sh'])
            self.assertEqual((h['interval'], h['timeout'], h['retries']), ('10s', '5s', 10))
            montaje = next(v for v in s['volumes'] if v['target'] == '/revision/sonda-salud.sh')
            self.assertTrue(montaje['read_only'])
            self.assertEqual(Path(montaje['source']).parent, r.ESTADO)

    def test_rechaza_destinos_y_montajes_ajenos(self):
        for cambiar in [
            lambda c: c['services']['boleteria']['environment'].update(POSTGRES_BD='referencia_b'),
            lambda c: c['services']['trabajador']['environment'].update(RABBITMQ_URL='amqp://habitual'),
            lambda c: c['services']['nucleo']['volumes'].append({'type': 'bind', 'source': '/tmp/referencia_a'}),
            lambda c: c['volumes']['postgres-datos'].update(external=True),
        ]:
            c = copy.deepcopy(self.config)
            cambiar(c)
            with self.assertRaises(RuntimeError):
                r.validar_configuracion(c)

    def test_puerto_ocupado_aborta_antes_de_crear_archivos_o_compilar(self):
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            with patch.object(r, 'PUERTOS', {s.getsockname()[1]}), \
                 patch.object(r, 'contenedores_propios', return_value=[]), \
                 patch.object(r, 'archivos') as archivos, patch.object(r, 'compose') as compose:
                with self.assertRaisesRegex(RuntimeError, 'ocupado'):
                    r.iniciar(False)
                archivos.assert_not_called()
                compose.assert_not_called()

    def test_volumen_de_otro_checkout_rechazado(self):
        with patch.object(r, 'inspeccionar', return_value={'Labels': {'hexacore.checkout': 'otro'}}):
            with self.assertRaisesRegex(RuntimeError, 'otro checkout'):
                r.comprobar_recursos(self.config, [])

    def test_no_carga_demo_con_escritores_activos(self):
        c = {'State': {'Running': True}, 'Config': {'Labels': {'com.docker.compose.service': 'nucleo'}}}
        with patch.object(r, 'contenedores_propios', return_value=[c]), \
             patch.object(r, 'comprobar_puertos'), patch.object(r, 'archivos') as archivos:
            with self.assertRaisesRegex(RuntimeError, 'escritores detenidos'):
                r.iniciar(True)
            archivos.assert_not_called()

    def test_demo_completa_o_interrumpida_nunca_se_repite(self):
        for estado in ('COMPLETA', 'EN_CURSO'):
            with patch.object(r, 'estado_demo', return_value=estado), patch.object(r, 'sql') as sql:
                with self.assertRaisesRegex(RuntimeError, 'no se repite'):
                    r.sembrar()
                sql.assert_not_called()

    def test_base_ocupada_no_se_trunca(self):
        with patch.object(r, 'sql', return_value='0\n1\n0') as sql, patch.object(r, 'compose') as compose:
            with self.assertRaisesRegex(RuntimeError, 'ocupada'):
                r.verificar_vacia()
            self.assertEqual(sql.call_count, 1)
            self.assertNotIn('TRUNCATE', sql.call_args.args[0])
            compose.assert_not_called()

    def test_carga_interrumpida_impide_arrancar_escritores(self):
        with patch.object(r, 'contenedores_propios', return_value=[]), \
             patch.object(r, 'comprobar_puertos'), patch.object(r, 'archivos'), \
             patch.object(r, 'estado_demo', return_value='EN_CURSO'), patch.object(r, 'compose') as compose:
            with self.assertRaisesRegex(RuntimeError, 'interrumpida'):
                r.iniciar(False)
            ups = [c.args for c in compose.call_args_list if c.args[0] == 'up']
            self.assertEqual(len(ups), 2)
            self.assertNotIn('nucleo', ups[0])
            self.assertNotIn('--wait', ups[1])

    def test_preparacion_se_espera_por_salida_antes_de_aplicaciones(self):
        with patch.object(r, 'contenedores_propios', return_value=[]), \
             patch.object(r, 'comprobar_puertos'), patch.object(r, 'archivos'), \
             patch.object(r, 'estado_demo', return_value='COMPLETA'), patch.object(r, 'compose') as compose:
            r.iniciar(False)
            ups = [c.args for c in compose.call_args_list if c.args[0] == 'up']
            self.assertEqual(len(ups), 3)
            self.assertNotIn('preparacion-base', ups[0])
            self.assertIn('--exit-code-from', ups[1])
            self.assertNotIn('--wait', ups[1])
            self.assertIn('--no-deps', ups[2])
            self.assertEqual(list(ups[2][-6:]), r.EJECUTAR)


    def test_cierre_sigterm_de_nest_aceptado_y_sigkill_rechazado(self):
        c = {'Name': 'nucleo', 'Config': {'Labels': {'com.docker.compose.service': 'nucleo'}},
             'State': {'ExitCode': 143, 'OOMKilled': False}}
        r.comprobar_cierre([c])
        c['State']['ExitCode'] = 137
        with self.assertRaisesRegex(RuntimeError, 'Cierre incompleto'):
            r.comprobar_cierre([c])
        c['State'].update(ExitCode=0, OOMKilled=True)
        with self.assertRaisesRegex(RuntimeError, 'Cierre incompleto'):
            r.comprobar_cierre([c])


class SondaHttp(unittest.TestCase):
    def test_un_get_sin_reintentos_y_solo_http_200(self):
        casos = [
            ('HTTP/1.1 200 OK', 0, 0),
            ('HTTP/2 200', 0, 0),
            ('HTTP/1.1 100 Continue\nHTTP/1.1 200 OK', 0, 0),
            ('HTTP/1.1 201 Created', 0, 1),
            ('HTTP/1.1 302 Found\nHTTP/1.1 200 OK', 0, 1),
            ('HTTP/1.1 503 Service Unavailable', 1, 1),
            ('Connection refused', 1, 1),
            ('HTTP/1.1 200 OK', 1, 1),
        ]
        with tempfile.TemporaryDirectory() as carpeta:
            d = Path(carpeta)
            wget = d / 'wget'
            wget.write_text('#!/bin/sh\nprintf x >> "$SONDA_CONTADOR"\n'
                            'printf "%s\\n" "$*" > "$SONDA_ARGUMENTOS"\n'
                            'printf "%s\\n" "$SONDA_RESPUESTA" >&2\nexit "$SONDA_SALIDA"\n')
            wget.chmod(0o755)
            for respuesta, salida_wget, esperada in casos:
                with self.subTest(respuesta=respuesta, salida=salida_wget):
                    contador = d / 'contador'
                    contador.write_text('')
                    e = {**os.environ, 'PATH': str(d) + os.pathsep + os.defpath,
                         'PUERTO': '3002', 'SONDA_CONTADOR': str(contador),
                         'SONDA_ARGUMENTOS': str(d / 'argumentos'),
                         'SONDA_RESPUESTA': respuesta, 'SONDA_SALIDA': str(salida_wget)}
                    p = subprocess.run(['sh', str(r.CARPETA / 'sonda-salud.sh')], env=e, capture_output=True)
                    self.assertEqual(p.returncode, esperada)
                    self.assertEqual(contador.read_text(), 'x')
                    self.assertEqual((d / 'argumentos').read_text().strip(),
                                     '-T 5 -S -O /dev/null http://127.0.0.1:3002/api/v1/salud')
                    self.assertEqual(p.stdout + p.stderr, b'')


if __name__ == '__main__':
    unittest.main()
