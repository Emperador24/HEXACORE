"""Tres mediciones seriales; no reintenta una fallida ni cambia los límites de las solicitudes."""
import datetime,json,os,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[4]
SCRIPTS=ROOT/'App/infra/informe-atributos/seguridad'
def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert p.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=ROOT,check=True)
    serie=sys.argv[1] if len(sys.argv)>1 else ''
    assert serie in ['', 'normalizada', 'cierre', 'precisa']
    sufijo='-'+serie if serie else ''
    archivo=p/('finales-cierre'+sufijo+'.json');assert not archivo.exists(),'Conservar toda serie anterior'
    resultado={'inicio':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mediciones':[],'reintentos':0}
    def save():archivo.write_text(json.dumps(resultado,indent=2)+'\n')
    save()
    def ejecutar(args,log):
        with (p/log).open('w') as out: subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True)
    fuentes=None
    for i in range(1,4):
        nombre=(serie+'-' if serie else '')+f'final-{i}'
        antes='antes-'+nombre;despues='despues-'+nombre
        ejecutar(['python3',str(SCRIPTS/'procedencia-cierre.py'),antes],f'procedencia-{antes}.log')
        version=json.loads((p/f'version-{antes}.json').read_text())
        comparable={k:version[k] for k in ['sha','fuentes','arnes','runtime']}
        if fuentes is None:fuentes=comparable
        else:assert comparable==fuentes,'No continuar si cambian fuentes, arnés, imágenes o JS'
        memoria={}
        for etiqueta,cmd in [('host',['vm_stat']),('swap',['sysctl','vm.swapusage'])]:
            r=subprocess.run(cmd,capture_output=True,text=True,check=True);memoria[etiqueta]=r.stdout
        (p/f'memoria-{nombre}.json').write_text(json.dumps(memoria,indent=2)+'\n')
        ejecutar(['node',str(SCRIPTS/'cierre-recursos.cjs'),nombre],nombre+'.log')
        m=json.loads((p/f'cierre-{nombre}.json').read_text())
        assert m['estado']=='APROBADA' and len(m['canales'])==2 and all(len(c['operaciones'])==16 for c in m['canales'])
        ejecutar(['python3',str(SCRIPTS/'procedencia-cierre.py'),despues],f'procedencia-{despues}.log')
        v=json.loads((p/f'version-{despues}.json').read_text())
        assert {k:v[k] for k in comparable}==comparable,'Cambio durante la medición'
        resultado['mediciones'].append({'numero':i,'inicio':m['inicio'],'fin':m['fin'],'duracionMs':m['duracionMs'],'observaciones':len(m['observaciones']),'conservaciones':sum(c['conservaciones'] for c in m['canales']),'estado':m['estado']})
        save();print('Final aprobada:',resultado['mediciones'][-1],flush=True)
    resultado['fin']=datetime.datetime.now(datetime.timezone.utc).isoformat();resultado['estado']='APROBADA';save()
if __name__=='__main__':main()
