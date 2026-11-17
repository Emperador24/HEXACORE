import importlib.util
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(pathlib.Path(__file__).parent))
from ensayo import guardas, detener

class Guardas(unittest.TestCase):
    def test_capacidad_insuficiente_no_se_fuerza(self):
        with self.assertRaisesRegex(ValueError,'6144'): guardas({'MemTotal':2912*1024**2},20*1024**3,[])
    def test_disco_insuficiente(self):
        with self.assertRaisesRegex(ValueError,'12 GiB'): guardas({'MemTotal':8*1024**3},11*1024**3,[])
    def test_puerto_ajeno_no_se_libera(self):
        with self.assertRaisesRegex(ValueError,'Puertos ocupados'): guardas({'MemTotal':8*1024**3},20*1024**3,[8080])
    def test_no_detiene_proyecto_ajeno(self):
        with patch('ensayo.ejecutar') as ejecutar:
            with self.assertRaises(ValueError): detener({'proyecto':'redash','idsIniciales':[]})
            ejecutar.assert_not_called()
    def test_no_detiene_ids_previos(self):
        with patch('ensayo.ids',return_value=['original']),patch('ensayo.ejecutar') as ejecutar:
            with self.assertRaises(ValueError): detener({'proyecto':'hexacore-atributos-0123456789','idsIniciales':['original']})
            ejecutar.assert_not_called()
    def test_capacidad_suficiente(self): guardas({'MemTotal':8*1024**3},20*1024**3,[])

if __name__=='__main__': unittest.main()
