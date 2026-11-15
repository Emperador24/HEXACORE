"""Versiones realmente ejecutadas; gateway actual exclusivo, guarda común y SSE anterior."""
import hashlib, io, json, os, pathlib, re, subprocess, tarfile
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def ejecutar(*a): return subprocess.check_output(a,cwd=ROOT)
def medir():
    assert ejecutar('git','branch','--show-current').decode().strip()=='feature/sebastian'
    assert not ejecutar('docker','ps','-q','--filter','label=com.docker.compose.project=redash').strip()
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']);m=json.loads((p/'entorno-parqueaderos.json').read_text());gw=m['gatewayEnsayo']
    imagenes={}
    for nombre in [m['core'],m['redis'],gw['nombre']]+['hexacore-cu015-sebastian-'+s+'-1' for s in ['postgres','rabbitmq','correo','pasarela']]:
        c=json.loads(ejecutar('docker','inspect',nombre))[0];assert c['State']['Running']
        if c['Config'].get('Healthcheck'):assert c['State']['Health']['Status']=='healthy',nombre
        imagenes[nombre]={'id':c['Id'],'imagen':c['Image'],'reinicios':c['RestartCount']}
    assert imagenes[m['core']]['id']==m['coreId'] and imagenes[m['core']]['imagen']==m['imagen']
    assert imagenes[gw['nombre']]['id']==gw['id'] and imagenes[gw['nombre']]['imagen']==gw['imagen']
    compilados={}
    for carpeta in ['modulos/operacion','modulos/parqueaderos','compartido/seguridad']:
        with tarfile.open(fileobj=io.BytesIO(ejecutar('docker','cp',m['core']+':/app/dist/'+carpeta,'-'))) as t:
            for e in t.getmembers():
                if not e.isfile() or not e.name.endswith('.js'):continue
                rel=pathlib.PurePosixPath(e.name).relative_to(pathlib.PurePosixPath(carpeta).name);b=t.extractfile(e).read()
                assert b==(ROOT/'App/backend/dist'/carpeta/rel).read_bytes(),str(rel)
                compilados[carpeta+'/'+str(rel)]=hashlib.sha256(b).hexdigest()
    fuentes={}
    archivos=list((ROOT/'App/backend/modulos/operacion').rglob('*.ts'))+list((ROOT/'App/backend/test/operacion').glob('*.ts'))
    archivos+=list((ROOT/'App/backend/compartido/seguridad').glob('*.ts'))+list((ROOT/'App/backend/modulos/parqueaderos').rglob('*.ts'))
    archivos+=[HERE/n for n in ['preparar-operacion.cjs','sondear-operacion.cjs','operacion-comun.cjs','operacion-estado.test.cjs','operacion-recursos.cjs','comprobar-operacion-sse.cjs','operacion-gateway.py','procedencia-operacion.py','finales-operacion.py','inventario.cjs','parqueaderos-comun.cjs','parqueaderos-entorno.cjs','eventos-comun.cjs','comun.cjs']]
    archivos+=[ROOT/'App/frontend/portal-web-admin/src/app'/n for n in ['core/flujo-sse.ts','core/flujo-sse.spec.ts','core/monitoreo-api.service.ts','core/emergencias-api.service.ts','core/operacion-flujos.spec.ts','monitoreo/monitoreo.component.ts','emergencias/emergencias.component.ts','parqueaderos/parqueaderos.component.ts','parqueaderos/parqueaderos-flujo.spec.ts']]
    for a in sorted(archivos):fuentes[str(a.relative_to(ROOT))]=hashlib.sha256(a.read_bytes()).hexdigest()
    for remoto,local in [('/etc/nginx/nginx.conf',ROOT/'App/gateway/nginx-principal.conf'),('/etc/nginx/conf.d/default.conf',pathlib.Path(gw['config'])),('/etc/nginx/hexacore/autenticar.conf',ROOT/'App/gateway/autenticar.conf'),('/etc/nginx/njs/autenticacion.js',ROOT/'App/gateway/autenticacion.js')]:
        with tarfile.open(fileobj=io.BytesIO(ejecutar('docker','cp',gw['nombre']+':'+remoto,'-'))) as t:b=t.extractfile(next(e for e in t.getmembers() if e.isfile())).read()
        assert b==local.read_bytes(),remoto;fuentes[remoto]=hashlib.sha256(b).hexdigest()
        if remoto.endswith('/default.conf'):
            patron=r'map \$http_origin \$origen_permitido \{[^}]+\}'
            assert re.sub(patron,'CORS_LOCAL',b.decode())==re.sub(patron,'CORS_LOCAL',(ROOT/'App/gateway/nginx.conf').read_text())
    assert not ejecutar('git','diff','36998aa','--','App/backend/modulos/parqueaderos','App/backend/compartido/seguridad')
    return {'sha':ejecutar('git','rev-parse','HEAD').decode().strip(),'imagenes':imagenes,'compilados':compilados,'fuentes':fuentes,
            'node':ejecutar('docker','exec',m['core'],'node','--version').decode().strip(),'gatewayActualCoincide':True,'guardaComunYParqueaderosSinCambiosPropios':True}
if __name__=='__main__': print(json.dumps(medir(),indent=2))
