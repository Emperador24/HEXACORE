const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const { colasEsperadas, consumosListos } = require('./procesos.cjs');

const externo = colas => runInNewContext('JSON.parse(datos)', {
  datos: JSON.stringify({ conexiones: 1, consumidores: colas.length, colas }),
});

test('reconoce las colas que fetch devuelve desde otro contexto de V8 bajo Jest', () => {
  const metricas = externo(colasEsperadas);
  assert.notEqual(Object.getPrototypeOf(metricas.colas), Array.prototype);
  assert.equal(consumosListos(metricas), true);
});

test('el contexto externo no permite colas ausentes, ajenas, duplicadas ni conexiones extra', () => {
  const duplicadas = [...colasEsperadas];
  duplicadas[0] = duplicadas[1];
  const ajenas = [...colasEsperadas];
  ajenas[0] = 'cola.ajena';
  for (const colas of [colasEsperadas.slice(1), duplicadas.sort(), ajenas.sort(), [...colasEsperadas, colasEsperadas[0]].sort()]) {
    assert.equal(consumosListos(externo(colas)), false);
  }
  const doble = externo(colasEsperadas);
  doble.conexiones = 2;
  assert.equal(consumosListos(doble), false);
});
