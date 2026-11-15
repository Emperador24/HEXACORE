"""Tres finales del bloque Eventos/Recintos; sin reintentos ni conjuntos anteriores."""
import importlib.util, json, os, pathlib, subprocess, sys
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve(); assert p.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=ROOT,check=True)
    serie = sys.argv[1] if len(sys.argv)>1 else ''
    assert serie in ['', 'normalizada']
    prefijo = 'normalizada-' if serie else ''
    for i in range(1,4): assert not list(p.glob(f'*{prefijo}final-{i}*')), 'Conservar cualquier final previa/interrumpida'
    spec=importlib.util.spec_from_file_location('eventos',HERE/'procedencia-eventos.py')
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);referencia=m.medir()
    for i in range(1,4):
        fase=f'{prefijo}final-{i}';assert m.medir()==referencia,'Fuentes/imágenes distintas'
        (p/('eventos-version-'+fase+'.json')).write_text(json.dumps(referencia,indent=2))
        for nombre,cmd in [('memoria-antes',['python3',str(HERE/'medir.py'),'eventos-'+fase+'-antes']),
                           ('matriz',['node',str(HERE/'eventos-recursos.cjs'),fase]),
                           ('memoria-despues',['python3',str(HERE/'medir.py'),'eventos-'+fase+'-despues'])]:
            r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True)
            (p/('eventos-'+fase+'-'+nombre+'.log')).write_text(r.stdout+r.stderr);print(fase,nombre,r.returncode,flush=True)
            if r.returncode:raise SystemExit('Fallo conservado: diagnosticar, sin repetir finales ni ampliar límites')
        assert m.medir()==referencia
    print('Tres finales de 16 operaciones completadas; no acreditan RNF-05/06 completos.')
if __name__=='__main__':main()
