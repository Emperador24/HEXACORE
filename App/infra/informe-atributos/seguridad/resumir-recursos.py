#!/usr/bin/env python3
"""Exporta solo campos permitidos; jamás peticiones, cuerpos, tokens o IDs de fixture."""
import hashlib, json, os, pathlib, re, subprocess, urllib.parse
ROOT=pathlib.Path(__file__).resolve().parents[4]
HERE=pathlib.Path(__file__).resolve().parent

def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve();assert p.is_relative_to(ROOT)
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=ROOT,check=True)
    def leer(n):return json.loads((p/n).read_text())
    inv=leer('inventario-recursos.json');protegidas=[r for r in inv['rutas'] if r['clase']=='protegida']
    origen=ROOT/'App/infra/informe-atributos/seguridad/INVENTARIO.md'
    originales=re.findall(r'^- `([A-Z]+) (.+?)`',origen.read_text().split('## Rutas sin metadato de rol explícito')[1],re.M)
    def resolver(t):
        metodo,ruta=t['ruta'].split(' ',1);ruta='/api/v1'+ruta
        candidatos=[r for r in protegidas if r['metodo']==metodo and re.fullmatch(re.sub(r':[A-Za-z0-9_]+',r'[^/]+',r['ruta']),ruta)]
        assert candidatos,'Control sin ruta declarada: '+t['ruta']
        return max(candidatos,key=lambda r:len(re.sub(r':[A-Za-z0-9_]+','',r['ruta'])))
    out={'fecha':'2026-11-13','referencia':'ec07de2','ciReferencia':43426230483,
         'cumplimientoRNFCompleto':False,'hallazgosAntes':leer('hallazgos-antes.json'),
         'hallazgosDespues':leer('hallazgos-despues.json'),'controlMatrizInicial':{},'finales':[],
         'interlocks':leer('interlocks.json'),'filtroPiloto':leer('dast-control-filtro-resumen.json'),
         'residuosPreviosSinReabrir':{'CSPImagenesMedias':2,'SRIFuentesMedias':8,'informativasSPA':4}}
    inicial=leer('recursos-control.json')
    out['controlMatrizInicial']={'total':len(inicial['controles']),'fallidos':inicial['fallidos'],
         'fallos': [x for x in inicial['controles'] if not x['ok']],
         'causa':'Cuatro expectativas 200 frente a contrato 204 y dos consultas candidatos sin fechas requeridas. Errores del arnés conservados.'}
    cubiertas={};referencia=None
    for i in range(1,4):
        fase=f'final-{i}';a=leer('recursos-'+fase+'.json');b=leer('complemento-'+fase+'.json');z=leer('zap-activo-'+fase+'.json');meta=leer('version-'+fase+'.json')
        if referencia is None:referencia=meta
        assert meta==referencia and not a['fallidos'] and not b['fallidos']
        d={'fase':fase,'fechaMatrizUTC':a['fechaUTC'],'version':meta,'matriz':len(a['controles']),
           'complemento':len(b['controles']),'contextoSinFichaSinAcreditarAutorizacion':sum(not x.get('acreditaAutorizacion',True) for x in a['controles']),
           'fallidos':a['fallidos']+b['fallidos'],'filtrosHttp':leer('filtros-'+fase+'.json'),'dast':[],'memoria':{}}
        for t in a['controles']+b['controles']:
            r=resolver(t);clave=(r['metodo'],r['ruta']);cubiertas.setdefault(clave,set()).add(t['canal'])
        for e in z['escenarios']:
            ruta=urllib.parse.urlsplit(e['ruta']).path
            ruta=re.sub(r'[0-9a-f]{8}-[0-9a-f-]{27}',':establecimientoId',ruta,flags=re.I)
            plugins=[q['Plugin'] for h in e['detalleReglas']['scanProgress'] if isinstance(h,dict) for q in h.get('HostProcess',[])]
            d['dast'].append({'actor':e['actor'],'metodo':e['metodo'],'ruta':ruta,'peticiones':e['peticiones'],
                'estados':e['estados'],'bearerCorrecto':e['bearerCorrecto'],'sesionAntes':e['sesionAntes'],
                'sesionDurante':e['sesionDurante'],'sesionDespues':e['sesionDespues'],
                'reglas':[{'nombre':q[0],'id':q[1],'estado':q[3],'duracionMs':q[4],'peticiones':q[5],'alertas':q[6]} for q in plugins]})
        d['alertasDast']=[{'id':x['pluginId'],'nombre':x['name'],'riesgo':x['risk'],'confianza':x['confidence']} for x in z['alertas']]
        d['pasivasHabilitadas']=len([x for x in z['pasivas'] if x['enabled']=='true'])
        for momento in ['antes','despues']:
            m=leer('memoria-'+fase+'-'+momento+'.json')['muestras']
            vm={l.split(':')[0]:int(l.split()[1]) for l in m['vm']['salida'].splitlines() if l.startswith(('MemAvailable:','SwapFree:'))}
            d['memoria'][momento]={'vmKiB':vm,'swapHost':m['swap']['salida'].strip(),'presionHost':m['presion']['salida'].strip().splitlines()[-1]}
        out['finales'].append(d)
    out['denominadores']={'controladores':inv['total'],'protegidas':len(protegidas),'expuestasIncluidaSaludGateway':173,
        'rutasNuevasEnAmbosCanales':sum(x=={'gateway','directo'} for x in cubiertas.values()),
        'sinRolOriginales':len(originales),'sinRolOriginalesConControlNuevo':sum(tuple(r) in cubiertas for r in originales),
        'sinRolActuales':sum(not r['roles'] for r in protegidas),'operacionesDast':3,'escenariosDast':4}
    assert out['denominadores']['protegidas']==159 and out['denominadores']['sinRolOriginalesConControlNuevo']==41
    out['reglasActivas']=[{k:r[k] for k in ['id','name','enabled']} for r in leer('zap-activo-final-1.json')['reglas']]
    cursos=[]
    for nombre,cantidad in [('11. Safety.pdf',13),('12. Security.pptx',30)]:
        f=pathlib.Path(os.environ['CURSOS_SEGURIDAD_DIR'])/nombre
        cursos.append({'archivo':nombre,'diapositivas':cantidad,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
    out['referenciasCurso']=cursos
    restauracion=leer('restauracion-final.json')
    out['restauracion']={'motorInicialApagado':not leer('motor-inicial.json')['daemonAccesible'],
       'motorFinalApagado':restauracion.get('motorFinalApagado',False),'idsImagenesMontajesConservados':restauracion['idsImagenesMontajesConservados'],
       'redashReanudados':len(restauracion['final']),'httpPrevioApagarMotor':restauracion['http'],
       'postgresListo':restauracion['postgresListo'],'redisPong':restauracion['redisPong'],
       'oomKillAlRestaurar':{c['servicio']:int(next(l.split()[1] for l in c['cgroup'].splitlines() if l.startswith('oom_kill '))) for c in restauracion['final']}}
    (HERE/'RECURSOS-DAST-EVIDENCIA.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    lineas=['# Cobertura por recurso — 13/11/2026','','159 operaciones protegidas; 49 con controles nuevos en ambos canales. Las 41 originalmente sin metadato de rol están incluidas. Cada ruta cubierta tiene un contexto/contrato ejercitado; no significa todas sus combinaciones posibles.','','302 controles de matriz + 30 complementarios por final. Cuatro 404 de ficha ausente se registran como contexto, sin acreditarlos como autorización sobre recursos existentes. Los 404 de pedido ajeno sí usan un pedido cuya existencia/lectura propia 200 se verifica. No se usan 400 de DTO como permiso.','','Las otras 110 rutas mantienen la evidencia anterior de identidad/rol, pero su autorización semántica ampliada queda pendiente. El inventario histórico no se sobrescribe. Dos rutas de asistencia pasan a rol explícito; sin metadato actual: 39.','','| Método | Ruta | Regla efectiva revisada | Nueva prueba por gateway/directo | Ubicación |','|---|---|---|---|---|']
    for r in protegidas:
        regla=', '.join(r['guards'])+'; '+(', '.join(r['roles']) if r['roles'] else 'identidad/contexto del servicio')
        nueva='Sí; contexto probado, combinaciones limitadas' if (r['metodo'],r['ruta']) in cubiertas else 'Pendiente semántica; conservar identidad/rol previos'
        lineas.append('|'+r['metodo']+'|`'+r['ruta']+'`|'+regla+'|'+nueva+'|`App/backend/'+str(r['fuente'])+'`|')
    lineas+=['','## DAST: alcance diferente de la matriz','','Dos familias activas: SQLi 40018 y XSS reflejado 40012; tres operaciones únicas/cuatro escenarios. GET Cartelera filtrado a un evento propio, PATCH perfil con/sin sesión y GET pedidos del establecimiento propio por Personal. Credenciales frescas, comprobadas antes/durante/después; sin Administrador.','',
      'La categoría se fija como límite de datos y se excluye como vector. Solo query/cuerpo JSON; no URI, cookies, cabeceras ni IDs. Contextos exactos, sin recursión/arañas, un hilo. No se ocultan alertas; el resto de reglas activas no se ejecuta y se lista en la evidencia. Se conservan las 62 pasivas.','',
      'Fuera: las otras operaciones, mutaciones generales, compra/pago/reembolso, cancelación/entrega por scanner, administración, cambio de contraseña, correo, webhooks como objetivo activo, AMQP, archivos, SSE, DOM/XSS persistido, SSRF/OOB, RCE, cargas/DoS y terceros. Motivo: efectos irreversibles o alcance/fixtures no definidos; no se declaran cubiertos.','',
      'Organizador/Administrador y jefe local tienen supervisión global por contrato actual. No existe una relación organización-evento que permita demostrar aislamiento de tenant; creadoPor es auditoría. Definir esa frontera sigue pendiente; CU-028 dinámico no se implementa.']
    (HERE/'COBERTURA-RECURSOS.md').write_text('\n'.join(lineas)+'\n')
    print(json.dumps(out['denominadores']))

if __name__=='__main__':main()
