const {randomUUID}=require('node:crypto');
const c=require('./comun.cjs');
async function main(){
 c.guarda();const fase=process.argv[2];c.assert(/^(control-contratos|final-[123])$/.test(fase));
 c.assert(!c.fs.existsSync(c.path.join(c.privado(),'complemento-'+fase+'.json')));
 const f=c.leer('fixture.json'),tokens={},controles=[],auxiliares=[];const db=await c.conexion();
 async function login(a,clave=f.clave){const r=await c.peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:a.email,contrasena:clave}});c.assert.equal(r.estado,200);return r.datos.token;}
 for(const a of ['cliente','personal','jefe','ajeno'])tokens[a]=await login(f.actores[a]);
 async function cuenta(){
  const a={id:randomUUID(),email:`${f.codigo}-${randomUUID()}@example.test`.toLowerCase(),clave:f.clave};
  const {cifrarContrasena}=c.cargar(c.path.join(c.backend,'dist/modulos/identidad/comun/contrasenas'));
  const hash=await cifrarContrasena(a.clave);
  await db.ds.transaction(async m=>{
   await m.query("INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,'ACTIVA',now())",[a.id,'Ensayo Seguridad',a.email,hash]);
   await m.query("INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre='Personal'",[a.id]);
  });auxiliares.push(a);c.guardar('auxiliares-'+fase+'.json',auxiliares);return a;
 }
 try{
  for(const canal of ['gateway','directo']){
   const servidor=canal==='gateway'?'http://127.0.0.1:18100':'http://127.0.0.1:13149';
   async function probar(nombre,ruta,metodo,token,cuerpo,esperado,verificar=()=>true){
    const r=await c.peticion('/api/v1'+ruta,{metodo,token,servidor,cuerpo,cabeceras:{'X-Usuario-Id':f.actores.ajeno.id,'X-Usuario-Roles':'Administrador'}});
    const d={nombre,canal,ruta:metodo+' '+ruta.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig,':fixtureId'),estado:r.estado,esperado,ok:r.estado===esperado&&!!verificar(r.datos,r)};controles.push(d);return r;
   }
   for(const a of ['cliente','personal'])await probar('contrato-204-identidad','/sesiones/verificar','GET',tokens[a],undefined,204,(_d,r)=>r.cabeceras['x-usuario-id']===f.actores[a].id);
   const [z]=await db.ds.query('SELECT id FROM personal_logistica.zonas_evento WHERE "eventoId"=$1 AND nombre=$2 LIMIT 1',[f.evento,f.codigo]);c.assert(z,'Zona existente del control anterior');
   const inicio=new Date(Date.now()+86400000).toISOString(),fin=new Date(Date.now()+90000000).toISOString();
   await probar('candidatos-fechas-validas',`/logistica/zonas/${z.id}/candidatos?horaInicio=${encodeURIComponent(inicio)}&horaFin=${encodeURIComponent(fin)}`,'GET',tokens.jefe,undefined,200,d=>Array.isArray(d));
   const a=await cuenta(),datos={usuarioId:a.id,nombre:'Ensayo Empleado',rol:f.codigo+' Entrada',credencial:f.codigo+'-'+randomUUID()};
   await probar('personal-no-crea-jefatura','/logistica/empleados','POST',tokens.personal,datos,403);
   await probar('jefe-crea-ficha-de-cuenta-existente','/logistica/empleados','POST',tokens.jefe,datos,201,d=>d.usuarioId===a.id);
   const t=await login(a),nueva=f.clave+'-Nueva8!';
   const [{hash_contrasena:hashAntes}]=await db.ds.query('SELECT hash_contrasena FROM identidad.usuarios WHERE id=$1',[f.actores.ajeno.id]);
   await probar('clave-solo-del-token','/cuentas/perfil/contrasena','PUT',t,{contrasenaActual:a.clave,contrasenaNueva:nueva},200);
   a.clave=nueva;c.guardar('auxiliares-'+fase+'.json',auxiliares);const renovado=await login(a,nueva);
   const [{hash_contrasena:hashDespues}]=await db.ds.query('SELECT hash_contrasena FROM identidad.usuarios WHERE id=$1',[f.actores.ajeno.id]);
   c.assert.equal(hashAntes,hashDespues,'La clave ajena no cambia con cabeceras falsas');
   await probar('cerrar-sesion-propia','/sesiones/actual','DELETE',renovado,undefined,200);
   await probar('sesion-cerrada-no-lee','/cuentas/perfil','GET',renovado,undefined,401);
   await probar('sesion-ajena-conservada','/cuentas/perfil','GET',tokens.ajeno,undefined,200,d=>d.id===f.actores.ajeno.id);
  }
 }finally{await db.cerrar();}
 const d={fechaUTC:new Date().toISOString(),controles,fallidos:controles.filter(x=>!x.ok).length};c.guardar('complemento-'+fase+'.json',d);
 console.log(JSON.stringify({fase,controles:controles.length,fallidos:d.fallidos,detalleFallos:controles.filter(x=>!x.ok)}));if(d.fallidos)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
