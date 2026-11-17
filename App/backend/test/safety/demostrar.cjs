#!/usr/bin/env node
// Usa únicamente el manifiesto privado generado por la suite financiera existente.
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {verificar,cargar,evaluar,centavos}=require('../../herramientas/verificar-transaccion.cjs');
(async()=>{
  const cfg=JSON.parse(readFileSync(process.env.SAFETY_CONFIG,'utf8'));
  assert.equal(cfg.ambito,'ensayo-simulado');
  assert.match(cfg.postgres.database,/^hexacore_(?:\w+_)?e2e$/);
  const op=cfg.operaciones.find(o=>o.tipo==='pedido');assert.ok(op);
  const db=new Client({...cfg.postgres,application_name:'safety-demostracion',connectionTimeoutMillis:5000,query_timeout:5000});
  try{
    await db.connect();
    const antes=await verificar(db,op.tipo,op.id);assert.equal(antes.codigo,0,JSON.stringify(antes));
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    let original;
    try{original=await cargar(db,op.tipo,op.id);}finally{await db.query('ROLLBACK');}
    const doble=structuredClone(original);
    const monto=centavos(doble.libro.monto)+1n;doble.libro.monto=`${monto/100n}.${String(monto%100n).padStart(2,'0')}`;
    const negativo=evaluar(doble);assert.equal(negativo.codigo,1);assert.ok(negativo.errores.includes('IMPORTE_INCOMPATIBLE'));
    const despues=await verificar(db,op.tipo,op.id);assert.equal(despues.codigo,0);
    console.log(JSON.stringify({original:antes,negativoControlado:negativo,originalDespues:despues,proveedorInvocado:false}));
  }finally{await db.end();}
})().catch(()=>{console.error('Demostración Safety incompleta; revisar manifiesto privado y conexión exclusiva.');process.exitCode=3;});
