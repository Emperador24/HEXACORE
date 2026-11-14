#!/usr/bin/env python3
"""Versiones y hashes por lectura; funciona también con CU-015 detenido."""
import hashlib, io, json, os, pathlib, subprocess, tarfile
ROOT=pathlib.Path(__file__).resolve().parents[4]
PARES=[
 ('nucleo','/app/dist/modulos/alimentos/catalogo/catalogo.controller.js','App/backend/dist/modulos/alimentos/catalogo/catalogo.controller.js'),
 ('nucleo','/app/dist/modulos/finanzas/pagos/pasarela-http.service.js','App/backend/dist/modulos/finanzas/pagos/pasarela-http.service.js'),
 ('boleteria','/app/dist/modulos/entradas/ventas/venta/interno/llamada-interna.guard.js','App/backend/dist/modulos/entradas/ventas/venta/interno/llamada-interna.guard.js'),
 ('boleteria','/app/dist/modulos/entradas/ventas/venta/interno/api-local.service.js','App/backend/dist/modulos/entradas/ventas/venta/interno/api-local.service.js'),
 ('boleteria','/app/dist/modulos/entradas/postventa/postventa/cliente-ventas.service.js','App/backend/dist/modulos/entradas/postventa/postventa/cliente-ventas.service.js'),
 ('api-gateway','/etc/nginx/njs/autenticacion.js','App/gateway/autenticacion.js'),
 ('portal-web-cliente','/etc/nginx/conf.d/default.conf','App/frontend/portal-web-cliente/nginx.conf'),
 ('portal-web-admin','/etc/nginx/conf.d/default.conf','App/frontend/portal-web-admin/nginx.conf')]
def main():
    salida=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert salida.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(salida/'control')],cwd=ROOT,check=True)
    assert subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()=='feature/sebastian'
    imagenes={}
    for s in ['nucleo','boleteria','trabajador','api-gateway','portal-web-cliente','portal-web-admin']:
        c=json.loads(subprocess.check_output(['docker','inspect','hexacore-cu015-sebastian-'+s+'-1'],text=True))[0]
        assert c['Config']['Labels']['hexacore.uso']=='cu015'
        imagenes[s]={'imagen':c['Image'],'revision':c['Config']['Labels'].get('org.opencontainers.image.revision')}
    huellas=[]
    for s,remoto,local in PARES:
        blob=subprocess.check_output(['docker','cp','hexacore-cu015-sebastian-'+s+'-1:'+remoto,'-'])
        with tarfile.open(fileobj=io.BytesIO(blob)) as t:
            miembros=[m for m in t.getmembers() if m.isfile()];assert len(miembros)==1
            datos=t.extractfile(miembros[0]).read()
        a=hashlib.sha256(datos).hexdigest();b=hashlib.sha256((ROOT/local).read_bytes()).hexdigest()
        huellas.append({'servicio':s,'archivo':local,'sha256':a,'coincideFuenteActual':a==b})
    versiones={}
    for n,cmd in [('node',['node','--version']),('npm',['npm','--version']),('python',['python3','--version']),('docker',['docker','version','--format','{{.Client.Version}} / {{.Server.Version}}'])]:
        versiones[n]=subprocess.check_output(cmd,text=True).strip()
    for n,d in [('imagenes-finales',imagenes),('fuentes-ejecutadas',huellas),('versiones',versiones)]:
        (salida/(n+'.json')).write_text(json.dumps(d,indent=2))
    assert all(h['coincideFuenteActual'] for h in huellas),'Hay fuentes distintas: no declarar el ensayo correspondiente a este checkout'
    print('Versiones y ocho hashes registrados sin arrancar servicios ni mostrar configuración.')
if __name__=='__main__':main()
