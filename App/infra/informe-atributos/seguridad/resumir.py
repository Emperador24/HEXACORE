#!/usr/bin/env python3
"""Publica exclusivamente campos permitidos, nunca copia informes ZAP/audit crudos."""
import collections, json, os, pathlib, subprocess
HERE=pathlib.Path(__file__).resolve().parent
def main():
    p=pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    assert p.is_relative_to(HERE.parents[3])
    subprocess.run(['git','check-ignore','--quiet',str(p/'control')],cwd=HERE.parents[3],check=True)
    def leer(n):return json.loads((p/n).read_text())
    inv=leer('inventario-final.json');rutas=inv['rutas'];referencia=leer('final-1.json');sha=referencia['sha'];fecha=referencia['fecha'][:10]
    expuestas=[r for r in rutas if r['gateway'] and r['gateway']['upstream']==r['programa']+'_http']
    lineas=['# Inventario RNF-06 — '+fecha,'',
      'Fuentes funcionales '+sha+'. Metadatos Nest actuales y locations del gateway; no lista histórica de octubre.',
      '',f"{len(rutas)} operaciones de controlador: {dict(inv['clases'])}.",
      f"{len(expuestas)} operaciones de controlador se enrutan por gateway. Sumando GET /salud del gateway: **{len(expuestas)+1} operaciones expuestas declaradas**.",
      'OPTIONS global es preflight público sin datos de negocio, separado de ese denominador. HEAD implícito no duplica GET.',
      'Boletería GET /api/v1/salud es solo directo; cinco operaciones internas no se enrutan. /_auth es interno de Nginx; Swagger no productivo es diagnóstico directo, no se enruta.',
      '', 'Las 159 operaciones protegidas tienen prueba negativa en ambos canales. Las pruebas de rol explícito cubren 117; una admite los cuatro roles. Las 41 sin metadato de rol se detallan al final.',
      '', '| Programa | Método | Ruta | Clase | Gateway | Guarda / roles |', '|---|---|---|---|---|---|']
    for r in rutas:
        publicada=r in expuestas
        lineas.append('|'+ '|'.join([r['programa'],r['metodo'],'`'+r['ruta']+'`',r['clase'],'sí' if publicada else 'no',', '.join(r['guards'])+' / '+(', '.join(r['roles']) or 'sesión/contexto')])+'|')
    lineas+=['','## Excepciones públicas justificadas','']
    for r in rutas:
        if r['clase']=='publica':lineas.append(f"- `{r['metodo']} {r['ruta']}`: {r['razon']}.")
    lineas+=['','Webhook simulado: HMAC del cuerpo. Stripe: firma propia, proveedor desactivado localmente; solo firma con dobles unitarios, no prueba dinámica Stripe. Salud no devuelve datos de usuario.',
      '', '## Rutas sin metadato de rol explícito','',
      'No se cuenta un 400/404 como prueba de rol. Sesión/perfil y cola se autorizan por identidad/propiedad; ContextoDeLogistica y SoloQuienSupervisa usan organización/ficha y requieren ampliar fixtures para cada combinación. CU-028 dinámico sigue pendiente de Samuel.','']
    for r in rutas:
        if r['clase']=='protegida' and not r['roles']:lineas.append(f"- `{r['metodo']} {r['ruta']}` — {', '.join(r['guards'])}.")
    (HERE/'INVENTARIO.md').write_text('\n'.join(lineas)+'\n')
    finales=[]
    for i in range(1,4):
        n=f'final-{i}';j=leer(n+'.json');z=leer('zap-'+n+'.json');a=leer('audit-'+n+'-resumen.json')
        alertas={}
        for x in z['alertas']:
            k=x['pluginId'];d=alertas.setdefault(k,{'nombre':x['name'],'riesgo':x['risk'],'confianza':x['confidence'],'instancias':0});d['instancias']+=1
        fases={}
        for momento in ['antes','despues']:
            m=leer('memoria-'+n+'-'+momento+'.json')['muestras'];vm={}
            for l in m['vm']['salida'].splitlines():
                if l.startswith(('MemAvailable:','SwapFree:')):k,v=l.split(':');vm[k]=v.strip()
            fases[momento]={'vm':vm,'swapHost':m['swap']['salida'].strip(),'presionHost':m['presion']['salida'].strip().splitlines()[-1]}
        finales.append({'ejecucion':n,'fechaUTC':j['fecha'],'sha':j['sha'],'controles':j['controles'],'aprobados':j['aprobados'],'fallos':j['fallidos'],'porCaso':dict(collections.Counter(x['caso'] for x in j['detalle'])),
          'propiedad':{'controles':len(j['positivos']),'aprobados':sum(x['ok'] for x in j['positivos'])},'PAN_HTTP':{'controles':len(j['financieros']),'aprobados':sum(x['ok'] for x in j['financieros'])},'webhooks':j['webhooks'],'cookies':j['cookies'],'baseDatos':j['baseDatos'],
          'audit':a['resultados'],'zap':{'version':z['version'],'solicitudes':len(z['solicitudes']),'autenticadas200':sum(x['autenticada'] and x['estado']==200 for x in z['solicitudes']),'alertas':alertas,'pendientes':z['pendientes'],'reglasPasivas':len(z['reglas']),'reglasDesactivadas':[x['id'] for x in z['reglas'] if str(x.get('enabled')).lower()=='false'],'activo':False},'memoria':fases})
    d={'fecha':fecha,'fuentesFuncionales':sha,'cumplimientoCompleto':False,'inventario':{'totalControladores':inv['total'],'clases':inv['clases'],'expuestasControladores':len(expuestas),'expuestasConSaludGateway':len(expuestas)+1,'protegidas':159,'rolesIncorrectos':117,'rolesTodosPermitidos':1,'sinMetadatoRol':41,'CU028':'Pendiente Samuel'},
      'complementoSQL':[leer('base-datos-complemento-'+str(i)+'.json') for i in range(1,4)],'notaSQLOriginal':'Las consultas de las finales revisaron solo alimentos/parqueaderos (24 tablas); se conserva esa cobertura parcial. El complemento posterior usa los cinco esquemas registrados y el mismo helper de la matriz corregida.', 'restauracion':({'fechaUTC':leer('estado-restaurado.json')['fechaUTC'],'redashActivos':sum(x['activoFinal'] for x in leer('estado-restaurado.json')['contenedores'] if x['nombre'].startswith('redash')),'CU015Activos':sum(x['activoFinal'] for x in leer('estado-restaurado.json')['contenedores'] if x['nombre'].startswith('hexacore-cu015')),'http':{k:leer('estado-restaurado.json')[k] for k in ['ping','login']}} if (p/'estado-restaurado.json').exists() else {'pendiente':True}), 'versiones':leer('versiones.json'),'imagenes':leer('imagenes-finales.json'),'huellas':leer('fuentes-ejecutadas.json'),'almacenamiento':leer('almacenamiento.json'),'finales':finales}
    (HERE/'EVIDENCIA.json').write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
    print('Exportados INVENTARIO.md y EVIDENCIA.json con campos permitidos; los originales permanecen privados.')
if __name__=='__main__':main()
