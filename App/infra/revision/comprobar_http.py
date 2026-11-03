"""Smoke HTTP exclusivo de revisión. No acredita navegación de los portales."""
import json
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import revision as r

API = 'http://127.0.0.1:18090/api/v1'


def pedir(ruta, metodo='GET', cuerpo=None, token=None, origen=None, base=API):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if origen:
        headers['Origin'] = origen
    req = Request(base + ruta, method=metodo, headers=headers,
                  data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    try:
        respuesta = urlopen(req, timeout=20)
    except HTTPError as e:
        respuesta = e
    texto = respuesta.read().decode()
    return respuesta.status, respuesta.headers, json.loads(texto) if texto.startswith(('{', '[')) else texto


class RevisionHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        c = json.loads(r.compose('config', '--format', 'json', capturar=True))
        r.validar_configuracion(c)
        r.comprobar_recursos(c, r.contenedores_propios())
        if r.estado_demo() != 'COMPLETA':
            raise RuntimeError('Primero iniciar --datos-demo; no se omiten las pruebas')

    def entrar(self, email):
        estado, _, cuerpo = pedir('/sesiones', 'POST', {'email': email, 'contrasena': 'hexacore2026'})
        self.assertIn(estado, [200, 201], cuerpo)
        self.assertTrue(cuerpo.get('token'))
        return cuerpo['token']

    def test_salud_tres_programas_y_gateway(self):
        for puerto in (13119, 13127, 13120):
            estado, _, cuerpo = pedir('/salud', base=f'http://127.0.0.1:{puerto}/api/v1')
            self.assertEqual(estado, 200)
            self.assertEqual(cuerpo['estado'], 'arriba', cuerpo)
        self.assertEqual(pedir('/salud', base='http://127.0.0.1:18090')[0], 200)

    def test_cors_portales_y_rechazo_otro_origen(self):
        for puerto in (14210, 14211):
            origen = f'http://revision.localhost:{puerto}'
            estado, h, _ = pedir('/sesiones', 'OPTIONS', origen=origen)
            self.assertEqual(estado, 204)
            self.assertEqual(h.get('Access-Control-Allow-Origin'), origen)
            self.assertEqual(h.get('Access-Control-Allow-Credentials'), 'true')
        _, h, _ = pedir('/sesiones', 'OPTIONS', origen='http://localhost:4200')
        self.assertIsNone(h.get('Access-Control-Allow-Origin'))

    def test_cliente_perfil_y_cierre_revocado(self):
        t = self.entrar('cliente@hexacore.com')
        estado, _, perfil = pedir('/cuentas/perfil', token=t)
        self.assertEqual(estado, 200)
        self.assertEqual(perfil['email'], 'cliente@hexacore.com')
        self.assertIn(pedir('/sesiones/actual', 'DELETE', token=t)[0], [200, 204])
        self.assertEqual(pedir('/cuentas/perfil', token=t)[0], 401)

    def test_admin_cuentas_y_restriccion_cliente(self):
        t = self.entrar('admin@hexacore.com')
        self.assertEqual(pedir('/admin/cuentas', token=t)[0], 200)
        self.assertEqual(pedir('/admin/cuentas', token=self.entrar('bruno@hexacore.com'))[0], 403)

    def test_personal_alcance_propio(self):
        t = self.entrar('personal@hexacore.com')
        estado, _, empleado = pedir('/logistica/empleados/yo', token=t)
        self.assertEqual(estado, 200)
        self.assertEqual(empleado['empleado']['credencial'], 'personal@hexacore.com')
        self.assertEqual(empleado['turnoVigente']['empleadoId'], empleado['empleado']['id'])

    def test_cartelera_y_establecimientos_reales(self):
        self.assertEqual(pedir('/cartelera/e0000001-0000-4000-8000-000000000001')[0], 200)
        t = self.entrar('bruno@hexacore.com')
        estado, _, establecimientos = pedir('/pedidos/eventos/e0000001-0000-4000-8000-000000000001/establecimientos', token=t)
        self.assertEqual(estado, 200)
        self.assertEqual(len(establecimientos), 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
