from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import signal
import ssl
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid

import cliente
from comun import escribir,huella,json_bytes
from soporte_pruebas import certificados,c_config


class PuertaDeDemostracion(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.d=Path(self.tmp.name)
        self.c=c_config();self.ahora=time.monotonic_ns();self.identidad=huella(b'cuenta-propia')
        meta=dict(configuracion=self.c,pid=os.getpid(),sesion_sha256='sesion',identidad_sha256=self.identidad,
                  intervalo_s=0.5,timeout_s=8)
        escribir(self.d/'metadatos.json',json_bytes(meta));escribir(self.d/'latido',str(self.ahora))
        self.estados=[]
        for rol in ['A','B']:
            self.estados.append(dict(demo=self.c['demo'],rol=rol,fuente=self.c['fuente'],red_zerotier=self.c['red_zerotier'],
                ip_a=self.c['ip_a'],ip_b=self.c['ip_b'],puertos_b=self.c['puertos_b'],upstreams_a=self.c['upstreams_a'],
                contenedores=[dict(servicio=n,estado='running',salud='healthy') for n in ['nucleo','boleteria']]))
        self.rs=[];self.logs=[]
        for nombre in cliente.RUTAS:
            for i in range(12):
                eq='A' if i%2==0 else 'B';id=str(uuid.uuid4())
                servidor=self.c['upstreams_a'][nombre] if eq=='A' else self.c['ip_b']+':'+str(self.c['puertos_b'][nombre])
                r=dict(tipo='respuesta',solicitud=id,lectura=nombre,ruta=cliente.RUTAS[nombre],
                    inicio_ns=self.ahora-(12-i)*500_000_000,fin_ns=self.ahora-(12-i)*500_000_000+1000,
                    inicio_utc=cliente.utc(),fin_utc=cliente.utc(),duracion_ms=1,
                    http=200,error_transporte=None,servidor=servidor,equipo=eq,correlacion=True,contenido_valido=True,
                    identidad_sha256=self.identidad,sesion_sha256='sesion',total_publico=1,cuerpo_sha256='datos')
                self.rs.append(r)
                self.logs.append(dict(utc=r['fin_utc'],solicitud=id,metodo='GET',ruta=r['ruta'],http=200,
                                      servidor=servidor,duracion_s=0.001,upstream_s='0.001'))
        self.guardar()

    def guardar(self):
        for p,datos in [('lecturas.jsonl',self.rs),('gateway.jsonl',self.logs)]:
            (self.d/p).write_text(''.join(json.dumps(x)+'\n' for x in datos))

    def acreditar(self):return cliente.acreditar(self.d,*self.estados,ahora_ns=self.ahora)

    def test_respuestas_reales_de_ambos_correlacionadas(self):
        p=self.acreditar();self.assertEqual(set(p['prueba']),{'A/publica','B/publica','A/autenticada','B/autenticada'})

    def test_config_c_rechaza_http_credenciales_en_url_y_equipos_repetidos(self):
        for url in ['http://demo.test','https://usuario:clave@demo.test','https://demo.test/api/v1','https://demo.test?token=x']:
            c=self.c.copy();c['url']=url
            with self.subTest(url=url),self.assertRaises(ValueError):cliente.validar(c)
        c=self.c.copy();c['ip_c']=c['ip_a']
        with self.assertRaises(ValueError):cliente.validar(c)

    def test_saludable_sin_trafico_b_no_basta(self):
        for r in self.rs:r['equipo']='A'
        self.guardar()
        with self.assertRaises(ValueError):self.acreditar()

    def test_entradas_c_con_tipo_invalido_se_rechazan(self):
        for campo,valor in [('upstreams_a',None),('upstreams_a',{'publica':3001,'autenticada':3002}),
                            ('puertos_b',None),('ca',[]),('ip_c',172818435)]:
            c=self.c.copy();c[campo]=valor
            with self.subTest(campo=campo),self.assertRaises(ValueError):cliente.validar(c)

    def test_trafico_b_antiguo_no_basta(self):
        for r in self.rs:
            if r['equipo']=='B':r['fin_ns']=self.ahora-15_000_000_000
        self.guardar()
        with self.assertRaises(ValueError):self.acreditar()

    def test_x_servidor_sin_logs_no_basta(self):
        (self.d/'gateway.jsonl').unlink()
        with self.assertRaises(ValueError):self.acreditar()

    def test_logs_otro_upstream_u_otra_hora_no_bastan(self):
        for defecto in ['servidor','utc','http']:
            with self.subTest(defecto=defecto):
                previo=[r.copy() for r in self.logs]
                for r in self.logs:r[defecto]={'servidor':'otro:3002','utc':'2000-01-01T00:00:00+00:00','http':503}[defecto]
                self.guardar()
                with self.assertRaises(ValueError):self.acreditar()
                self.logs=previo

    def test_cartelera_vacia_no_acredita_datos(self):
        for r in self.rs:r['total_publico']=0
        self.guardar()
        with self.assertRaises(ValueError):self.acreditar()

    def test_datos_distintos_entre_replicas_bloquean(self):
        for r in self.rs:
            if r['equipo']=='B':r['cuerpo_sha256']='otros-datos'
        self.guardar()
        with self.assertRaises(ValueError):self.acreditar()

    def test_sesion_ajena_o_cambio_de_fuente_rechazados(self):
        self.estados[1]['fuente']='b'*40
        with self.assertRaises(ValueError):self.acreditar()
        self.estados[1]['fuente']=self.c['fuente']
        for r in self.rs:r['identidad_sha256']='otra'
        self.guardar()
        with self.assertRaises(ValueError):self.acreditar()

    def test_observador_terminado_no_puede_armar(self):
        escribir(self.d/'finalizado.json',b'{}')
        with self.assertRaises(ValueError):self.acreditar()

    def test_error_reciente_y_archivo_truncado_no_se_ocultan(self):
        self.rs[-1]['http']=503;self.guardar()
        with self.assertRaises(ValueError):self.acreditar()
        self.rs[-1]['http']=200;self.guardar()
        with (self.d/'lecturas.jsonl').open('a') as f:f.write('{"truncado"')
        with self.assertRaises(ValueError):self.acreditar()
        self.assertEqual(cliente.informe(self.d)['registros_incompletos'],1)

    def test_apagado_sin_armado_y_armado_vencido_rechazados(self):
        with self.assertRaises(ValueError):cliente.marcar(self.d,'apagar-b',*self.estados)
        cliente.append(self.d/'marcas.jsonl',dict(tipo='armado',ns=time.monotonic_ns()-6_000_000_000))
        with self.assertRaises(ValueError):cliente.marcar(self.d,'apagar-b',*self.estados)
        self.assertFalse(any(r['tipo']=='apagar-b' for r in cliente.leer_lineas(self.d/'marcas.jsonl')))

    def test_puerto_de_b_desconocido_no_se_clasifica_como_b(self):
        self.assertEqual(cliente.equipo(self.c,'publica','10.99.0.2:9999'),'desconocido')

    def test_resumen_conserva_fallo_y_mide_recuperacion(self):
        caida=self.ahora
        cliente.append(self.d/'marcas.jsonl',dict(tipo='apagar-b',ns=caida,utc=cliente.utc()))
        cliente.append(self.d/'marcas.jsonl',dict(tipo='b-apagado',ns=caida+1000,utc=cliente.utc()))
        for nombre in cliente.RUTAS:
            for i in range(12):
                r=next(r.copy() for r in self.rs if r['lectura']==nombre)
                r.update(solicitud=str(uuid.uuid4()),equipo='A',inicio_ns=caida+(i+1)*1_000_000,
                         fin_ns=caida+(i+1)*1_000_000+1000)
                if i==0:r.update(http=0,error_transporte='TimeoutError')
                self.rs.append(r)
        self.guardar();r=cliente.informe(self.d)
        self.assertEqual(r['http']['0'],2);self.assertEqual(r['errores_transporte']['TimeoutError'],2)
        self.assertEqual(r['lecturas']['autenticada']['errores'],1)
        self.assertIsNotNone(r['lecturas']['autenticada']['diez_a_consecutivas_ms'])
        self.assertTrue(r['lecturas']['autenticada']['datos_sin_cambio'])

    def test_no_confunde_peticion_pendiente_con_exito(self):
        self.rs.append(dict(tipo='inicio',solicitud='sin-fin',inicio_ns=self.ahora,lectura='publica'));self.guardar()
        self.assertEqual(cliente.informe(self.d)['solicitudes_sin_fin'],1)


class TransporteTLS(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.d=Path(cls.tmp.name);certificados(cls.d)
        cls.recibidas=[];cls.respuestas=[]
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                cls.recibidas.append(self.path)
                estado=cls.respuestas.pop(0) if cls.respuestas else 200
                dato={'eventos':[{'id':'evento-ficticio'}],'total':1} if self.path.endswith('cartelera') else {'id':'cuenta-propia'}
                self.send_response(estado);self.send_header('Content-Type','application/json')
                self.send_header('X-Servidor','10.99.0.2:'+('3001' if self.path.endswith('cartelera') else '3002'))
                self.send_header('X-Demo-Solicitud',self.headers.get('X-Demo-Solicitud',''))
                if estado==302:self.send_header('Location','/no-se-debe-seguir')
                self.end_headers();self.wfile.write(json.dumps(dato).encode())
            def log_message(self,*_):pass
        cls.srv=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(cls.d/'tls.pem',cls.d/'tls.key')
        cls.srv.socket=ctx.wrap_socket(cls.srv.socket,server_side=True)
        cls.hilo=threading.Thread(target=cls.srv.serve_forever,daemon=True);cls.hilo.start()
        cls.url='https://localhost:'+str(cls.srv.server_port)

    @classmethod
    def tearDownClass(cls):cls.srv.shutdown();cls.srv.server_close();cls.hilo.join();cls.tmp.cleanup()

    def setUp(self):self.recibidas.clear();self.respuestas.clear()

    def test_tls_verificado_y_sin_reintento_503(self):
        self.respuestas.append(503)
        r=cliente.http(self.url,str(self.d/'tls.pem'),'/api/v1/cartelera')
        self.assertEqual(r[0],503);self.assertEqual(len(self.recibidas),1)

    def test_ca_no_confiable_falla_antes_de_enviar_token(self):
        r=cliente.http(self.url,None,'/api/v1/sesiones/actual',token='secreto-ficticio')
        self.assertEqual(r[0],0);self.assertEqual(r[3],'SSLCertVerificationError');self.assertEqual(self.recibidas,[])

    def test_nombre_certificado_incorrecto_no_se_acepta(self):
        r=cliente.http(self.url.replace('localhost','127.0.0.1'),str(self.d/'tls.pem'),'/api/v1/cartelera')
        self.assertEqual(r[0],0);self.assertEqual(r[3],'SSLCertVerificationError')

    def test_no_sigue_redirecciones(self):
        self.respuestas.append(302)
        r=cliente.http(self.url,str(self.d/'tls.pem'),'/api/v1/cartelera')
        self.assertEqual(r[0],302);self.assertEqual(len(self.recibidas),1)

    def test_medicion_captura_fallo_y_sigue_con_misma_sesion(self):
        c=c_config();c.update(url=self.url,ca=str(self.d/'tls.pem'))
        destino=self.d/('registro-'+str(uuid.uuid4()))
        sesion=self.d/('sesion-'+str(uuid.uuid4())+'.json')
        escribir(sesion,json_bytes(dict(token='token-ficticio-no-real',expiraEn=datetime.fromtimestamp(time.time()+3600,timezone.utc).isoformat(),identidad_sha256=huella(b'cuenta-propia'))))
        self.respuestas.append(503);handlers={}
        def capturar(sig,fn):handlers[sig]=fn
        def terminar():handlers[signal.SIGINT](None,None)
        timer=threading.Timer(1.3,terminar)
        with patch.object(cliente,'comprobar',return_value={}),patch.object(cliente.signal,'signal',side_effect=capturar):
            timer.start();cliente.iniciar(c,str(sesion),destino,duracion=30,intervalo=0.2);timer.join()
        r=cliente.informe(destino)
        self.assertEqual(r['http']['503'],1);self.assertGreater(r['http']['200'],2)
        log=(destino/'lecturas.jsonl').read_text();self.assertNotIn('token-ficticio-no-real',log)
        self.assertTrue((destino/'finalizado.json').exists())
        huellas={x['sesion_sha256'] for x in cliente.leer_lineas(destino/'lecturas.jsonl') if x.get('tipo')=='respuesta' and x['lectura']=='autenticada'}
        self.assertEqual(len(huellas),1)

    def test_no_plaintext(self):
        with self.assertRaises(ValueError):cliente.http('http://localhost',None,'/api/v1/cartelera')


if __name__=='__main__':unittest.main()
