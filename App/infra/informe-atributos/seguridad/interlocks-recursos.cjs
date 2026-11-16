// Control dirigido del comportamiento existente, no recuperación F12 ni suite completa.
const {randomUUID,createHash}=require('node:crypto');
const c=require('./comun.cjs');
async function main(){
 c.guarda();c.assert(!c.fs.existsSync(c.path.join(c.privado(),'interlocks.json')),'No repetir un negocio ya medido');
 const recuperar=process.argv[2]==='--recuperar';
 const previo=recuperar?c.leer('interlock-intencion.json'):null;
 if(!recuperar)c.assert(!c.fs.existsSync(c.path.join(c.privado(),'interlock-intencion.json')),'Existe intención: recuperar la misma, no comprar de nuevo');
 const f=c.leer('fixture.json'),tokens={},controles=[];
 for(const a of ['cliente','personal']){const r=await c.peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:f.actores[a].email,contrasena:f.clave}});c.assert.equal(r.estado,200);tokens[a]=r.datos.token;}
 const db=await c.conexion();
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 try{
  let pedido,claveCobro,antes,pago,clave,ruta,cuerpo;
  if(!previo){
  const compra=await c.peticion('/api/v1/pedidos/checkout',{metodo:'POST',token:tokens.cliente,cuerpo:{eventoId:f.evento,establecimientoId:f.local,metodoEntrega:'RECOGER',productos:[{productoId:f.producto,cantidad:1}]}});c.assert.equal(compra.estado,201);pedido=compra.datos.id;claveCobro=randomUUID();
  pago=await c.peticion('/api/v1/pedidos/'+pedido+'/pagos',{metodo:'POST',token:tokens.cliente,cabeceras:{'Idempotency-Key':claveCobro},cuerpo:{tokenPago:'tok_ok_seguridad'}});c.assert.equal(pago.estado,200);c.assert(pago.datos.compraConfirmada);
  const q="SELECT row_to_json(t) AS fila FROM finanzas_pagos.transacciones_pago t WHERE clave_idempotencia=$1";
  antes=hash(await db.ds.query(q,[claveCobro]));
  clave=randomUUID();ruta=`/api/v1/pedidos/establecimientos/${f.local}/pedidos/${pedido}/cancelacion`;cuerpo={version:0,motivo:'Ensayo de interlock',confirmar:true};
  c.guardar('interlock-intencion.json',{pedido,clave,ruta,cuerpo,claveCobro,hashCobroAntes:antes});
  }else{
   ({pedido,clave,ruta,cuerpo,claveCobro}=previo);antes=previo.hashCobroAntes??null;
   const [p]=await db.ds.query('SELECT codigo_qr FROM alimentos.pedidos WHERE id=$1',[pedido]);c.assert(p?.codigo_qr);pago={datos:{codigoQr:p.codigo_qr}};
  }
  const q="SELECT row_to_json(t) AS fila FROM finanzas_pagos.transacciones_pago t WHERE clave_idempotencia=$1";
  if(!claveCobro){const [t]=await db.ds.query("SELECT id FROM alimentos.transacciones_pedido WHERE pedido_id=$1 AND estado='APROBADA'",[pedido]);c.assert(t);claveCobro=t.id;}
  const hashReplayAntes=hash(await db.ds.query(q,[claveCobro]));
  // El arnés descarta el primer resultado y consulta/repite con la misma clave.
  const inicial=await c.peticion(ruta,{metodo:'POST',token:tokens.personal,cabeceras:{'Idempotency-Key':clave},cuerpo});c.assert.equal(inicial.estado,200);c.assert(inicial.datos.operacionId);
  const replay=await c.peticion(ruta,{metodo:'POST',token:tokens.personal,cabeceras:{'Idempotency-Key':clave},cuerpo});
  controles.push({control:'misma-operacion-en-replay',estado:replay.estado,ok:replay.estado===200&&replay.datos.operacionId===inicial.datos.operacionId});
  const vista=await c.peticion('/api/v1/pedidos/mis-pedidos/'+pedido,{token:tokens.cliente});
  controles.push({control:'pedido-cancelado-sin-qr-utilizable',estado:vista.estado,ok:vista.estado===200&&vista.datos.estado==='CANCELADO'&&!vista.datos.codigoQr});
  const detalle=await c.peticion(`/api/v1/pedidos/establecimientos/${f.local}/pedidos/${pedido}`,{token:tokens.personal});c.assert.equal(detalle.estado,200);
  const preparar=await c.peticion(`/api/v1/pedidos/establecimientos/${f.local}/pedidos/${pedido}/preparacion`,{metodo:'POST',token:tokens.personal,cabeceras:{'Idempotency-Key':randomUUID()},cuerpo:{accion:'INICIAR',minutos:10,version:detalle.datos.preparacion.version}});
  controles.push({control:'cancelado-no-prepara-con-version-actual',estado:preparar.estado,ok:preparar.estado===409&&preparar.datos.codigo==='PEDIDO_NO_PREPARABLE'});
  const qr=await c.peticion(`/api/v1/pedidos/establecimientos/${f.local}/entregas/prevalidar`,{metodo:'POST',token:tokens.personal,cuerpo:{codigoQr:pago.datos.codigoQr}});
  controles.push({control:'qr-original-cancelado-no-entregable',estado:qr.estado,ok:qr.estado===409&&qr.datos.codigo==='PEDIDO_CANCELADO'});
  const [{n}]=await db.ds.query('SELECT count(*)::int AS n FROM alimentos.cancelaciones_pedido WHERE pedido_id=$1',[pedido]);
  const libros=await db.ds.query("SELECT t.resultado,t.intentos FROM finanzas_pagos.transacciones_pago t JOIN alimentos.cancelaciones_pedido c ON t.clave_idempotencia=c.reembolso_id::text WHERE c.pedido_id=$1 AND t.tipo='REEMBOLSO'",[pedido]);
  controles.push({control:'una-cancelacion-un-reembolso-un-intento',ok:n===1&&libros.length===1&&libros[0].intentos===1});
  controles.push({control:'cobro-conservado-durante-replay',ok:hashReplayAntes===hash(await db.ds.query(q,[claveCobro]))});
  controles.push({control:'cobro-original-conservado',ok:antes?antes===hash(await db.ds.query(q,[claveCobro])):null,observacion:antes?'Hash conservado':'Hash previo no persistido en el fallo del arnés; no se acredita otra vez; referencia funcional histórica sin cambios'});
  controles.push({control:'reembolso-mostrado-con-evidencia',estadoReembolso:replay.datos.reembolso.estado,estadoLibro:libros[0]?.resultado,
   ok:replay.datos.reembolso.estado!=='APROBADO'||['APROBADO','APROBADA'].includes(libros[0]?.resultado)});
 }finally{await db.cerrar();}
 const d={fechaUTC:new Date().toISOString(),controles,fallidos:controles.filter(x=>x.ok===false).length,pendientes:controles.filter(x=>x.ok===null).length};c.guardar('interlocks.json',d);
 console.log(JSON.stringify(d));if(d.fallidos)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
