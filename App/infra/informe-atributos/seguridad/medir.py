#!/usr/bin/env python3
"""Memoria y estados sin docker inspect completo ni variables/credenciales."""
import datetime, json, os, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[4]
def main():
    nombre=sys.argv[1];assert nombre.replace('-','').isalnum()
    salida=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert salida.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(salida/'control')],cwd=ROOT,check=True)
    muestras={}
    for clave,cmd in [('host',['vm_stat']),('swap',['sysctl','vm.swapusage']),('presion',['memory_pressure','-Q']),('vm',['docker','exec','hexacore-cu015-sebastian-postgres-1','cat','/proc/meminfo'])]:
        r=subprocess.run(cmd,capture_output=True,text=True);muestras[clave]={'codigo':r.returncode,'salida':r.stdout}
    d={'fecha':datetime.datetime.now(datetime.timezone.utc).isoformat(),'muestras':muestras}
    (salida/f'memoria-{nombre}.json').write_text(json.dumps(d,indent=2))
    print(nombre, muestras['swap']['salida'].strip(), muestras['presion']['salida'].strip().splitlines()[-1:])
    print('\n'.join(l for l in muestras['vm']['salida'].splitlines() if l.startswith(('MemAvailable:','SwapFree:'))))
if __name__=='__main__':main()
