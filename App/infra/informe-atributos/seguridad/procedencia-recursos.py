#!/usr/bin/env python3
"""Prueba de fuentes ejecutadas sin inspecciones completas ni configuración pública."""
import hashlib, io, json, pathlib, subprocess, tarfile
ROOT=pathlib.Path(__file__).resolve().parents[4]

def medir():
    assert subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()=='feature/sebastian'
    assert not subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project=redash'],text=True).strip()
    imagenes={}
    for s in ['postgres','redis','rabbitmq','correo','pasarela','nucleo','boleteria','trabajador','api-gateway','portal-web-cliente','portal-web-admin']:
        c=json.loads(subprocess.check_output(['docker','inspect','hexacore-cu015-sebastian-'+s+'-1']))[0]
        assert c['Config']['Labels']['hexacore.uso']=='cu015' and c['State']['Running']
        assert c['State']['Health']['Status']=='healthy'
        imagenes[s]={'imagen':c['Image'],'revisionEtiqueta':c['Config']['Labels'].get('org.opencontainers.image.revision'),
                     'fuenteModificada':c['Config']['Labels'].get('hexacore.fuente.modificada')}
    huellas=[]
    pares=[('nucleo','modulos/personal-logistica/turnos-asistencia/notificaciones.controller.js'),
           ('nucleo','modulos/personal-logistica/turnos-asistencia/asistencia.controller.js'),
           ('boleteria','modulos/entradas/catalogo/cartelera/dto/cartelera.dto.js')]
    for s,f in pares:
        blob=subprocess.check_output(['docker','cp','hexacore-cu015-sebastian-'+s+'-1:/app/dist/'+f,'-'])
        with tarfile.open(fileobj=io.BytesIO(blob)) as t:
            ms=[m for m in t.getmembers() if m.isfile()];assert len(ms)==1;datos=t.extractfile(ms[0]).read()
        a=hashlib.sha256(datos).hexdigest();b=hashlib.sha256((ROOT/'App/backend/dist'/f).read_bytes()).hexdigest()
        assert a==b,'Compilado distinto del ejecutado: '+s
        huellas.append({'programa':s,'archivo':f,'sha256':a,'coincideCompiladoLocal':True})
    versiones={s:subprocess.check_output(['docker','exec','hexacore-cu015-sebastian-'+s+'-1','node','--version'],text=True).strip() for s in ['nucleo','boleteria']}
    return {'sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'imagenes':imagenes,'huellas':huellas,'nodeEjecutado':versiones}

if __name__=='__main__':print(json.dumps(medir(),indent=2))
