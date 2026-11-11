const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { PROCEDENCIA_ORIGINAL } = require('../../dist/compartido/persistencia/historia');
const { mapa, raiz } = require('./config.cjs');

// Lista positiva de la procedencia conservada: nunca inferir historia recorriendo
// carpetas actuales, que también contienen migraciones posteriores al corte.
function migracionesOriginales() {
  assert.equal(PROCEDENCIA_ORIGINAL.length, 18);
  assert.equal(new Set(PROCEDENCIA_ORIGINAL.map(m => m.ruta)).size, 18);
  const originales = mapa.flatMap(modulo => {
    const fuentes = PROCEDENCIA_ORIGINAL.filter(m => m.conexion === modulo.conexion);
    assert.equal(fuentes.length, modulo.cantidad, modulo.conexion);
    return fuentes.slice().sort((a,b) => a.ruta.localeCompare(b.ruta)).map(m => {
      assert.ok(m.ruta.startsWith(modulo.modulo + '/persistencia/migraciones/'), 'Propietario histórico incorrecto: ' + m.ruta);
      const contenido = readFileSync(join(raiz, m.ruta), 'utf8');
      assert.equal(/export class (\w+)/.exec(contenido)?.[1], m.nombre, m.ruta);
      assert.equal(createHash('sha256').update(contenido).digest('hex'), m.sha256, m.ruta);
      return { ...m };
    });
  });
  assert.equal(originales.length, 18, 'Procedencia ajena a los ocho propietarios del corte');
  return originales;
}

module.exports = { migracionesOriginales };
