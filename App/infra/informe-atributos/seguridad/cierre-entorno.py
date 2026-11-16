"""Añade Boletería y gateway propios al ámbito descartable existente, sin alterar originales."""
import json, os, pathlib, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[4]
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    assert p.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=ROOT,check=True)
    assert subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip() == 'feature/sebastian'
    def docker(*args): return subprocess.check_output(['docker',*args],text=True)
    def inspect(name): return json.loads(docker('inspect',name))[0]
    m = json.loads((p/'entorno-parqueaderos.json').read_text())
    assert not docker('ps','-q','--filter','label=com.docker.compose.project=redash').strip()
    assert m['baseCreadaVacia'] and m['migracionesPreparadas'] and m['vhostCreado']
    def save(): (p/'entorno-parqueaderos.json').write_text(json.dumps(m,indent=2)+'\n')
    def crear(nombre, servicio, imagen, extra):
        assert not docker('ps','-aq','--filter','name=^/'+nombre+'$').strip()
        args=['create','--name',nombre,'--network',m['red'],
              '--label','com.docker.compose.project='+m['proyecto'],
              '--label','com.docker.compose.service='+servicio,
              '--label','hexacore.uso=seguridad-parqueaderos',
              '--label','hexacore.checkout='+str(ROOT),*extra,imagen]
        docker(*args); c=inspect(nombre)
        dato={'nombre':nombre,'id':c['Id'],'imagen':c['Image']}
        m['boleteriaEnsayo' if servicio=='boleteria' else 'gatewayEnsayo']=dato;save()
        docker('start',nombre)
        return dato
    if sys.argv[1]=='boleteria':
        assert not m.get('boleteriaEnsayo')
        b=inspect('hexacore-cu015-sebastian-boleteria-1')
        assert not b['State']['Running'] and b['Config']['Labels']['hexacore.uso']=='cu015'
        assert not docker('ps','-q','--filter','name=^/hexacore-cu015-sebastian-nucleo-1$').strip()
        e=dict(x.split('=',1) for x in b['Config']['Env'])
        core=dict(x.split('=',1) for x in inspect(m['core'])['Config']['Env'])
        for k in ['POSTGRES_BD','REDIS_HOST','REDIS_PUERTO','RABBITMQ_URL']:
            e[k]=core[k]
        assert all('\n' not in v for v in e.values())
        archivo=p/'boleteria-descartable.env'
        archivo.write_text(''.join(k+'='+v+'\n' for k,v in e.items()));archivo.chmod(0o600)
        args=['--init','--network-alias','boleteria','--env-file',str(archivo),'-p','127.0.0.1:13147:3001']
        for v in b['Mounts']:
            assert v['Type']=='bind' and not v['RW']
            args+=['--mount',f"type=bind,source={v['Source']},target={v['Destination']},readonly"]
        crear(m['core']+'-boleteria','boleteria',b['Image'],args)
        print('Boletería propia creada; misma base/Redis/vhost nuevos. Original intacta y detenida.')
    elif sys.argv[1]=='gateway':
        imagen=sys.argv[2]
        assert imagen.startswith(('hexacore-seg-op-gateway:','hexacore-seg-cierre-gateway:'))
        original=inspect(m['gatewayId'])
        assert original['Config']['Labels']['com.docker.compose.project']=='hexacore-cu015-sebastian'
        assert not original['State']['Running']
        if m.get('gatewayEnsayo'):
            assert not m.get('gatewayAntes')
            viejo=inspect(m['gatewayEnsayo']['id']);assert viejo['Id']==m['gatewayEnsayo']['id']
            docker('stop','--time','30',viejo['Id']);cerrado=inspect(viejo['Id'])
            assert cerrado['State']['ExitCode'] in [0,143] and not cerrado['State']['OOMKilled']
            m['gatewayAntes']=m.pop('gatewayEnsayo');save()
        actual=(ROOT/'App/gateway/nginx.conf').read_text()
        previo=(ROOT/'App/infra/revision/.estado-cu015/gateway.conf').read_text()
        patron=r'map \$http_origin \$origen_permitido \{[^}]+\}'
        cors=re.search(patron,previo).group(0)
        conf=re.sub(patron,lambda _:cors,actual)
        assert re.sub(patron,'CORS_LOCAL',conf)==re.sub(patron,'CORS_LOCAL',actual)
        ruta=p/('gateway-corregido.conf' if m.get('gatewayAntes') else 'gateway-previo.conf')
        ruta.write_text(conf)
        args=['-p','127.0.0.1:18100:8080','--mount',f'type=bind,source={ruta},target=/etc/nginx/conf.d/default.conf,readonly']
        for v in original['Mounts']:
            if v['Destination']=='/etc/nginx/claves/jwt-publica.pem':
                assert v['Type']=='bind' and not v['RW']
                args+=['--mount',f"type=bind,source={v['Source']},target={v['Destination']},readonly"]
        crear(m['core']+('-gateway-corregido' if m.get('gatewayAntes') else '-gateway'),'api-gateway',imagen,args)
        print('Gateway exclusivo creado con rutas actuales; solo se conserva el CORS local del render previo.')
    else: raise ValueError('Usa boleteria o gateway <imagen exclusiva>')
if __name__=='__main__': main()
