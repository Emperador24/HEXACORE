const { test } = require('node:test'), assert = require('node:assert/strict');
const { comparar } = require('./operacion-comun.cjs');
const key = (expiraEn = 1500) => ({ clave: 'fixture', tipo: 'string', valor: 'valor', expiraEn });
const estado = (redis, inicioMs, finMs) => ({ filas: [{ tabla: 'fixture', filas: [{ id: 1 }] }], redis, relojRedis: { inicioMs, finMs } });
test('una expiración dentro del intervalo se registra con el plazo absoluto observado', () => {
  assert.deepEqual(comparar(estado([key()], 1000, 1100), estado([], 1400, 1600)), [{ clave: 'fixture', expiraEn: 1500, observadaHastaMs: 1600 }]);
});
test('no admite borrar antes de vencer el TTL', () => {
  assert.throws(() => comparar(estado([key()], 1000, 1100), estado([], 1200, 1400)));
});
test('conserva la granularidad de milisegundos de PEXPIRETIME frente a TIME', () => {
  const a=estado([key(1500)],1500.874,1500.874),b=estado([],1550.854,1550.854);
  assert.deepEqual(comparar(a,b),[{clave:'fixture',expiraEn:1500,observadaHastaMs:1550.854}]);
});
test('la precisión fraccional no permite borrar una clave vencida antes del milisegundo capturado', () => {
  assert.throws(()=>comparar(estado([key(1499)],1500.874,1500.874),estado([],1550.854,1550.854)));
});
test('no admite borrar una clave sin caducidad', () => {
  assert.throws(() => comparar(estado([key(-1)], 1000, 1100), estado([], 1600, 1700)));
});
test('no admite cambios de valor o TTL de una clave presente', () => {
  for (const cambio of [{ valor: 'otro' }, { expiraEn: 1300 }]) assert.throws(() => comparar(estado([key()], 1000, 1100), estado([{ ...key(), ...cambio }], 1200, 1400)));
});
test('no admite claves nuevas ni cambios SQL aunque otra clave haya caducado', () => {
  assert.throws(() => comparar(estado([key()], 1000, 1100), estado([key(5000)], 1600, 1700)));
  const b = estado([], 1600, 1700); b.filas[0].filas = [];
  assert.throws(() => comparar(estado([key()], 1000, 1100), b));
});
test('no cambia los objetos crudos y rechaza retrocesos de reloj', () => {
  const a = estado([key()], 1000, 1100), b = estado([], 1400, 1600), antes = structuredClone(a);
  comparar(a, b); assert.deepEqual(a, antes);
  assert.throws(() => comparar(b, a));
});
