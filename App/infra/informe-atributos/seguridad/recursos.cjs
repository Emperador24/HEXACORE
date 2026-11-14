// Matriz semántica serial sobre recursos existentes de la fixture. Sin reintentos.
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const c=require('./comun.cjs');
async function main(){
 c.guarda();const fase=process.argv[2];c.assert(/^(control|final-[123])$/.test(fase));
 c.assert(!c.fs.existsSync(c.path.join(c.privado(),'recursos-'+fase+'.json')),'No sobrescribir resultados');
 const f=c.leer('fixture.json'),tokens={},controles=[],precondiciones=[];
 for(const [a,u]of Object.entries(f.actores)){
  const r=await c.peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:u.email,contrasena:f.clave}});c.assert.equal(r.estado,200,'Login válido para '+a);tokens[a]=r.datos.token;
 }
 const db=await c.conexion();let canal,servidor;
 const rutaPublica=r=>r.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig,':fixtureId');
 async function pedir(r,actor='jefe',metodo='GET',cuerpo,headers={}){
  return c.peticion('/api/v1'+r,{servidor:canal==='directo'&&r.startsWith('/cola/')?'http://127.0.0.1:13147':servidor,token:tokens[actor],metodo,cuerpo,cabeceras:{'X-Usuario-Id':f.actores.jefe.id,'X-Usuario-Roles':'Administrador',...headers}});
 }
 async function exigir(r,actor='jefe',metodo='GET',cuerpo,estados=[200,201],headers={}){
  const x=await pedir(r,actor,metodo,cuerpo,headers);c.assert(estados.includes(x.estado),`Precondición ${metodo} ${rutaPublica(r)}: ${x.estado}`);precondiciones.push({canal,ruta:metodo+' '+rutaPublica(r),estado:x.estado});return x.datos;
 }
 async function caso(etiqueta,r,actor,metodo='GET',cuerpo,esperados=[200],verificar=()=>true,headers={}){
  const x=await pedir(r,actor,metodo,cuerpo,headers);let evidencia=false;try{evidencia=!!verificar(x.datos,x);}catch{}
  const d={etiqueta,acreditaAutorizacion:etiqueta!=='contexto-sin-ficha',canal,ruta:metodo+' '+rutaPublica(r.split('?')[0]),actor,estado:x.estado,esperados,evidencia,ok:esperados.includes(x.estado)&&evidencia};controles.push(d);
  c.guardar('recursos-'+fase+'-parcial.json',{controles,precondiciones});return x;
 }
 async function supervisado(r,metodo='GET',cuerpo,verificar=()=>true,ok=metodo==='POST'?[201]:[200]){
  for(const a of ['cliente','personal','sinFicha','jefeBaja'])await caso('no-supervisa',r,a,metodo,cuerpo,[403]);
  return caso('ficha-jefe-activa',r,'jefe',metodo,cuerpo,ok,verificar);
 }
 async function turno(actor='personal',comprobar=false){
  const n=++f.recursos.siguienteTurno;c.guardar('fixture.json',f);
  const inicio=new Date(Date.now()+(10+n)*86400000),fin=new Date(+inicio+3600000);
  const cuerpo={empleadoId:f.recursos.empleados[actor].id,eventoId:f.evento,zona:f.codigo,horaInicio:inicio.toISOString(),horaFin:fin.toISOString()};
  if(comprobar)return (await supervisado('/logistica/turnos','POST',cuerpo,d=>!!d.id)).datos;
  return exigir('/logistica/turnos','jefe','POST',cuerpo);
 }
 async function solicitud(){const t=await turno();const s=await exigir(`/logistica/turnos/${t.id}/solicitudes-cambio`,'personal','POST',{motivo:'Cambio exclusivo '+fase});c.assert(s.solicitud?.id);return {t,s:s.solicitud};}
 try{
  for(canal of ['gateway','directo']){
   servidor=canal==='gateway'?'http://127.0.0.1:18100':'http://127.0.0.1:13149';
   // Identidad: nunca se usa la cabecera suplantada como propietario.
   for(const a of ['cliente','ajeno'])await caso('identidad-token','/cuentas/perfil',a,'GET',undefined,[200],d=>d.id===f.actores[a].id);
   const ajenoAntes=await exigir('/cuentas/perfil','ajeno');
   await caso('edicion-solo-propia','/cuentas/perfil','cliente','PATCH',{nombre:'Ensayo Seguridad'},[200],d=>d.id===f.actores.cliente.id);
   await caso('perfil-ajeno-intacto','/cuentas/perfil','ajeno','GET',undefined,[200],d=>d.nombre===ajenoAntes.nombre);
   for(const a of ['cliente','personal']){
    await caso('sesion-propia','/sesiones/actual',a,'GET',undefined,[200],d=>JSON.stringify(d).includes(f.actores[a].id));
    await caso('sesion-verificada','/sesiones/verificar',a,'GET',undefined,[204]);
   }
   // Cola: todo usuario autenticado puede consultar/pedir su propio turno.
   const a=await caso('turno-cola-propio',`/cola/eventos/${f.evento}/turnos`,'cliente','POST',{},[201],d=>!!d.token);
   await caso('turno-cola-distinto',`/cola/eventos/${f.evento}/turnos`,'ajeno','POST',{},[201],d=>!!d.token&&d.token!==a.datos.token);
   await caso('cola-compartida',`/cola/eventos/${f.evento}`,'cliente');
   // Dos establecimientos existentes, dos personales legítimos y clientes distintos.
   const local=f.local,otroLocal=f.recursos.localB.id,pid=f.pedido;
   for(const r of [`/pedidos/establecimientos/${local}/menu`,`/pedidos/establecimientos/${local}/ajustes`,`/pedidos/establecimientos/${local}/pedidos`,`/pedidos/establecimientos/${local}/pedidos/${pid}`]){
    await caso('personal-vinculado',r,'personal');await caso('otro-establecimiento',r,'otroPersonal','GET',undefined,[403]);
   }
   await caso('catalogo-autenticado-compartido',`/pedidos/establecimientos/${local}/productos`,'ajeno');
   await caso('catalogo-evento-compartido',`/pedidos/eventos/${f.evento}/establecimientos`,'cliente','GET',undefined,[200],d=>d.some(x=>x.id===local));
   await caso('pedido-cliente-propio',`/pedidos/mis-pedidos/${pid}`,'cliente');
   await caso('pedido-existente-ajeno',`/pedidos/mis-pedidos/${pid}`,'ajeno','GET',undefined,[404]);
   const headers={'Idempotency-Key':randomUUID()};
   await caso('pago-ajeno-no-admitido',`/pedidos/${pid}/pagos`,'ajeno','POST',{tokenPago:'tok_ok_seguridad'},[404],()=>true,headers);
   // El mismo rol no sustituye la relación: mutación sobre producto existente.
   const prod=await exigir(`/pedidos/establecimientos/${local}/menu`,'personal');const producto=prod.find(x=>x.id===f.producto);c.assert(producto);
   await caso('producto-ajeno-no-editable',`/pedidos/establecimientos/${local}/productos/${f.producto}`,'otroPersonal','PATCH',{activo:producto.activo},[403]);
   await caso('producto-propio-editable',`/pedidos/establecimientos/${local}/productos/${f.producto}`,'personal','PATCH',{activo:producto.activo},[200],d=>d.id===f.producto);
   await caso('local-vinculado-B',`/pedidos/establecimientos/${otroLocal}/menu`,'otroPersonal');
   // Organizador es hoy un rol global, no una asociación de tenant/evento.
   for(const a of ['organizador','organizadorB'])await caso('organizacion-global-contrato',`/pedidos/admin/establecimientos/${local}`,a);
   await caso('rol-no-organiza',`/pedidos/admin/establecimientos/${local}`,'personal','GET',undefined,[403]);
   // Fichas y supervisión efectiva; no se acredita autorización con un DTO roto.
   const emp=f.recursos.empleados.personal.id;
   await supervisado('/logistica/empleados', 'GET',undefined,d=>d.some(e=>e.id===emp));
   await supervisado('/logistica/empleados/'+emp,'GET',undefined,d=>d.empleado.id===emp);
   await supervisado('/logistica/empleados/'+emp,'PATCH',{nombre:f.codigo+' Personal'},d=>d.id===emp);
   for(const [a,estado]of [['personal',200],['otroPersonal',200],['sinFicha',404],['jefeBaja',404]])await caso(estado===404?'contexto-sin-ficha':'ficha-resuelta-por-identidad','/logistica/empleados/yo',a,'GET',undefined,[estado],d=>estado!==200||d.empleado.usuarioId===f.actores[a].id);
   const t=await turno('personal',true),tB=await turno('otroPersonal');
   for(const [a,id,prohibido]of [['personal',t.id,tB.id],['otroPersonal',tB.id,t.id]])await caso('lista-turnos-propios','/logistica/turnos',a,'GET',undefined,[200],d=>d.some(x=>x.id===id)&&!d.some(x=>x.id===prohibido));
   await caso('sin-ficha-no-lista-todo','/logistica/turnos','sinFicha','GET',undefined,[200],d=>d.length===0);
   for(const a of ['personal','jefe'])await caso('responder-por-otro-prohibido',`/logistica/turnos/${tB.id}/respuesta`,a,'POST',{aceptar:true},[403]);
   await caso('responder-propio',`/logistica/turnos/${tB.id}/respuesta`,'otroPersonal','POST',{aceptar:true},[201]);
   await caso('solicitar-cambio-ajeno',`/logistica/turnos/${t.id}/solicitudes-cambio`,'otroPersonal','POST',{motivo:'Ensayo de acceso ajeno'},[403]);
   const sol=await caso('solicitar-cambio-propio',`/logistica/turnos/${t.id}/solicitudes-cambio`,'personal','POST',{motivo:f.codigo+' motivo privado'},[201],d=>!!d.solicitud?.id);c.assert(sol.datos.solicitud?.id);
   const sid=sol.datos.solicitud.id;
   await caso('solicitudes-propias','/logistica/solicitudes-cambio','personal','GET',undefined,[200],d=>d.some(s=>s.id===sid));
   await caso('motivo-no-visible-al-propuesto','/logistica/solicitudes-cambio','otroPersonal','GET',undefined,[200],d=>!d.some(s=>s.id===sid));
   await supervisado(`/logistica/solicitudes-cambio/${sid}/historial`);
   await supervisado(`/logistica/solicitudes-cambio/${sid}/reemplazos`);
   await supervisado(`/logistica/solicitudes-cambio/${sid}/revisar`,'PATCH',{aprobar:false,motivo:'Solo ensayo',supervisorId:f.actores.cliente.id});
   const {s:cancelable}=await solicitud();
   await caso('cancelar-solicitud-ajena',`/logistica/solicitudes-cambio/${cancelable.id}/cancelar`,'otroPersonal','POST',{motivo:'Ensayo'},[403]);
   await caso('cancelar-solicitud-propia',`/logistica/solicitudes-cambio/${cancelable.id}/cancelar`,'personal','POST',{motivo:'Ensayo'},[201]);
   const {s:reemplazo}=await solicitud();
   await exigir(`/logistica/solicitudes-cambio/${reemplazo.id}/revisar`,'jefe','PATCH',{aprobar:true,reemplazoId:f.recursos.empleados.otroPersonal.id});
   for(const a of ['personal','jefe'])await caso('solo-reemplazo-responde',`/logistica/solicitudes-cambio/${reemplazo.id}/respuesta-reemplazo`,a,'POST',{aceptar:true},[403]);
   await caso('reemplazo-asignado-responde',`/logistica/solicitudes-cambio/${reemplazo.id}/respuesta-reemplazo`,'otroPersonal','POST',{aceptar:true},[201]);
   // Asistencia: el operador Personal puede escanear al empleado, el Cliente no.
   const ficha=f.recursos.empleados.personal,ts=new Date(new Date(t.horaInicio).getTime()+60000).toISOString();
   for(const operacion of ['entrada','salida']){
    const cuerpo={credencial:ficha.credencial,eventoId:f.evento,clientTimestamp:ts,idempotencyKey:randomUUID()};
    await caso('cliente-no-registra-asistencia','/logistica/asistencia/'+operacion,'cliente','POST',cuerpo,[403]);
    await caso('punto-control-operativo','/logistica/asistencia/'+operacion,'personal','POST',cuerpo,[201],d=>d.empleadoId===ficha.id);
   }
   await caso('fichajes-propios','/logistica/asistencia','personal','GET',undefined,[200],d=>d.some(r=>r.turnoId===t.id)&&d.every(r=>r.empleadoId===ficha.id));
   await caso('estado-propio','/logistica/asistencia/estado','personal','GET',undefined,[200],d=>d.empleadoId===ficha.id);
   await supervisado('/logistica/asistencia/reporte?eventoId='+f.evento);
   // Las notificaciones se generan por una operación HTTP y el consumidor reales.
   const limite=Date.now()+10000;while(Date.now()<limite){const [n]=await db.ds.query('SELECT id FROM personal_logistica.notificaciones WHERE "turnoId"=$1',[t.id]);if(n)break;await new Promise(r=>setTimeout(r,100));}
   for(const [a,ve]of [['personal',true],['otroPersonal',false],['cliente',false],['sinFicha',false],['jefe',true],['jefeBaja',false]])await caso('notificacion-por-destinatario','/logistica/notificaciones',a,'GET',undefined,[200],d=>d.some(n=>n.turnoId===t.id)===ve);
   // Administración y CU-017: objetos reales antes de probar mutaciones.
   const z=(await supervisado('/logistica/zonas','POST',{eventoId:f.evento,nombre:f.codigo,rolRequerido:ficha.rol,personalRequerido:1},d=>!!d.id)).datos;
   await supervisado('/logistica/zonas?eventoId='+f.evento,'GET',undefined,d=>d.some(x=>x.id===z.id));
   await supervisado('/logistica/personal-disponible?eventoId='+f.evento);
   await supervisado('/logistica/zonas/'+z.id+'/candidatos?horaInicio='+encodeURIComponent(t.horaInicio)+'&horaFin='+encodeURIComponent(t.horaFin));
   await supervisado('/logistica/asignaciones?eventoId='+f.evento);
   const n=++f.recursos.siguienteTurno;c.guardar('fixture.json',f);const inicio=new Date(Date.now()+(10+n)*86400000),fin=new Date(+inicio+3600000);
   const asignada=await supervisado('/logistica/zonas/'+z.id+'/asignaciones','POST',{empleadoId:ficha.id,horaInicio:inicio.toISOString(),horaFin:fin.toISOString()},d=>!!d.turno?.id);c.assert(asignada.datos.turno?.id);
   await supervisado('/logistica/turnos/'+asignada.datos.turno.id+'/reasignar','PATCH',{empleadoId:f.recursos.empleados.otroPersonal.id,horaInicio:inicio.toISOString(),horaFin:fin.toISOString()});
   await supervisado('/logistica/turnos/'+asignada.datos.turno.id+'/cancelar','POST',{motivo:'Fin del ensayo'});
   // Dejar una ficha de ensayo inactiva no elimina datos y permite contrastar revocación.
   await supervisado('/logistica/empleados/'+emp+'/desactivar','POST',{motivo:'Baja temporal de ensayo'});
   await supervisado('/logistica/empleados/'+emp+'/reactivar','POST',undefined);
  }
 }finally{await db.cerrar();}
 const inv=await require('./inventario.cjs').inventario();
 const d={fechaUTC:new Date().toISOString(),sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),denominador:inv.clases.protegida,controles,precondiciones,fallidos:controles.filter(x=>!x.ok).length};
 c.guardar('recursos-'+fase+'.json',d);c.guardar('sesiones-recursos.json',tokens);
 console.log(JSON.stringify({fase,controles:controles.length,fallidos:d.fallidos,detalleFallos:controles.filter(x=>!x.ok)}));if(d.fallidos)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
