import importlib.util
import json
import pathlib
import tempfile
import unittest
import io
import contextlib
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pipeline', pathlib.Path(__file__).with_name('pipeline.py'))
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)

class Informe(unittest.TestCase):
    def test_conserva_todas_las_severidades_sin_credenciales(self):
        alertas = [{'pluginId':'10038', 'risk':r, 'confidence':'Medium', 'method':'GET',
                    'url':'https://ejemplo.test/perfil/SECRETO?token=SECRETO', 'evidence':'SECRETO', 'description':'<script>SECRETO</script>'}
                   for r in p.RIESGOS]
        saneadas=p.sanear_alertas(alertas, {'api':'https://ejemplo.test'})
        self.assertEqual(len(saneadas),4)
        self.assertEqual([a['riesgo'] for a in saneadas],p.RIESGOS)
        self.assertNotIn('SECRETO',json.dumps(saneadas))
        self.assertNotIn('Critical',p.RIESGOS)

    def test_no_acepta_severidad_inventada(self):
        with self.assertRaises(ValueError): p.sanear_alertas([{'pluginId':'1','risk':'Critical'}],{})

    def test_error_version_deja_reporte_y_no_arranca_zap(self):
        with tempfile.TemporaryDirectory() as d, patch.object(p,'ejecutar') as ejecutar, patch.object(p,'revision',side_effect=ValueError('VERSION_DESPLEGADA_NO_COINCIDE')):
            cfg={'revision':'a'*40,'tipoDespliegue':'ci-efimero','destinos':{'api':'http://localhost'},'tokens':{'cliente':'SECRETO'}}
            self.assertEqual(p.escanear(cfg,pathlib.Path(d),pathlib.Path(d)/'privado'),1)
            ejecutar.assert_not_called()
            r=json.loads((pathlib.Path(d)/'owasp.json').read_text())
            self.assertEqual(r['estado'],'incompleto')
            self.assertEqual(r['error'],'VERSION_DESPLEGADA_NO_COINCIDE')
            self.assertNotIn('SECRETO',(pathlib.Path(d)/'owasp.html').read_text())

    def test_certificado_invalido_no_se_omite(self):
        with tempfile.TemporaryDirectory() as d, patch.object(p.urllib.request,'urlopen',side_effect=OSError('SECRETO')):
            cfg={'revision':'a'*40,'tipoDespliegue':'presentacion','destinos':{'api':'https://ejemplo.test'},'tokens':{'cliente':'SECRETO'}}
            self.assertEqual(p.escanear(cfg,pathlib.Path(d),pathlib.Path(d)/'privado'),1)
            self.assertNotIn('SECRETO',(pathlib.Path(d)/'owasp.json').read_text())

class VersionDesplegada(unittest.TestCase):
    def modulo(self):
        spec=importlib.util.spec_from_file_location('version',p.ROOT/'App/infra/verificar-version.py')
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

    def probar(self, revision='a'*40, falta=False):
        m=self.modulo();llamadas=[]
        def respuesta(args,**kw):
            llamadas.append(args)
            if 'inspect' in args:
                return json.dumps([{'Config':{'Labels':{'org.opencontainers.image.revision':revision}},'State':{'Running':True},'Image':'sha256:ensayo'}])
            return '' if falta else 'contenedor-ensayo'
        with patch.object(m.sys,'argv',['verificar-version.py','a'*40]),patch.object(m.subprocess,'check_output',side_effect=respuesta),contextlib.redirect_stdout(io.StringIO()):
            m.main()
        self.assertEqual(len(llamadas),16)
        self.assertTrue(all('ps' in x or 'inspect' in x for x in llamadas))

    def test_ocho_aplicaciones_misma_revision_solo_lectura(self):self.probar()
    def test_revision_divergente_no_acredita_despliegue(self):
        with self.assertRaises(ValueError):self.probar(revision='b'*40)
    def test_aplicacion_ausente_no_acredita_despliegue(self):
        with self.assertRaises(ValueError):self.probar(falta=True)

class SesionEnsayo(unittest.TestCase):
    def test_https_login_nuevo_sin_publicar_secretos(self):
        respuesta=unittest.mock.MagicMock();respuesta.status=200
        respuesta.read.return_value=b'{"token":"cabecera.payload.firma"}'
        opener=unittest.mock.MagicMock();opener.open.return_value.__enter__.return_value=respuesta
        with patch.object(p.urllib.request,'build_opener',return_value=opener),contextlib.redirect_stdout(io.StringIO()) as salida:
            self.assertEqual(p.sesion_cliente('https://api.example.test',{'email':'ensayo@example.test','contrasena':'SECRETO'}),'cabecera.payload.firma')
            self.assertEqual(salida.getvalue(),'')
        req=opener.open.call_args.args[0]
        self.assertEqual(req.method,'POST');self.assertEqual(req.full_url,'https://api.example.test/api/v1/sesiones')
        self.assertEqual(json.loads(req.data)['email'],'ensayo@example.test')

    def test_http_se_rechaza_antes_de_enviar_credenciales(self):
        with patch.object(p.urllib.request,'build_opener') as abrir:
            with self.assertRaisesRegex(ValueError,'DESTINO_INVALIDO'):
                p.sesion_cliente('http://api.example.test',{'email':'ensayo@example.test','contrasena':'SECRETO'})
            abrir.assert_not_called()

    def test_error_no_expone_cuerpo_y_no_sigue_redireccion(self):
        opener=unittest.mock.MagicMock();opener.open.side_effect=OSError('SECRETO')
        with patch.object(p.urllib.request,'build_opener',return_value=opener):
            with self.assertRaisesRegex(ValueError,'^SESION_DE_ENSAYO_NO_OBTENIDA$'):
                p.sesion_cliente('https://api.example.test',{'email':'ensayo@example.test','contrasena':'SECRETO'})
            self.assertEqual(opener.open.call_count,1)
        self.assertIsNone(p.SinRedireccion().redirect_request(None,None,302,'',{},'https://otro.example.test'))

if __name__=='__main__': unittest.main()
