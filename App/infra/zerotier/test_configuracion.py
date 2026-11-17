import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import comun
import montaje
from soporte_pruebas import certificados,configuracion


class Entradas(unittest.TestCase):
    def setUp(self): self.c=configuracion(Path('/temporal-ficticio'))

    def test_marcadores_no_se_pueden_ejecutar(self):
        for campo in ['demo','ip_a','ip_b','red_zerotier','dominio_cliente']:
            c=copy.deepcopy(self.c);c[campo]='<PENDIENTE>'
            with self.subTest(campo=campo),self.assertRaises(ValueError):comun.validar_config(c)

    def test_no_publicos_loopback_ni_mismo_equipo(self):
        for ip in ['0.0.0.0','127.0.0.1','8.8.8.8','169.254.1.1','::1',None]:
            c=copy.deepcopy(self.c);c['ip_b']=ip
            with self.subTest(ip=ip),self.assertRaises(ValueError):comun.validar_config(c)
        c=copy.deepcopy(self.c);c['ip_b']=c['ip_a']
        with self.assertRaises(ValueError):comun.validar_config(c)

    def test_puertos_y_inyeccion(self):
        for valor in [0,65536,True,'443','443; touch /tmp/ajeno']:
            c=copy.deepcopy(self.c);c['puertos']['https']=valor
            with self.subTest(valor=valor),self.assertRaises(ValueError):comun.validar_config(c)
        for valor in ['demo.test; shutdown now','https://demo.test','*.demo.test','../x']:
            c=copy.deepcopy(self.c);c['dominio_cliente']=valor
            with self.subTest(valor=valor),self.assertRaises(ValueError):comun.validar_config(c)

    def test_b_no_recibe_privada_tls(self):
        c=copy.deepcopy(self.c);c['rol']='B'
        with self.assertRaises(ValueError):comun.validar_config(c)
        c['tls']=None;self.assertEqual(comun.validar_config(c)['rol'],'B')

    def test_fuera_rama_sin_escritura(self):
        for otra in ('develop','feature/sebastian'):
            with patch.object(comun,'git',return_value=otra),self.assertRaises(ValueError):comun.rama()

    def test_main_es_la_rama_de_la_demo(self):
        with patch.object(comun,'git',return_value='main'):comun.rama()

    def test_no_secretos_ni_compose_heredados(self):
        with patch.dict('os.environ',{'HOST_POSTGRES':'ajeno','STRIPE_CLAVE_SECRETA':'no-usar','COMPOSE_PROJECT_NAME':'redash'},clear=False):
            e=comun.entorno()
            self.assertNotIn('HOST_POSTGRES',e);self.assertNotIn('STRIPE_CLAVE_SECRETA',e);self.assertNotIn('COMPOSE_PROJECT_NAME',e)

    def test_docker_remoto_rechazado(self):
        with patch.dict('os.environ',{'DOCKER_HOST':'ssh://ajeno'},clear=False),self.assertRaises(ValueError):comun.entorno()

    def test_red_ajena_no_join(self):
        for respuesta in [[],[{'nwid':self.c['red_zerotier'],'status':'ACCESS_DENIED','type':'PRIVATE'}],
                          [{'nwid':self.c['red_zerotier'],'status':'OK','type':'PRIVATE','assignedAddresses':['10.99.0.2/24']}]]:
            with patch.object(comun,'ejecutar',return_value=json.dumps(respuesta)) as ejecutar,self.assertRaises(ValueError):
                comun.red_local(self.c)
            self.assertEqual(ejecutar.call_args.args[0],['zerotier-cli','-j','listnetworks'])

    def test_consulta_sudo_explicita_solo_listnetworks_y_sin_prompt(self):
        red=[{'nwid':self.c['red_zerotier'],'status':'OK','type':'PRIVATE','assignedAddresses':[self.c['ip_a']+'/24']}]
        with patch.object(comun,'ejecutar',return_value=json.dumps(red)) as ejecutar:
            self.assertEqual(comun.red_local(self.c,con_sudo=True),self.c['ip_a'])
        ejecutar.assert_called_once_with(['sudo','-n','zerotier-cli','-j','listnetworks'])

    def test_sudo_fallido_no_reintenta_y_no_elude_guarda(self):
        with patch.object(comun,'ejecutar',side_effect=comun.FalloHerramienta(['sudo'],1,'','sin autorización')) as ejecutar:
            with self.assertRaises(comun.FalloHerramienta):comun.red_local(self.c,con_sudo=True)
        self.assertEqual(ejecutar.call_count,1)

    def test_sudo_no_acepta_comando_o_opciones_arbitrarias(self):
        with patch.object(comun,'ejecutar') as ejecutar,self.assertRaises(ValueError):
            comun.red_local(self.c,con_sudo='sudo bash')
        ejecutar.assert_not_called()

    def test_no_escrituras_sobre_archivo_previo(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'datos';comun.escribir(p,'original')
            with self.assertRaises(FileExistsError):comun.escribir(p,'nuevo')
            self.assertEqual(p.read_text(),'original')


@unittest.skipUnless(shutil.which('docker') and shutil.which('openssl'),'Requiere clientes Compose/OpenSSL, sin daemon')
class ComposeReal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.d=Path(cls.tmp.name);certificados(cls.d)
        cls.base=montaje.base_compose()

    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()

    def render(self,rol):
        c=configuracion(self.d,rol)
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp)
            for n in ['comun.json','jwt-privada.pem','jwt-publica.pem']:
                shutil.copyfile(self.d/'secretos'/n,d/n);(d/n).chmod(0o600)
            cfg=montaje.derivar(self.base,c,d,'propietario-prueba','a'*40)
            # config valida estructura sin crear recursos; archivos de bind no se leen aquí.
            p=d/'compose.json';p.write_bytes(comun.json_bytes(cfg))
            vacio=d/'vacio';vacio.touch()
            r=subprocess.run(['docker','compose','--env-file',str(vacio),'-f',str(p),'config','--format','json'],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            return c,cfg,json.loads(r.stdout)

    def test_a_sin_nombres_ni_recursos_habituales(self):
        c,cfg,_=self.render('A')
        self.assertEqual(set(cfg['services']),montaje.SERVICIOS_A)
        for s in cfg['services'].values():
            self.assertNotIn('container_name',s);self.assertNotIn('profiles',s)
            self.assertNotIn('depends_on',s)
            for p in s.get('ports',[]):self.assertEqual(p['host_ip'],c['ip_a'])
        self.assertFalse(cfg['services']['nucleo'].get('ports'))
        self.assertFalse(cfg['services']['api-gateway'].get('ports'))
        self.assertEqual(cfg['services']['boleteria']['environment']['COLA_AFORO_CONCURRENTE'],'25')
        for v in cfg['volumes'].values():self.assertTrue(v['name'].startswith('hxc-zt-prueba-local-a-'))

    def test_b_exactamente_dos_apps_sin_preparacion(self):
        c,cfg,_=self.render('B')
        self.assertEqual(set(cfg['services']),{'nucleo','boleteria'})
        self.assertEqual(cfg['volumes'],{})
        self.assertEqual(cfg['services']['boleteria']['environment']['COLA_AFORO_CONCURRENTE'],'25')
        self.assertNotIn('PASARELA_SECRETO_WEBHOOK',cfg['services']['boleteria']['environment'])
        for s in cfg['services'].values():
            self.assertNotIn('command',s);self.assertNotIn('depends_on',s)
            self.assertEqual(s['environment']['POSTGRES_HOST'],c['ip_a'])
            self.assertEqual(s['environment']['NODE_ENV'],'production')
            self.assertEqual(s['environment']['PAGOS_PROVEEDOR'],'simulada')
            self.assertNotIn('STRIPE_CLAVE_SECRETA',s['environment'])
            self.assertEqual(s['ports'][0]['host_ip'],c['ip_b'])

    def test_base_nunca_modificada(self):
        original=copy.deepcopy(self.base);self.render('A');self.render('B');self.assertEqual(original,self.base)

    def test_base_con_acceso_host_no_se_reutiliza(self):
        base=copy.deepcopy(self.base);base['services']['nucleo']['network_mode']='host'
        d=self.d/'secretos'
        with self.assertRaises(ValueError):montaje.derivar(base,configuracion(self.d,'B'),d,'p','a'*40)

    def test_b_rechaza_override_administrativo_de_main(self):
        base=copy.deepcopy(self.base)
        base['services']['nucleo']['command']=['node','dist/compartido/persistencia/preparar-base.js']
        with self.assertRaises(ValueError):montaje.derivar(base,configuracion(self.d,'B'),self.d/'secretos','p','a'*40)

    def test_configurar_sella_sin_crear_recursos_y_preserva_privadas(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);c=configuracion(self.d);f=p/'entrada.json';f.write_bytes(comun.json_bytes(c))
            destino=p/'montaje'
            # Actions comprueba refs/pull/*/merge en detached HEAD; la guarda
            # real de rama se prueba aparte sin debilitar la herramienta.
            with patch.object(montaje,'docker_local',return_value='contexto-ficticio'),patch.object(montaje,'rama'):
                m=montaje.configurar(f,destino)
                validado=montaje.Montaje(destino)
                self.assertEqual(validado.m['propietario'],m['propietario'])
                self.assertEqual((destino/'jwt-privada.pem').stat().st_mode & 0o777,0o600)
                self.assertEqual((destino/'jwt-publica.pem').stat().st_mode & 0o777,0o644)
                self.assertEqual((destino/'01-base.sql').stat().st_mode & 0o777,0o644)
                with self.assertRaises(ValueError):montaje.configurar(f,destino)
                (destino/'compose.json').write_text('{}')
                with self.assertRaises(ValueError):montaje.Montaje(destino)

    def test_tls_propio_y_par_valido(self):
        montaje.comprobar_claves(self.d/'secretos');montaje.comprobar_tls(configuracion(self.d))
        c=configuracion(self.d);c['dominio_admin']='otro.test'
        with self.assertRaises(RuntimeError):montaje.comprobar_tls(c)

    def test_nginx_conserva_rutas_guardas_y_sse(self):
        c=configuracion(self.d);s=montaje.nginx(c)
        base=(comun.RAIZ/'App/gateway/nginx.conf').read_text()
        for linea in base.splitlines():
            if any(x in linea for x in ['location ','auth_request','roles_requeridos','modulo_permiso','proxy_read_timeout 1h','proxy_buffering off']):
                self.assertIn(linea,s)
        self.assertIn('proxy_next_upstream off;',s);self.assertNotIn('non_idempotent',s)
        self.assertIn('server 10.99.0.2:3002',s);self.assertIn('server 10.99.0.2:3001',s)
        self.assertIn('X-Servidor $upstream_addr',s);self.assertIn('X-Demo-Solicitud',s)
        self.assertNotIn('Authorization',montaje.principal());self.assertNotIn('$request_uri',montaje.principal())

    def test_historial_real_y_no_cifra_historica(self):
        h=comun.historial();self.assertEqual(len(h),11);self.assertEqual(sum(x['cantidad'] for x in h),36)


if __name__=='__main__':unittest.main()
