module.exports=async function(ctx){
  const {c,db,req,caso,check,actor,servidor}=ctx,A='/admin/roles';
  const nombre=c.fixture().codigo+' '+require('node:crypto').randomUUID().slice(0,7);
  const modulos=['eventos','personal','parqueaderos','emergencias','reportes'],permisos=modulos.map(modulo=>({modulo,accion:'leer'}));
  let rol=await caso('crear rol válido sin privilegios administrativos','POST',A,{nombre,permisos},'admin',201,'POST /admin/roles');
  const lista=await caso('listar roles y catálogo','GET',A,undefined,'admin',200,'GET /admin/roles');
  check('catálogo cerrado y roles del sistema',lista.roles.filter(r=>r.delSistema).map(r=>r.nombre).sort().join(',')==='Administrador,Cliente,Organizador,Personal');
  const detalle=await caso('detalle de rol propio existente','GET',A+'/'+rol.id,undefined,'admin',200,'GET /admin/roles/:id');
  check('creación audita actor de sesión',detalle.auditoria.length===1&&detalle.auditoria[0].realizadaPor===actor('admin').nombre);
  const dinamico=await c.nuevaCuenta(db,'Sesión anterior a asignación'),sesion={...dinamico,...await c.login(dinamico,servidor)};
  const e=await c.evento(db,actor('organizador').token,servidor);
  const rutas={eventos:'/eventos',personal:'/logistica/asignaciones?eventoId='+e.evento.id,parqueaderos:'/parqueaderos/eventos/'+e.evento.id+'/zonas',emergencias:'/emergencias/eventos',reportes:'/monitoreo/eventos'};
  for(const ruta of Object.values(rutas))await req('sin permiso antes de asignar: '+ruta,'GET',ruta,sesion,undefined,403);
  await caso('asignar rol a usuario existente','POST',A+'/'+rol.id+'/usuarios',{email:dinamico.email},'admin',200,'POST /admin/roles/:id/usuarios');
  await req('repetición legítima de asignación no duplica auditoría','POST',A+'/'+rol.id+'/usuarios','admin',{email:dinamico.email},200,{conservar:true});
  for(const [modulo,ruta]of Object.entries(rutas))await req('misma sesión recibe permiso en '+modulo,'GET',ruta,sesion,undefined,200);
  rol=await caso('editar matriz con versión vigente','PUT',A+'/'+rol.id,{version:rol.version,permisos:[{modulo:'eventos',accion:'leer'}]},'admin',200,'PUT /admin/roles/:id');
  check('versión del rol avanza una vez',rol.version===2);
  for(const [modulo,ruta]of Object.entries(rutas))await req('misma sesión tras editar '+modulo,'GET',ruta,sesion,undefined,modulo==='eventos'?200:403);
  await req('versión antigua no pisa matriz','PUT',A+'/'+rol.id,'admin',{version:1,permisos},409,{categoria:'estado'});
  const actualizado=await req('restaurar matriz del rol propio','PUT',A+'/'+rol.id,'admin',{version:rol.version,permisos},200);rol=actualizado;
  await caso('retirar rol sin dejar cuenta sin roles','DELETE',A+'/'+rol.id+'/usuarios/'+dinamico.id,undefined,'admin',200,'DELETE /admin/roles/:id/usuarios/:usuarioId');
  for(const ruta of Object.values(rutas))await req('misma sesión pierde rol retirado','GET',ruta,sesion,undefined,403);
  await req('retirada repetida conserva todo','DELETE',A+'/'+rol.id+'/usuarios/'+dinamico.id,'admin',undefined,422,{categoria:'estado'});
  // Antes del retiro se emite un JWT con el rol: no puede recuperarlo una caché ilegible.
  await req('asignar para control de caché vigente','POST',A+'/'+rol.id+'/usuarios','admin',{email:dinamico.email},200);
  const anterior={...dinamico,...await c.login(dinamico,servidor)};
  await req('retirar con token antiguo aún vivo','DELETE',A+'/'+rol.id+'/usuarios/'+dinamico.id,'admin',undefined,200);
  const clave='roles-usuario:'+dinamico.id,valor=await db.redis.get(clave),exp=Number(await db.redis.call('PEXPIRETIME',clave));
  try{
    for(const roto of ['{','', 'null','{}','["Cliente",1]']){
      await db.redis.set(clave,roto,'PXAT',exp);
      const x=await req('roles vigentes ilegibles rechazan sin recuperar JWT','GET','/eventos',anterior,undefined,503,{categoria:'dependencia'});
      check('fallo de roles saneado',x.codigo==='SESIONES_NO_DISPONIBLES'&&!JSON.stringify(x).includes('Redis'),'dependencia');
    }
  }finally{await db.redis.set(clave,valor,'PXAT',exp);}
  await req('retirada sigue vigente tras restaurar formato','GET','/eventos',anterior,undefined,403);
  const inactiva=await c.nuevaCuenta(db,'Cuenta inactiva exclusiva',['Cliente'],'DESACTIVADA');
  await req('asignación exige cuenta activa','POST',A+'/'+rol.id+'/usuarios','admin',{email:inactiva.email},422,{categoria:'estado'});
  const solo=await c.nuevaCuenta(db,'Cuenta con un solo rol',[rol.nombre]),soloSesion={...solo,...await c.login(solo,servidor)};
  await req('retirar único rol no deja cuenta huérfana','DELETE',A+'/'+rol.id+'/usuarios/'+solo.id,'admin',undefined,422,{categoria:'estado'});
  for(const sistema of lista.roles.filter(r=>r.delSistema)){
    for(const [metodo,ruta,cuerpo]of [['PUT',A+'/'+sistema.id,{version:sistema.version,permisos}],['DELETE',A+'/'+sistema.id,{version:sistema.version}],['POST',A+'/'+sistema.id+'/usuarios',{email:dinamico.email}],['DELETE',A+'/'+sistema.id+'/usuarios/'+dinamico.id]]){
      const x=await req('protección del rol del sistema '+sistema.nombre,metodo,ruta,'admin',cuerpo,409,{categoria:'estado'});check('rol del sistema conserva contrato',x.codigo==='ROL_DEL_SISTEMA','estado');
    }
  }
  await req('rol vacío separado de autorización','POST',A,'admin',{nombre:nombre+' V',permisos:[]},422,{categoria:'estado'});
  await req('catálogo inválido separado de autorización','PUT',A+'/'+rol.id,'admin',{version:rol.version,permisos:[{modulo:'pagos',accion:'leer'}]},400,{categoria:'dto'});
  await req('rol inexistente separado','GET',A+'/'+require('node:crypto').randomUUID(),'admin',undefined,404,{categoria:'contexto'});
  await req('usuarios activos impiden eliminar sin destino','DELETE',A+'/'+rol.id,'admin',{version:rol.version},409,{categoria:'estado'});
  await req('destino debe existir','DELETE',A+'/'+rol.id,'admin',{version:rol.version,reasignarA:require('node:crypto').randomUUID()},422,{categoria:'contexto'});
  await req('destino no puede ser el rol eliminado','DELETE',A+'/'+rol.id,'admin',{version:rol.version,reasignarA:rol.id},422,{categoria:'estado'});
  const destino=await c.rol(actor('admin').token,nombre+' D',[{modulo:'reportes',accion:'leer'}],servidor);
  const borrado=await caso('eliminar rol y reasignar en la misma transacción','DELETE',A+'/'+rol.id,{version:rol.version,reasignarA:destino.id},'admin',200,'DELETE /admin/roles/:id');
  check('reasigna solo el usuario propio activo',borrado.reasignados===1);
  await req('token anterior pierde permiso del rol eliminado','GET','/eventos',soloSesion,undefined,403);
  await req('token anterior recibe permiso de destino','GET','/monitoreo/eventos',soloSesion,undefined,200);
  check('matriz eliminada no queda en Redis',await db.redis.exists('permisos-rol:'+rol.nombre)===0);
  const auditoria=await db.ds.query('SELECT accion,realizada_por FROM identidad.auditoria_roles WHERE rol_id=$1 ORDER BY fecha,accion',[rol.id]);
  check('cambios y eliminación auditados con actor real',auditoria.some(x=>x.accion==='ELIMINAR')&&auditoria.every(x=>x.realizada_por===actor('admin').id));
  for(const quien of ['cliente','personal','organizador','admin','propio',soloSesion]){
    const a=typeof quien==='string'?actor(quien):quien;
    const x=await req('permisos propios ignoran identidad manipulada','GET','/cuentas/permisos?usuarioId='+actor('admin').id+'&cuentaId='+actor('admin').id,a,undefined,200,{operacion:'GET /cuentas/permisos',conservar:true});
    const filas=await db.ds.query('SELECT r.nombre FROM identidad.usuarios_roles ur JOIN identidad.roles r ON r.id=ur.rol_id WHERE ur.usuario_id=$1 ORDER BY r.nombre',[a.id]);
    check('permisos corresponden al sub de la sesión',JSON.stringify(x.roles)===JSON.stringify(filas.map(x=>x.nombre)));
  }
  await req('permisos propios sin sesión','GET','/cuentas/permisos',null,undefined,401);
  // Fallo de permiso vigente por tipo Redis incorrecto: solo en el Redis de ensayo.
  const llave='roles-usuario:'+solo.id,respaldo=llave+':respaldo';
  await db.redis.rename(llave,respaldo);await db.redis.lpush(llave,'formato-incorrecto');
  try{await req('Redis no puede leer roles vigentes','GET','/monitoreo/eventos',soloSesion,undefined,503,{categoria:'dependencia'});}
  finally{await db.redis.del(llave);await db.redis.rename(respaldo,llave);}
  // Rechazo real del escritor Redis: EXECABORT no aplica ni DEL ni SADD, SQL revierte.
  const aclAntes=await db.redis.acl('GETUSER','default');
  const comandos=aclAntes[aclAntes.indexOf('commands')+1];
  await db.redis.acl('SETUSER','default','-sadd');
  try{await req('matriz no publicable revierte versión, auditoría y Redis','PUT',A+'/'+destino.id,'admin',{version:destino.version,permisos:[{modulo:'eventos',accion:'leer'}]},503,{categoria:'dependencia'});}
  finally{await db.redis.acl('SETUSER','default','-@all',...comandos.trim().split(/\s+/));}
  check('regla de Redis del ensayo restaurada',JSON.stringify(await db.redis.acl('GETUSER','default'))===JSON.stringify(aclAntes),'dependencia');
};
