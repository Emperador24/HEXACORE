#!/usr/bin/env python3
"""Exportación por lista explícita de campos. Nunca copiar logs/URLs de negocio.
Conserva cada medición y la pasada fallida; no edita EVIDENCIA.json histórico.
"""
import json, os, pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[4]
HERE = pathlib.Path(__file__).resolve().parent

def main():
    p = pathlib.Path(os.environ['SEGURIDAD_SALIDA']).resolve()
    assert p.is_relative_to(ROOT)
    subprocess.run(['git', 'check-ignore', '--quiet', str(p / 'control')], cwd=ROOT, check=True)
    def leer(n): return json.loads((p / n).read_text())
    def versiones(lock, nombre):
        return sorted(set(v['version'] for k, v in lock['packages'].items()
                          if k == 'node_modules/' + nombre or k.endswith('/node_modules/' + nombre)))
    def cadena(n, prefijo=()):
        if not n.get('name'): return [list(prefijo)]
        ruta = prefijo + (n['name'] + '@' + n['version'],)
        deps = n.get('dependents', [])
        return [r for d in deps for r in cadena(d.get('from', {}), ruta)] if deps else [list(ruta)]
    out = {'fecha': '2026-11-13', 'referencia': '7457e7b', 'cumplimientoRNFCompleto': False,
           'alcance': 'Dependencias portales/tooling y CSP; excluye ampliación semántica, DAST activo, F12 y CU-028',
           'dependencias': {}, 'finales': [], 'negocio': {}}
    rangos = []
    for portal in ['cliente', 'admin']:
        carpeta = ROOT / 'App/frontend' / ('portal-web-' + portal)
        lock = json.loads((carpeta / 'package-lock.json').read_text())
        d = {'antes': {}, 'paquetesContrastados': [], 'cadenasCriticasAntes': []}
        for scope in ['produccion', 'completo']:
            d['antes'][scope] = leer('audit-antes-' + portal + '-' + scope + '.json')['metadata']['vulnerabilities']
        for a in leer('advisories-antes-' + portal + '.json'):
            despues = versiones(lock, a['paquete'])
            propios = [v for v in a['via'] if isinstance(v, dict)]
            d['paquetesContrastados'].append({
                'paquete': a['paquete'], 'severidadNpmAntes': a['severidad'],
                'versionesInstaladasAntes': sorted(set(i['versionInstalada'] for i in a['instalaciones'])),
                'soloDevAntes': all(i['dev'] for i in a['instalaciones']),
                'versionesInstaladasDespues': despues,
                'advisoriesPropios': [{'id': v['source'], 'url': v['url'], 'rango': v['range'], 'severidad': v['severity']} for v in propios],
                'propagadoDesde': [v for v in a['via'] if isinstance(v, str)],
            })
            for v in propios:
                for version in despues:
                    rangos.append({'paquete': a['paquete'], 'version': version, 'rango': v['range']})
        for n in leer('cadenas-antes-' + portal + '.json'):
            d['cadenasCriticasAntes'].extend(cadena(n))
        out['dependencias'][portal] = d
    # Contrastar también los rangos originales, no solo confiar en que el registro
    # siga devolviendo exactamente los mismos advisories al medir después.
    js = """const fs=require('node:fs'),{createRequire}=require('node:module'),path=require('node:path');
const semver=createRequire(path.resolve('App/frontend/portal-web-cliente/package.json'))('semver');
const datos=JSON.parse(fs.readFileSync(0,'utf8'));
const mal=datos.filter(d=>semver.satisfies(d.version,d.rango,{includePrerelease:true}));
console.log(JSON.stringify({comparaciones:datos.length,coincidenciasVulnerables:mal}));"""
    r = subprocess.run(['node', '-e', js], cwd=ROOT, input=json.dumps(rangos), text=True, capture_output=True, check=True)
    out['contrasteRangosOriginales'] = json.loads(r.stdout)
    assert not out['contrasteRangosOriginales']['coincidenciasVulnerables']
    for i in range(1, 4):
        d = leer(f'portales-final-{i}.json')
        c = leer(f'csp-final-{i}.json')
        d['csp'] = [{k: r[k] for k in ['portal', 'version', 'politicaPresente', 'politica', 'estilo',
                   'violacionesAlCargar', 'erroresJavaScript', 'consolaErrores', 'comprobaciones']} for r in c['resultados']]
        out['finales'].append(d)
    for nombre in ['negocio-automatico-inicial', 'cu029-corregido', 'negocio-automatico', 'negocio-visible']:
        d = leer(nombre + '/resultado.json')
        conteos = {'contextos': 0, 'violacionesCSP': 0, 'erroresJavaScript': 0, 'entradasConsola': 0}
        for f in (p / nombre / 'resultados').rglob('csp-consola-privada.json'):
            c = json.loads(f.read_text())
            conteos['contextos'] += c['contextos']; conteos['violacionesCSP'] += len(c['violaciones'])
            conteos['erroresJavaScript'] += len(c['errores']); conteos['entradasConsola'] += len(c['consola'])
        out['negocio'][nombre] = {'inicioUTC': d['stats']['startTime'], 'duracionMs': d['stats']['duration'],
            'aprobados': d['stats']['expected'], 'fallidos': d['stats']['unexpected'], 'omitidos': d['stats']['skipped'],
            'flaky': d['stats']['flaky'], 'trabajadores': d['config']['workers'], 'consola': conteos}
    (HERE / 'PORTALES-CSP-EVIDENCIA.json').write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
    print('Exportación saneada escrita. Revisar diff antes de publicar.')

if __name__ == '__main__': main()
