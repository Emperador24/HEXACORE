"""Publica únicamente metadatos y conteos; nunca copia logs o fixtures del ensayo."""
import json
import os
from pathlib import Path
import re

sha = os.environ['GITHUB_SHA']
assert re.fullmatch(r'[0-9a-f]{40}', sha)
pasos = json.loads(os.environ.get('PASOS_JSON', '{}'))
assert all(re.fullmatch(r'[a-z_]{1,40}', k) and v in ('success', 'failure', 'cancelled', 'skipped', '') for k, v in pasos.items())
informe = {'revision': sha, 'run_id': int(os.environ['GITHUB_RUN_ID']), 'pasos': pasos}
fuente = Path('.evidencia-e2e/unitarias.json')
if fuente.exists():
    contenido = json.loads(fuente.read_text())
    campos = ('numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTotalTestSuites')
    assert all(isinstance(contenido[k], int) and contenido[k] >= 0 for k in campos)
    informe['unitarias'] = {k: contenido[k] for k in campos}
    if pasos.get('unitarias') == 'success':
        assert contenido['numTotalTests'] > 0 and contenido['numPendingTests'] == 0
else:
    informe['unitarias'] = None
    assert pasos.get('unitarias') != 'success', 'Falta informe de una suite declarada aprobada'
Path('.informe-ci').mkdir(exist_ok=True)
Path('.informe-ci/backend.json').write_text(json.dumps(informe, indent=2) + '\n')
print('Resumen público: revisión, resultados de pasos y conteos; sin logs/datos privados.')
