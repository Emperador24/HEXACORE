import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock,patch

import montaje
from comun import LABEL,escribir,json_bytes


class GuardasRecursos(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.m=object.__new__(montaje.Montaje);self.m.d=Path(self.tmp.name)
        self.m.c=dict(rol='B');self.m.m=dict(proyecto='hxc-zt-prueba-b',propietario='propio',checkout='checkout',fuente='a'*40)
        self.m.cfg=dict(services={'nucleo':{},'boleteria':{}},volumes={},networks={})
        self.m.compose=Mock()

    def test_parada_rechaza_contenedor_ajeno(self):
        ajeno={'Config':{'Labels':{'com.docker.compose.service':'nucleo',LABEL:'ajeno'}}}
        self.m.contenedores=Mock(return_value=[ajeno])
        with self.assertRaises(ValueError):self.m.parar()
        self.m.compose.assert_not_called()

    def test_parada_rechaza_volumen_ajeno(self):
        self.m.contenedores=Mock(return_value=[])
        self.m.cfg['volumes']={'datos':{'name':'hxc-zt-prueba-b-datos'}}
        def ejecutar(args,**_):
            if args[1:3]==['volume','ls']:return 'hxc-zt-prueba-b-datos\n'
            if args[1:3]==['volume','inspect']:return json.dumps([{'Labels':{LABEL:'ajeno'}}])
            return ''
        with patch.object(montaje,'ejecutar',side_effect=ejecutar),self.assertRaises(ValueError):self.m.parar()
        self.m.compose.assert_not_called()

    def test_parada_solo_stop_nunca_down_ni_volumenes(self):
        self.m.recursos=Mock(return_value=[]);self.m.parar()
        self.assertEqual(self.m.compose.call_args.args,('stop','--timeout','30','boleteria','nucleo'))

    def test_b_preparar_se_rechaza_antes_de_docker(self):
        self.m.previo=Mock()
        with self.assertRaises(ValueError):self.m.preparar()
        self.m.previo.assert_not_called();self.m.compose.assert_not_called()

    def test_b_no_arranca_dependencias_ni_sql(self):
        self.m.previo=Mock();self.m.imagenes=Mock();self.m.sonda=Mock()
        self.m.iniciar()
        self.assertEqual(self.m.compose.call_args.args,('up','-d','--wait','--no-deps','--no-build','nucleo','boleteria'))

    def test_sonda_fallida_impide_arranque(self):
        self.m.previo=Mock();self.m.imagenes=Mock();self.m.sonda=Mock(side_effect=RuntimeError('sin proveedores'))
        with self.assertRaises(RuntimeError):self.m.iniciar()
        self.m.compose.assert_not_called()

    def test_preparacion_ya_registrada_no_repite_sql(self):
        self.m.c['rol']='A';self.m.previo=Mock();self.m.imagenes=Mock()
        escribir(self.m.d/'preparada.json',json_bytes({'fuente':'a'*40}))
        self.assertIn('no se repite',self.m.preparar());self.m.compose.assert_not_called()

    def test_no_prepara_con_apps_ya_corriendo(self):
        self.m.c['rol']='A';self.m.previo=Mock();self.m.imagenes=Mock()
        self.m.recursos=Mock(return_value=[{'State':{'Running':True},'Config':{'Labels':{'com.docker.compose.service':'nucleo'}}}])
        with self.assertRaises(ValueError):self.m.preparar(True)
        self.m.compose.assert_not_called()

    def test_operacion_concurrente_no_se_adelanta(self):
        with self.m.bloqueo():
            with self.assertRaises(FileExistsError):
                with self.m.bloqueo():pass
        self.assertFalse((self.m.d/'operacion.lock').exists())

    def test_capacidad_insuficiente_no_consulta_ni_detiene_proyectos(self):
        with patch.object(montaje,'ejecutar',return_value=json.dumps({'MemTotal':2912*1048576})) as cmd,self.assertRaises(ValueError):
            self.m.capacidad()
        self.assertEqual(cmd.call_count,1);self.m.compose.assert_not_called()

    def test_bloqueo_de_fuente_sucia_antes_de_operar(self):
        with patch.object(montaje,'limpio',side_effect=ValueError('trabajo local')),self.assertRaises(ValueError):self.m.previo()
        self.m.compose.assert_not_called()


if __name__=='__main__':unittest.main()
