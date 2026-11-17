const {test}=require('node:test');
const assert=require('node:assert/strict');
const {esperarGateway}=require('../base-unica/esperar-gateway.cjs');
test('precondición registra fallos de lectura y no envía escrituras',async()=>{
  let n=0;const metodos=[];
  const r=await esperarGateway('http://ensayo/api/v1',{intervaloMs:0,solicitar:async(u,o)=>{metodos.push(o.method);return {status:++n===1?503:200};}});
  assert.deepEqual(r.map(x=>x.estado),[503,200,200]);assert.ok(metodos.every(m=>m==='GET'));
});
test('precondición vencida falla sin permitir comenzar transacciones',async()=>{
  await assert.rejects(esperarGateway('http://ensayo/api/v1',{maxMs:5,intervaloMs:1,solicitar:async()=>({status:503})}),/Gateway no listo/);
});
