const {test}=require('node:test'),assert=require('node:assert/strict');
const {backend,cargar,path}=require('./comun.cjs');
test('timeout nativo conserva categoría sin cuerpo/mensaje sensible',async()=>{
 const {PasarelaHttp}=cargar(path.join(backend,'dist/modulos/finanzas/pagos/pasarela-http.service'));
 const {Logger}=cargar('@nestjs/common'),original=global.fetch,errorOriginal=Logger.prototype.error,mensajes=[];
 try{
  Logger.prototype.error=m=>mensajes.push(String(m));
  global.fetch=async()=>{throw new DOMException('4111111111111111 CVV=999','TimeoutError');};
  const p=new PasarelaHttp({pasarelaPagos:{url:'http://proveedor.invalid',timeoutMs:1000}});
  const r=await p.cobrar({claveIdempotencia:'seguridad-timeout',monto:1000,moneda:'COP',token:'tok_ok_seguridad',descripcion:'Fixture'});
  assert.deepEqual(r,{resultado:'INDETERMINADO',referencia:null,motivo:'No hubo respuesta de la pasarela (tiempo agotado)'});
  assert(!JSON.stringify({r,mensajes}).includes('4111111111111111'));assert(!JSON.stringify({r,mensajes}).includes('999'));
 }finally{global.fetch=original;Logger.prototype.error=errorOriginal;}
});
