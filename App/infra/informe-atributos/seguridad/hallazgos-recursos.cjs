const {randomUUID}=require('node:crypto');
const c=require('./comun.cjs');
async function main(){
 c.guarda();const modo=process.argv[2];c.assert(['antes','despues'].includes(modo));
 c.assert(!c.fs.existsSync(c.path.join(c.privado(),'hallazgos-'+modo+'.json')),'No sobrescribir evidencia');
 const f=c.leer('fixture.json'),tokens={};c.assert(f.recursos.productoB.producto.id);
 for(const a of ['cliente','personal','otroPersonal','jefe']){
  const r=await c.peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:f.actores[a].email,contrasena:f.clave}});c.assert.equal(r.estado,200);tokens[a]=r.datos.token;
 }
 const db=await c.conexion(),controles=[];
 try{
  for(const [indice,canal]of ['gateway','directo'].entries()){
   const servidor=canal==='gateway'?'http://127.0.0.1:18100':'http://127.0.0.1:13149';
   const inicio=new Date(Date.now()+(modo==='antes'?2:5)*86400000+indice*86400000),fin=new Date(+inicio+3600000);
   const t=await c.peticion('/api/v1/logistica/turnos',{metodo:'POST',token:tokens.jefe,servidor,cuerpo:{empleadoId:f.recursos.empleados.personal.id,eventoId:f.evento,zona:f.codigo+' prueba '+modo,horaInicio:inicio.toISOString(),horaFin:fin.toISOString()}});
   c.assert.equal(t.estado,201);const turno=t.datos;
   const limite=Date.now()+10000;let notificacion;
   do{[notificacion]=await db.ds.query('SELECT id FROM personal_logistica.notificaciones WHERE "turnoId"=$1',[turno.id]);if(notificacion)break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<limite);
   c.assert(notificacion,'Precondición: mensaje real consumido y notificación existente');
   for(const [actor,esperado]of [['personal',true],['jefe',true],['cliente',false],['otroPersonal',false]]){
    const r=await c.peticion('/api/v1/logistica/notificaciones',{token:tokens[actor],servidor,cabeceras:{'X-Usuario-Id':f.actores.personal.id,'X-Usuario-Roles':'Administrador'}});
    const visible=Array.isArray(r.datos)&&r.datos.some(n=>n.id===notificacion.id);
    controles.push({ruta:'GET /api/v1/logistica/notificaciones',canal,actor,estado:r.estado,esperadoVisible:esperado,visible,ok:r.estado===200&&visible===esperado});
   }
   for(const operacion of ['entrada','salida']){
    const q='SELECT count(*)::int AS n FROM personal_logistica.registros_asistencia WHERE "turnoId"=$1';
    const [{n:antes}]=await db.ds.query(q,[turno.id]);
    const datos={credencial:f.recursos.empleados.personal.credencial,eventoId:f.evento,clientTimestamp:new Date(+inicio+(operacion==='entrada'?60000:120000)).toISOString(),idempotencyKey:randomUUID()};
    const r=await c.peticion('/api/v1/logistica/asistencia/'+operacion,{metodo:'POST',token:tokens.cliente,servidor,cuerpo:datos});
    const [{n:despues}]=await db.ds.query(q,[turno.id]);
    controles.push({ruta:'POST /api/v1/logistica/asistencia/'+operacion,canal,actor:'cliente',estado:r.estado,esperado:403,filasAgregadas:despues-antes,ok:r.estado===403&&antes===despues});
    const positivo=await c.peticion('/api/v1/logistica/asistencia/'+operacion,{metodo:'POST',token:tokens.personal,servidor,cuerpo:{...datos,idempotencyKey:randomUUID()}});
    controles.push({ruta:'POST /api/v1/logistica/asistencia/'+operacion,canal,actor:'personal',estado:positivo.estado,esperado:201,ok:positivo.estado===201&&positivo.datos.empleadoId===f.recursos.empleados.personal.id});
   }
  }
 }finally{await db.cerrar();}
 c.guardar('hallazgos-'+modo+'.json',{fechaUTC:new Date().toISOString(),controles,fallidos:controles.filter(x=>!x.ok).length});
 console.log(JSON.stringify({modo,controles:controles.length,fallidos:controles.filter(x=>!x.ok)}));if(controles.some(x=>!x.ok))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
