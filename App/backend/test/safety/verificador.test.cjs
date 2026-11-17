const {test} = require('node:test');
const assert = require('node:assert/strict');
const {evaluar, verificar, cargar, centavos} = require('../../herramientas/verificar-transaccion.cjs');
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
for (const [negocio, libro, esperado, codigo] of [['RECHAZADA','RECHAZADO','rechazado',0], ['PENDIENTE',null,'pendiente',2], ['FALLIDA','INDETERMINADO','incierto',2], ['FALLIDA','APROBADO','incierto',1]]) {
  test(`distingue ${negocio}/${libro}`, () => { const d=fixture(negocio,libro); if(libro===null)delete d.libro; const r=evaluar(d); assert.equal(r.estado,esperado); assert.equal(r.codigo,codigo); });
}
test('ausencia y auditoría incompleta no pasan por éxito', () => {
  assert.equal(evaluar({}).codigo,1);
  const d=fixture(); delete d.operacion.actor; assert.ok(evaluar(d).errores.includes('AUDITORIA_INCOMPLETA'));
});
test('checkout cancelado sin cobro no se presenta como aprobado', () => {
  const d=fixture('CANCELADA');delete d.libro;
  const r=evaluar(d);assert.equal(r.estado,'cancelado');assert.equal(r.codigo,0);
});
test('entrada inválida revierte la transacción de solo lectura; nunca escribe ni llama proveedores', async () => {
  const sql=[]; const db={query:async q => {sql.push(q);return {rows:[]};}};
  await assert.rejects(verificar(db,'desconocido','no-uuid'), /TIPO_O_ID_INVALIDO/);
  assert.deepEqual(sql, ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', "SET LOCAL statement_timeout='5000ms'", 'ROLLBACK']);
});
module.exports={fixture};

// Dobles de registros, sin inserciones ni reconstrucción de evidencia real.
// Esta rama no se presenta como una nueva cancelación HTTP/SQL comprobada.
function reembolsoPedido({referencia='pas_original',moneda='COP',faltaCobro=false}={}) {
  const id='11111111-1111-4111-8111-111111111111', fecha='2026-11-16T10:00:00Z';
  const libro={tipo:'REEMBOLSO',clave_idempotencia:'reembolso-ensayo',solicitante:'alimentos',monto:'1150.25',moneda:'COP',resultado:'APROBADO',referencia:'ref_ensayo',intentos:1,creada_en:fecha,actualizada_en:fecha};
  const cancelacion={operacion_id:id,pedido_id:'pedido-ensayo',actor_id:'actor-ensayo',cancelado_en:fecha,reembolso_id:libro.clave_idempotencia,cobro_id:'cobro-ensayo',referencia_cobro:'pas_original',monto:'1150.25',moneda:'COP',estado_reembolso:'APROBADO',referencia_reembolso:libro.referencia,huella:'a'.repeat(64)};
  const db={query:async(sql,valores)=>{
    let fila;
    if(sql.includes('alimentos.cancelaciones_pedido'))fila=cancelacion;
    else if(sql.includes('alimentos.transacciones_pedido'))fila=faltaCobro?undefined:{pedido_id:cancelacion.pedido_id,estado:'APROBADA',referencia_pasarela:referencia,monto:'1150.25',moneda};
    else if(sql.includes('alimentos.pedidos'))fila={estado:'CANCELADO',cancelado_en:fecha};
    else if(sql.includes('finanzas_pagos.transacciones_pago'))fila=valores[0]===libro.clave_idempotencia?libro:{...libro,clave_idempotencia:cancelacion.cobro_id,tipo:'COBRO',resultado:'APROBADO',referencia:'pas_original',moneda};
    else throw new Error('Consulta fuera del doble autorizado');
    return {rows:fila?[fila]:[]};
  }};
  return cargar(db,'reembolso-pedido',id);
}
test('reembolso de pedido con dobles: enlaza original; informa límite del libro',async()=>{
  const r=evaluar(await reembolsoPedido());assert.deepEqual(r.errores,[]);assert.equal(r.codigo,2);
  assert.ok(r.pendientes.includes('LIBRO_NO_PERSISTE_REFERENCIA_COBRO_ORIGINAL'));
});
test('reembolso de pedido con dobles: referencia original ajena se detecta',async()=>{
  const r=evaluar(await reembolsoPedido({referencia:'otro-cobro'}));assert.equal(r.codigo,1);assert.ok(r.errores.includes('COBRO_ORIGINAL_INCOMPATIBLE'));
});
test('reembolso de pedido con dobles: moneda distinta o cobro ausente no pasan',async()=>{
  for(const datos of [{moneda:'USD'},{faltaCobro:true}]){
    const r=evaluar(await reembolsoPedido(datos));assert.equal(r.codigo,1);assert.ok(r.errores.includes('COBRO_ORIGINAL_INCOMPATIBLE'));
  }
});
