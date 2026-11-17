import importlib.util
import json
import pathlib
import tempfile
import unittest
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

if __name__=='__main__': unittest.main()
