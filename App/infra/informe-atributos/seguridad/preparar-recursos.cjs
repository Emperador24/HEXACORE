// Extiende exclusivamente la fixture SEG nueva. Nunca semilla/trunca ni toca cuentas anteriores.
const {randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const c=require('./comun.cjs');
async function main(){
 c.guarda();
 if(!c.fs.existsSync(c.path.join(c.privado(),'fixture.json'))){
  const r=spawnSync(process.execPath,[c.path.join(__dirname,'preparar.cjs')],{env:process.env,stdio:'inherit'});c.assert.equal(r.status,0);
 }
 const f=c.leer('fixture.json');c.assert(!f.recursos,'Preparación ya iniciada: no sobrescribir ni duplicar');
 f.recursos={estado:'EN_CURSO',empleados:{},siguienteTurno:0};c.guardar('fixture.json',f);
 const db=await c.conexion();
 try{
  const {cifrarContrasena}=c.cargar(c.path.join(c.backend,'dist/modulos/identidad/comun/contrasenas'));const hash=await cifrarContrasena(f.clave);
  for(const [nombre,rol]of Object.entries({jefe:'Personal',jefeBaja:'Personal',sinFicha:'Personal',organizadorB:'Organizador',loginDast:'Cliente'})){
   const id=randomUUID(),email=`${f.codigo}-${nombre}@example.test`.toLowerCase();
   await db.ds.transaction(async m=>{
    await m.query("INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,'ACTIVA',now())",[id,f.codigo+' '+nombre,email,hash]);
    await m.query('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre=$2',[id,rol]);
   });
   f.actores[nombre]={id,email,rol};c.guardar('fixture.json',f);
  }
 }finally{await db.cerrar();}
 const tokens={};
 for(const [a,u]of Object.entries(f.actores)){
  const r=await c.peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:u.email,contrasena:f.clave}});c.assert.equal(r.estado,200,'Login exclusivo');tokens[a]=r.datos.token;
 }
 async function alta(ruta,cuerpo,actor='organizador',metodo='POST'){
  const r=await c.peticion('/api/v1'+ruta,{metodo,cuerpo,token:tokens[actor]});c.assert([200,201,204].includes(r.estado),ruta+': '+r.estado);return r.datos;
 }
 for(const a of ['personal','otroPersonal','jefe','jefeBaja']){
  const credencial=f.codigo+'-'+randomUUID();
  f.recursos.empleados[a]=await alta('/logistica/empleados',{usuarioId:f.actores[a].id,nombre:f.codigo+' '+a,rol:a.startsWith('jefe')?'Jefe de personal':f.codigo+' Entrada',credencial});c.guardar('fixture.json',f);
 }
 await alta('/logistica/empleados/'+f.recursos.empleados.jefeBaja.id+'/desactivar',{motivo:'Baja exclusiva para comprobar autorización'});
 f.recursos.localB=await alta('/pedidos/admin/establecimientos',{eventoId:f.evento,nombre:f.codigo+' B',contacto:'Ensayo',puntoEntrega:'Ensayo B',horaApertura:'00:00',horaCierre:'00:00',zonaHoraria:'America/Bogota',estado:'DISPONIBLE'});
 await alta(`/pedidos/admin/establecimientos/${f.recursos.localB.id}/personal/${f.actores.otroPersonal.id}`,undefined,'organizador','PUT');
 f.recursos.productoB=(await c.peticion(`/api/v1/pedidos/establecimientos/${f.recursos.localB.id}/productos`,{metodo:'POST',token:tokens.otroPersonal,cabeceras:{'Idempotency-Key':randomUUID()},cuerpo:{nombre:f.codigo+' B',descripcion:'Solo ensayo',precio:'1000.25',restriccionesAlimentarias:[],activo:true,cantidadInicial:100}})).datos;
 f.recursos.estado='COMPLETA';c.guardar('fixture.json',f);c.guardar('sesiones-recursos.json',tokens);
 console.log('Fixture completa: once cuentas exclusivas, cuatro fichas (una baja), dos establecimientos y productos; proveedores simulados.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
