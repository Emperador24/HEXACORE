module.exports=async function(ctx){
  const {c,db,req,caso,check,actor,servidor}=ctx;
  const a=await c.evento(db,actor('organizador').token,servidor),b=await c.evento(db,actor('organizador').token,servidor);
  const entrada=e=>c.entrada(db,e,actor('cliente').id),rechazados=['cliente','organizador','propio'];
  const dto=q=>({eventoId:q.eventoId,codigoQr:q.codigo,puntoAcceso:'Puerta exclusiva'});
  for(const quien of ['personal2','admin']){
    const q=await entrada(a);
    const x=await caso('ingreso válido con operador de sesión','POST','/ingresos',dto(q),quien,200,'POST /ingresos',rechazados,{puerta:true});
    check('QR autorizado corresponde a entrada/evento',x.autorizado===true&&x.numeroTicket===q.numero);
    const [fila]=await db.ds.query('SELECT * FROM entradas_acceso_qr.ingresos WHERE entrada_id=$1',[q.id]);
    check('cabeceras falsas no suplantan operador',fila.validado_por===actor(quien).id&&fila.evento_id===a.evento.id&&fila.origen==='EN_LINEA');
    await c.ingresoEstable(db,q.id);
    await req('doble ingreso no consume ni suma aforo','POST','/ingresos',quien,dto(q),409,{puerta:true,categoria:'estado'});
  }
  const valido=await entrada(a),ajeno=await entrada(b);
  const anulada=await c.entrada(db,a,actor('cliente').id,'ANULADA'),reventa=await c.entrada(db,a,actor('cliente').id,'EN_REVENTA');
  for(const quien of ['personal','admin']){
    const x=await caso('caché del evento existente','GET','/ingresos/eventos/'+a.evento.id+'/cache',undefined,quien,200,'GET /ingresos/eventos/:eventoId/cache',rechazados,{puerta:true});
    const esperados=await db.ds.query("SELECT hash_qr FROM entradas_acceso_qr.qr_entradas WHERE evento_id=$1 AND estado='VALIDA' ORDER BY hash_qr",[a.evento.id]);
    check('caché exacta sin QR de otro evento ni estados excluidos',x.eventoId===a.evento.id&&JSON.stringify(x.validos.map(y=>y.hash).sort())===JSON.stringify(esperados.map(y=>y.hash_qr)));
    check('caché solo publica hashes y campos del contrato',x.validos.every(y=>/^[a-f0-9]{64}$/.test(y.hash)&&Object.keys(y).sort().join(',')==='hash,localidadNombre,numeroTicket')&&![valido,ajeno,anulada,reventa].some(q=>JSON.stringify(x).includes(q.codigo)));
  }
  await req('QR válido de A presentado en B','POST','/ingresos','personal',{...dto(valido),eventoId:b.evento.id},404,{puerta:true,categoria:'contexto'});
  for(const q of [anulada,reventa])await req('QR en estado no ingresable','POST','/ingresos','personal',dto(q),404,{puerta:true,categoria:'estado'});
  await req('suplantación en cuerpo se rechaza como DTO sin consumir','POST','/ingresos','personal',{...dto(valido),validadoPor:actor('admin').id},400,{puerta:true,categoria:'dto'});
  for(const quien of ['personal2','admin']){
    const q=await entrada(b),cuerpo={eventoId:b.evento.id,ingresos:[{codigoQr:q.codigo,escaneadoEn:new Date().toISOString(),puntoAcceso:'Offline exclusivo'}]};
    const x=await caso('sincronización válida del evento existente','POST','/ingresos/sincronizacion',cuerpo,quien,200,'POST /ingresos/sincronizacion',rechazados,{puerta:true});
    check('sincronización registra el único ingreso válido',x.registrados===1&&x.conflictos===0);
    const [fila]=await db.ds.query('SELECT * FROM entradas_acceso_qr.ingresos WHERE entrada_id=$1',[q.id]);
    check('offline conserva evento, operador y origen',fila.evento_id===b.evento.id&&fila.validado_por===actor(quien).id&&fila.origen==='SINCRONIZADO');
    await c.ingresoEstable(db,q.id);
    const repetido=await req('reenvío offline legítimo es idempotente en sus efectos','POST','/ingresos/sincronizacion',quien,cuerpo,200,{puerta:true,conservar:true,categoria:'estado'});
    check('reenvío conserva CU-002D sin otro ingreso',repetido.registrados===0&&repetido.conflictos===1&&repetido.resultados[0].resultado==='CU-002D','estado');
  }
  const cruzado={eventoId:b.evento.id,ingresos:[{codigoQr:valido.codigo,escaneadoEn:new Date().toISOString()}]};
  const no=await req('lote offline con QR de otro evento no deja efectos','POST','/ingresos/sincronizacion','personal',cruzado,200,{puerta:true,conservar:true,categoria:'contexto'});
  check('conflicto de asociación explícito',no.registrados===0&&no.conflictos===1&&no.resultados[0].resultado==='CU-002A','contexto');
  const mixto=await entrada(b),antes=await db.ds.query('SELECT * FROM entradas_acceso_qr.qr_entradas WHERE entrada_id=$1',[valido.id]);
  const [{asistentes:aforoA}]=await db.ds.query('SELECT asistentes FROM entradas_acceso_qr.eventos_referencia WHERE evento_id=$1',[a.evento.id]);
  const mix=await req('lote mixto conserva atomicidad por entrada del contrato','POST','/ingresos/sincronizacion','personal2',{eventoId:b.evento.id,ingresos:[{codigoQr:valido.codigo,escaneadoEn:new Date().toISOString(),puntoAcceso:'Offline mixto'},{codigoQr:mixto.codigo,escaneadoEn:new Date().toISOString(),puntoAcceso:'Offline mixto'}]},200,{puerta:true,categoria:'contexto'});
  c.assert.deepEqual(await db.ds.query('SELECT * FROM entradas_acceso_qr.qr_entradas WHERE entrada_id=$1',[valido.id]),antes);
  check('lote mixto solo aplica su entrada válida',mix.registrados===1&&mix.conflictos===1&&(await db.ds.query('SELECT asistentes FROM entradas_acceso_qr.eventos_referencia WHERE evento_id=$1',[a.evento.id]))[0].asistentes===aforoA,'contexto');
  await c.ingresoEstable(db,mixto.id);
  const [{aforo_maximo}]=await db.ds.query('SELECT aforo_maximo FROM entradas_acceso_qr.eventos_referencia WHERE evento_id=$1',[a.evento.id]);
  await db.ds.query('UPDATE entradas_acceso_qr.eventos_referencia SET aforo_maximo=asistentes WHERE evento_id=$1',[a.evento.id]);
  try{const x=await req('aforo lleno no quema QR ni escribe parcialmente','POST','/ingresos','personal',dto(valido),409,{puerta:true,categoria:'estado'});check('conserva conflicto CU-002B',x.codigo==='CU-002B','estado');}
  finally{await db.ds.query('UPDATE entradas_acceso_qr.eventos_referencia SET aforo_maximo=$2 WHERE evento_id=$1',[a.evento.id,aforo_maximo]);}
  const operador=await c.nuevaCuenta(db,'Operador revocado propio',['Personal']),s={...operador,...await c.login(operador,servidor)};
  await req('desactivar operador revoca su sesión','POST','/admin/cuentas/'+operador.id+'/desactivar','admin',{motivo:'Operador de ensayo desactivado'},200);
  await req('sesión revocada no consume QR aún válido','POST','/ingresos',s,dto(valido),401,{puerta:true});
};
