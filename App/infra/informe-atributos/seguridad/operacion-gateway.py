"""Gateway actual exclusivo: conserva imagen/configuración/ID del gateway inicial."""
import json, os, pathlib, re, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[4]
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve(); assert p.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(p/'control')], cwd=ROOT, check=True)
    meta = json.loads((p/'entorno-parqueaderos.json').read_text()); assert not meta.get('gatewayEnsayo')
    def docker(*a): return subprocess.check_output(['docker',*a],text=True)
    original = json.loads(docker('inspect',meta['gatewayId']))[0]
    assert original['Config']['Labels']['com.docker.compose.project']=='hexacore-cu015-sebastian'
    if original['State']['Running']: docker('stop','--time','30',original['Id'])
    actual = (ROOT/'App/gateway/nginx.conf').read_text(); previo = (ROOT/'App/infra/revision/.estado-cu015/gateway.conf').read_text()
    patron = r'map \$http_origin \$origen_permitido \{[^}]+\}'
    cors = re.search(patron,previo).group(0); config = re.sub(patron,lambda _:cors,actual)
    assert re.sub(patron,'CORS_LOCAL',config)==re.sub(patron,'CORS_LOCAL',actual)
    destino = p/'gateway-actual.conf'; destino.write_text(config)
    nombre = meta['core']+'-gateway'
    args=['create','--name',nombre,'--network',meta['red'],'-p','127.0.0.1:18100:8080',
          '--label','com.docker.compose.project='+meta['proyecto'],'--label','com.docker.compose.service=api-gateway',
          '--label','hexacore.uso=seguridad-parqueaderos','--mount','type=bind,source='+str(destino)+',target=/etc/nginx/conf.d/default.conf,readonly']
    for m in original['Mounts']:
        if m['Destination']=='/etc/nginx/claves/jwt-publica.pem':
            assert m['Type']=='bind' and not m['RW']; args += ['--mount',f"type=bind,source={m['Source']},target={m['Destination']},readonly"]
    args += ['hexacore-seg-op-gateway:operacion-20261115'];docker(*args);docker('start',nombre)
    c=json.loads(docker('inspect',nombre))[0];meta['gatewayEnsayo']={'nombre':nombre,'id':c['Id'],'imagen':c['Image'],'config':str(destino)}
    (p/'entorno-parqueaderos.json').write_text(json.dumps(meta,indent=2)+'\n')
    print('Gateway exclusivo actual creado; original detenido e intacto. Misma clave pública, rutas actuales, solo CORS local.')
if __name__=='__main__': main()
