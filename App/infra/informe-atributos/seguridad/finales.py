#!/usr/bin/env python3
"""Tres pasadas comparables seriales, nunca reintentos hasta obtener verde."""
import hashlib, json, os, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[4]
HERE=pathlib.Path(__file__).resolve().parent
def main():
    salida=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert salida.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(salida/'control')],cwd=ROOT,check=True)
    for i in range(1,4):
        assert not (salida/f'final-{i}.json').exists(),'No sobrescribir una ejecución final'
    resultados=[]
    for i in range(1,4):
        nombre=f'final-{i}';pasos=[]
        cmds=[('memoria-antes',['python3',str(HERE/'medir.py'),nombre+'-antes']),('autorizacion',['node',str(HERE/'comprobar.cjs'),nombre]),('audit',['python3',str(HERE/'audit.py'),nombre]),('zap',['python3',str(HERE/'zap.py'),nombre]),('memoria-despues',['python3',str(HERE/'medir.py'),nombre+'-despues'])]
        for paso,cmd in cmds:
            r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True)
            (salida/f'{nombre}-{paso}.log').write_text(r.stdout+r.stderr)
            pasos.append({'paso':paso,'codigo':r.returncode});print(nombre,paso,r.returncode,flush=True)
            if r.returncode and not (paso=='audit' and r.returncode==1):
                (salida/'finales-interrumpidos.json').write_text(json.dumps(resultados+[{'ejecucion':nombre,'pasos':pasos}],indent=2));raise SystemExit('Fallo nuevo: diagnosticar antes de continuar; no se repite automáticamente')
        resultados.append({'ejecucion':nombre,'pasos':pasos})
    (salida/'finales.json').write_text(json.dumps(resultados,indent=2))
    # Audit con hallazgos sigue siendo bloqueo aunque la autorización apruebe.
    if any(p['codigo'] for r in resultados for p in r['pasos']):sys.exit(1)
if __name__=='__main__':main()
