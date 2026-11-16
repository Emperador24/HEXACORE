"""Huellas de fuentes, arnés y JS ejecutado. No publica entornos ni claves."""
import datetime, hashlib, json, os, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[4]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert p.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=ROOT,check=True)
    nombre=sys.argv[1];assert nombre.replace('-','').isalnum()
    salida=p/('version-'+nombre+'.json');assert not salida.exists()
    meta=json.loads((p/'entorno-parqueaderos.json').read_text())
    def docker(*args): return subprocess.check_output(['docker',*args],text=True)
    grupos={'nucleo':['modulos/identidad/administracion-cuentas','modulos/identidad/roles-permisos','modulos/identidad/sesiones','compartido/seguridad'],
            'boleteria':['modulos/entradas/acceso-qr','modulos/entradas/compartido']}
    fuentes={};runtime={}
    for programa,carpetas in grupos.items():
        archivos=[]
        for carpeta in carpetas:
            archivos.extend(x for x in (ROOT/'App/backend'/carpeta).rglob('*.ts') if not x.name.endswith('.spec.ts') and not any(t in x.parts for t in ['semillas','migraciones','pruebas','herramientas']))
        archivos=sorted(set(archivos));rutas={str(x.relative_to(ROOT/'App/backend').with_suffix('.js')):x for x in archivos}
        ident=meta['coreId'] if programa=='nucleo' else meta['boleteriaEnsayo']['id']
        script="const fs=require('fs'),crypto=require('crypto');const r={};for(const p of JSON.parse(process.argv[1]))r[p]=crypto.createHash('sha256').update(fs.readFileSync('/app/dist/'+p)).digest('hex');process.stdout.write(JSON.stringify({node:process.version,archivos:r}));"
        datos=json.loads(docker('exec',ident,'node','-e',script,json.dumps(list(rutas))))
        for relativo,ts in rutas.items():
            local=ROOT/'App/backend/dist'/relativo
            assert local.exists() and sha(local)==datos['archivos'][relativo], 'JS distinto del dist revisado: '+programa+'/'+relativo
            fuentes[str(ts.relative_to(ROOT))]=sha(ts)
        live=json.loads(docker('inspect',ident))[0]
        assert live['State']['Running'] and live['Config']['Labels']['com.docker.compose.project']==meta['proyecto']
        runtime[programa]={'imagen':live['Image'],'node':datos['node'],'archivos':datos['archivos']}
    gid=meta['gatewayEnsayo']['id']
    publicos=['autenticacion.js','nginx.conf','nginx-principal.conf','autenticar.conf']
    for x in publicos: fuentes['App/gateway/'+x]=sha(ROOT/'App/gateway'/x)
    actual=docker('exec',gid,'sha256sum','/etc/nginx/njs/autenticacion.js').split()[0]
    assert actual==fuentes['App/gateway/autenticacion.js']
    runtime['gateway']={'imagen':meta['gatewayEnsayo']['imagen'],'autenticacion':actual}
    arnes={str(x.relative_to(ROOT)):sha(x) for x in sorted((ROOT/'App/infra/informe-atributos/seguridad').glob('*cierre*')) if x.is_file()}
    for x in ['operacion-comun.cjs','parqueaderos-comun.cjs','comun.cjs','parqueaderos-entorno.cjs','restaurar-parqueaderos.py']:
        ruta=ROOT/'App/infra/informe-atributos/seguridad'/x;arnes[str(ruta.relative_to(ROOT))]=sha(ruta)
    datos={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'fuentes':fuentes,'arnes':arnes,'runtime':runtime}
    salida.write_text(json.dumps(datos,indent=2)+'\n')
    print(f'{len(fuentes)} fuentes y JS de Núcleo/Boletería coincidentes; gateway y arnés registrados.')
if __name__=='__main__':main()
