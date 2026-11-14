#!/usr/bin/env python3
"""npm audit serial: JSON completo privado; solo contadores/códigos públicos.
Código 1 de npm significa hallazgos; no se transforma en una aprobación.
"""
import datetime, hashlib, json, os, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[4]
PACKAGES={'backend':'App/backend','cliente':'App/frontend/portal-web-cliente','admin':'App/frontend/portal-web-admin','e2e':'App/e2e','demo-samuel':'App/frontend/demo-playwright'}

def main():
    nombre=sys.argv[1];assert nombre in ['inicial','final-1','final-2','final-3']
    salida=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert salida.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(salida/'control')],cwd=ROOT,check=True)
    resumen=[]
    for paquete,carpeta in PACKAGES.items():
        for tipo,args in [('produccion',['--omit=dev']),('completo',['--include=dev'])]:
            r=subprocess.run(['npm','audit',*args,'--json'],cwd=ROOT/carpeta,capture_output=True,text=True)
            (salida/f'audit-{nombre}-{paquete}-{tipo}.json').write_text(r.stdout)
            (salida/f'audit-{nombre}-{paquete}-{tipo}.stderr').write_text(r.stderr)
            d=json.loads(r.stdout)
            resumen.append({'paquete':paquete,'tipo':tipo,'codigo':r.returncode,'vulnerabilidades':d.get('metadata',{}).get('vulnerabilities'),'error':d.get('error'), 'lockSHA256':hashlib.sha256((ROOT/carpeta/'package-lock.json').read_bytes()).hexdigest()})
    resultado={'fecha':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'resultados':resumen}
    (salida/f'audit-{nombre}-resumen.json').write_text(json.dumps(resultado,indent=2))
    print(json.dumps(resultado,ensure_ascii=False))
    if any(x['error'] or x['vulnerabilidades'] is None for x in resumen):sys.exit(2)
    if any(x['vulnerabilidades']['total'] for x in resumen):sys.exit(1)
if __name__=='__main__':main()
