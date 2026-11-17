const {test} = require('node:test');
const assert = require('node:assert/strict');
const {evaluar, verificar, centavos} = require('../../herramientas/verificar-transaccion.cjs');
function fixture(estado = 'APROBADA', resultado = 'APROBADO') {
  return {operacion: {clave:'ensayo', monto:'1150.25', moneda:'COP', tipo:'COBRO', solicitante:'alimentos', estado, referencia:'pas_ensayo', actor:'actor-ensayo', fecha:'2026-11-16T10:00:00Z'},
    libro: {clave_idempotencia:'ensayo', monto:'1150.25', moneda:'COP', tipo:'COBRO', solicitante:'alimentos', resultado, referencia:'pas_ensayo', intentos:1, creada_en:'2026-11-16T10:00:00Z', actualizada_en:'2026-11-16T10:00:00Z'}};
}
test('aprobación consistente y aritmética decimal exacta', () => {
  assert.equal(evaluar(fixture()).codigo, 0);
  assert.equal(centavos('9999999999.99'), 999999999999n);
  assert.throws(() => centavos('1.001'), /MONTO_INVALIDO/);
});
for (const [campo, valor, codigo] of [['monto','1150.26','IMPORTE_INCOMPATIBLE'], ['moneda','USD','MONEDA_INCOMPATIBLE'], ['referencia','otra','REFERENCIA_INCOMPATIBLE'], ['clave_idempotencia','otra','CLAVE_INCOMPATIBLE'], ['tipo','REEMBOLSO','ORIGEN_INCOMPATIBLE'], ['intentos',0,'INTENTOS_INVALIDOS']]) {
  test(`negativo controlado: ${codigo}; original intacto`, () => {
    const original=fixture(), doble=structuredClone(original); doble.libro[campo]=valor;
    assert.equal(evaluar(doble).codigo, 1); assert.ok(evaluar(doble).errores.includes(codigo));
    assert.equal(evaluar(original).codigo, 0);
  });
}
for (const [negocio, libro, esperado, codigo] of [['RECHAZADA','RECHAZADO','rechazado',0], ['PENDIENTE','PENDIENTE','pendiente',2], ['FALLIDA','INDETERMINADO','incierto',2], ['FALLIDA','APROBADO','incierto',1]]) {
  test(`distingue ${negocio}/${libro}`, () => { const r=evaluar(fixture(negocio,libro)); assert.equal(r.estado,esperado); assert.equal(r.codigo,codigo); });
}
test('ausencia y auditoría incompleta no pasan por éxito', () => {
  assert.equal(evaluar({}).codigo,1);
  const d=fixture(); delete d.operacion.actor; assert.ok(evaluar(d).errores.includes('AUDITORIA_INCOMPLETA'));
});
test('entrada inválida revierte la transacción de solo lectura; nunca escribe ni llama proveedores', async () => {
  const sql=[]; const db={query:async q => {sql.push(q);return {rows:[]};}};
  await assert.rejects(verificar(db,'desconocido','no-uuid'), /TIPO_O_ID_INVALIDO/);
  assert.deepEqual(sql, ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', "SET LOCAL statement_timeout='5000ms'", 'ROLLBACK']);
});
module.exports={fixture};
