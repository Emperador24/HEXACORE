// Compose wait puede ignorar la tarea si ya terminó antes de invocarlo.
// docker wait acepta también contenedores terminados y conserva su código real.
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const id = execFileSync('docker', ['compose', '-p', 'hexacore-backend-e2e', '-f', resolve(__dirname, 'docker-compose.e2e.yml'), 'ps', '-a', '-q', 'migracion-pagos'], { encoding: 'utf8' }).trim();
assert.match(id, /^[a-f0-9]+$/, 'Se esperaba exactamente una tarea financiera');
const estado = execFileSync('docker', ['wait', id], { encoding: 'utf8', timeout: 60000 }).trim();
assert.equal(estado, '0', 'La migración financiera no terminó correctamente');
console.log('Migración financiera: salida 0 comprobada, incluso si ya había terminado.');
