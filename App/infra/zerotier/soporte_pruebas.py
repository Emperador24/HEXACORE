"""Fixtures ficticios de pruebas: ninguna dirección corresponde a equipos reales."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

from comun import PUERTOS, escribir, json_bytes


def configuracion(raiz,rol='A'):
    return dict(demo='prueba-local',rol=rol,red_zerotier='0123456789abcdef',
        ip_a='10.99.0.1',ip_b='10.99.0.2',dominio_cliente='demo.test',dominio_admin='admin.demo.test',
        puertos=PUERTOS.copy(),secretos=str(raiz/'secretos'),
        tls=dict(certificado=str(raiz/'tls.pem'),privada=str(raiz/'tls.key'),ca=str(raiz/'tls.pem')) if rol=='A' else None)


def certificados(raiz):
    """CA/certificado solo de loopback, generado en temporal; nunca se versiona."""
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(raiz/'tls.key'),
        '-out',str(raiz/'tls.pem'),'-days','2','-subj','/CN=localhost',
        '-addext','subjectAltName=DNS:localhost,DNS:demo.test,DNS:admin.demo.test'],
        check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    (raiz/'tls.key').chmod(0o600)
    s=raiz/'secretos';s.mkdir(mode=0o700)
    escribir(s/'comun.json',json_bytes(dict(postgres='1'*64,rabbitmq='2'*64,servicios='3'*64,webhook='4'*64)))
    subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(s/'jwt-privada.pem')],
                   check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    (s/'jwt-privada.pem').chmod(0o600)
    pub=subprocess.check_output(['openssl','pkey','-in',str(s/'jwt-privada.pem'),'-pubout'],text=True)
    escribir(s/'jwt-publica.pem',pub)


def c_config():
    return dict(demo='prueba-local',fuente='a'*40,red_zerotier='0123456789abcdef',
                ip_a='10.99.0.1',ip_b='10.99.0.2',ip_c='10.99.0.3',url='https://demo.test',ca=None,
                upstreams_a=dict(publica='172.25.0.2:3001',autenticada='172.25.0.3:3002'),
                puertos_b=dict(publica=3001,autenticada=3002))
