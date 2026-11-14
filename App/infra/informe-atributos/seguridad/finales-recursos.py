#!/usr/bin/env python3
"""Tres finales comparables de autorización por recurso/DAST, seriales, sin reintentos."""
import importlib.util, json, os, pathlib, subprocess
ROOT=pathlib.Path(__file__).resolve().parents[4]
HERE=pathlib.Path(__file__).resolve().parent

def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert p.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=ROOT,check=True)
    for i in range(1,4):assert not list(p.glob(f'*final-{i}*')),'No sobrescribir finales/una ejecución interrumpida'
    spec=importlib.util.spec_from_file_location('procedencia',HERE/'procedencia-recursos.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    referencia=m.medir()
    for i in range(1,4):
        fase=f'final-{i}';meta=m.medir();assert meta==referencia,'Cambió versión, imagen o fuente entre pasadas'
        (p/('version-'+fase+'.json')).write_text(json.dumps(meta,indent=2))
        pasos=[('memoria-antes',['python3',str(HERE/'medir.py'),fase+'-antes']),
               ('matriz',['node',str(HERE/'recursos.cjs'),fase]),
               ('complemento',['node',str(HERE/'complemento-recursos.cjs'),fase]),
               ('filtros',['node',str(HERE/'filtros-recursos.cjs')]),
               ('dast',['python3',str(HERE/'zap-activo.py'),fase]),
               ('memoria-despues',['python3',str(HERE/'medir.py'),fase+'-despues'])]
        for nombre,cmd in pasos:
            r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True)
            (p/(fase+'-'+nombre+'.log')).write_text(r.stdout+r.stderr)
            print(fase,nombre,r.returncode,flush=True)
            if r.returncode:raise SystemExit('Fallo: conservar evidencia, diagnosticar antes de cualquier repetición')
            if nombre=='filtros':
                # La herramienta es lectura; cada pasada conserva también su resultado individual.
                (p/('filtros-'+fase+'.json')).write_bytes((p/'filtros-nul-http.json').read_bytes())
        a=json.loads((p/('recursos-'+fase+'.json')).read_text());b=json.loads((p/('complemento-'+fase+'.json')).read_text());z=json.loads((p/('zap-activo-'+fase+'.json')).read_text())
        d={'fase':fase,'version':meta,'matriz':len(a['controles']),'complemento':len(b['controles']),
           'fallos':a['fallidos']+b['fallidos'],'dastPeticiones':sum(e['peticiones'] for e in z['escenarios']),
           'alertas':len(z['alertas'])}
        (p/('resultado-'+fase+'.json')).write_text(json.dumps(d,indent=2));print(json.dumps(d,default=str)[:240],flush=True)
    print('Tres finales registradas; cobertura limitada explícita, no acreditación RNF completa.')

if __name__=='__main__':main()
