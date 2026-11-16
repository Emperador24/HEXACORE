"""Tres finales comparables: matriz y SSE en serie, sin reintentos ni históricos completos."""
import importlib.util, json, os, pathlib, subprocess, sys, time
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[3]
def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert p.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=ROOT,check=True)
    serie=sys.argv[1] if len(sys.argv)>1 else '';assert serie in ['', 'normalizada', 'compacta', 'cierre']
    prefijo=serie+'-' if serie else ''
    for i in range(1,4):assert not list(p.glob(f'*{prefijo}final-{i}*')),'Conservar finales incluso interrumpidas'
    spec=importlib.util.spec_from_file_location('operacion',HERE/'procedencia-operacion.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    referencia=m.medir()
    for i in range(1,4):
        fase=f'{prefijo}final-{i}';assert m.medir()==referencia
        (p/('operacion-version-'+fase+'.json')).write_text(json.dumps(referencia,indent=2))
        for nombre,cmd in [('memoria-antes',['python3',str(HERE/'medir.py'),'operacion-'+fase+'-antes']),
                           ('matriz',['node',str(HERE/'operacion-recursos.cjs'),fase]),
                           ('sse',['node',str(HERE/'comprobar-operacion-sse.cjs'),fase]),
                           ('memoria-despues',['python3',str(HERE/'medir.py'),'operacion-'+fase+'-despues'])]:
            # Un único subproceso esperado a la vez: los logins del SSE no pueden
            # alterar las comparaciones completas de identidad de la matriz.
            r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True)
            (p/('operacion-'+fase+'-'+nombre+'.log')).write_text(r.stdout+r.stderr);print(fase,nombre,r.returncode,flush=True)
            if r.returncode:raise SystemExit('Fallo conservado: diagnosticar antes de actuar; sin relanzar ni ampliar límites')
        meta=json.loads((p/'entorno-parqueaderos.json').read_text());limite=time.monotonic()+12
        while True:
            c=json.loads(subprocess.check_output(['docker','inspect',meta['core']]))[0]
            if c['State']['Health']['Status']=='healthy':break
            assert time.monotonic()<limite,'Salud tras SIGTERM';time.sleep(.2)
        assert m.medir()==referencia
    print('Tres finales de las 22 operaciones y ambos SSE completadas; RNF-05/06 parciales.')
if __name__=='__main__':main()
