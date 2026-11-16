import errno
import unittest
from unittest.mock import patch

import equipo


class PuertosSinServicios(unittest.TestCase):
    def test_reserva_y_libera_todos_sin_escucha(self):
        sockets=[]
        class Sonda:
            def __init__(self,*_):self.cerrada=False;sockets.append(self)
            def bind(self,destino):self.destino=destino
            def close(self):self.cerrada=True
        with patch.object(equipo.socket,'socket',Sonda),patch.object(equipo,'ejecutar') as comandos:
            r=equipo.sondear_puertos('10.99.0.1',[8443,25432])
        self.assertTrue(r['todos_enlazables']);self.assertEqual(len(sockets),2)
        self.assertTrue(all(s.cerrada for s in sockets));comandos.assert_not_called()
        self.assertEqual(sockets[0].destino,('10.99.0.1',8443))

    def test_fallo_ocupado_se_conserva_y_libera_reservas(self):
        sockets=[]
        class Sonda:
            def __init__(self,*_):self.cerrada=False;sockets.append(self)
            def bind(self,destino):
                if destino[1]==25432:raise OSError(errno.EADDRINUSE,'ocupado')
            def close(self):self.cerrada=True
        with patch.object(equipo.socket,'socket',Sonda):r=equipo.sondear_puertos('10.99.0.1',[8443,25432,26380])
        self.assertFalse(r['todos_enlazables']);self.assertEqual(r['puertos'][1]['errno'],errno.EADDRINUSE)
        self.assertTrue(r['puertos'][2]['enlazable']);self.assertTrue(all(s.cerrada for s in sockets))

    def test_rechaza_entradas_antes_de_reservar(self):
        for ip,puertos in [('0.0.0.0',[8443]),('8.8.8.8',[8443]),('10.99.0.1',[]),
                           ('10.99.0.1',[True]),('10.99.0.1',[8443,8443]),('10.99.0.1',[0]),
                           ('10.99.0.1',list(range(1,18)))]:
            with self.subTest(ip=ip,puertos=puertos),patch.object(equipo.socket,'socket') as crear:
                with self.assertRaises(ValueError):equipo.sondear_puertos(ip,puertos)
                crear.assert_not_called()


if __name__=='__main__':unittest.main()
