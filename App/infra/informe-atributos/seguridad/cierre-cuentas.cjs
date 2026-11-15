module.exports=async function(ctx){
  const {c,db,req,caso,check,actor,servidor}=ctx,A='/admin/cuentas',motivo={motivo:'Ensayo exclusivo de autorización'};
  const pendiente=await c.nuevaCuenta(db,'Pendiente del ensayo',['Cliente'],'PENDIENTE_VERIFICACION');
  const baja=await c.nuevaCuenta(db,'Desactivar del ensayo'),borrar=await c.nuevaCuenta(db,'Eliminar del ensayo');
  const sesiones={};for(const a of [baja,borrar])sesiones[a.id]=[await c.login(a),await c.login(a)];
  ctx.objetivos={pendiente,baja,borrar};
  const lista=await caso('listar cuentas existentes','GET',A+'?limite=100',undefined,'admin',200,'GET /admin/cuentas');
  check('listado no publica hash de contraseña',!JSON.stringify(lista).includes(c.fixture().hash)&&!('hashContrasena'in lista));
  await req('otro administrador lista cuentas ajenas','GET',A,'admin2',undefined,200);
  await caso('detalle ajeno existente','GET',A+'/'+baja.id,undefined,'admin',200,'GET /admin/cuentas/:id');
  const activada=await caso('activar pendiente válida','POST',A+'/'+pendiente.id+'/activar',motivo,'admin',200,'POST /admin/cuentas/:id/activar');
  check('activación auditada con identidad real',activada.estado==='ACTIVA'&&(await db.ds.query('SELECT realizada_por FROM identidad.auditoria_cuentas WHERE cuenta_id=$1',[pendiente.id])).every(x=>x.realizada_por===actor('admin').id));
  for(const [accion,obj,metodo,op] of [['desactivar',baja,'POST','POST /admin/cuentas/:id/desactivar'],['eliminar',borrar,'DELETE','DELETE /admin/cuentas/:id']]){
    const ruta=A+'/'+obj.id+(accion==='desactivar'?'/desactivar':'');
    const x=await caso(accion+' cuenta ajena activa',metodo,ruta,motivo,'admin',200,op);
    check(accion+' deja estado y auditoría esperados',x.estado==='DESACTIVADA'&&(accion!=='eliminar'||x.eliminada));
    const audit=await db.ds.query('SELECT realizada_por,sesiones_cerradas FROM identidad.auditoria_cuentas WHERE cuenta_id=$1',[obj.id]);
    check(accion+' audita actor real y ambas sesiones',audit.length===1&&audit[0].realizada_por===actor('admin').id&&audit[0].sesiones_cerradas===2);
    const ss=await db.ds.query('SELECT jti,revocada_en FROM identidad.sesiones WHERE usuario_id=$1',[obj.id]);
    check(accion+' revoca todas en SQL/Redis',ss.length===2&&ss.every(s=>s.revocada_en));
    for(const s of ss)check('revocación compartida de sesión '+accion,await db.redis.exists('sesion-revocada:'+s.jti)===1);
    for(const s of sesiones[obj.id]){
      await req(accion+' token antiguo rechazado por Núcleo','GET','/cuentas/permisos',s,undefined,401);
      await req(accion+' token antiguo rechazado por Boletería','GET','/reventa/mis-entradas',s,undefined,401,{puerta:true});
    }
    const login=await c.http(servidor,'POST','/sesiones',undefined,{email:obj.email,contrasena:c.fixture().clave});
    check(accion+' impide nuevo login',login.estado===(accion==='desactivar'?403:401),'estado');
    if(accion==='eliminar'){
      const [u]=await db.ds.query('SELECT nombre,email,eliminada_en FROM identidad.usuarios WHERE id=$1',[obj.id]);
      check('eliminación conserva id y anonimiza datos',u.nombre==='Cuenta eliminada'&&u.email!==obj.email&&!!u.eliminada_en);
    }
  }
  await req('reactivar cuenta propia del ensayo','POST',A+'/'+baja.id+'/activar','admin',motivo,200);
  await req('reactivar eliminada no es autorización','POST',A+'/'+borrar.id+'/activar','admin',motivo,409,{categoria:'estado'});
  for(const [metodo,sufijo]of [['POST','/desactivar'],['DELETE','']]){
    const x=await req('protección contra auto administración',''+metodo,A+'/'+actor('admin').id+sufijo,'admin',motivo,422,{categoria:'estado'});
    check('rechazo propio explícito',x.codigo==='AUTO_ADMINISTRACION','estado');
  }
  await req('motivo mal formado separado','POST',A+'/'+baja.id+'/desactivar','admin',{motivo:'x'},400,{categoria:'dto'});
  await req('cuenta inexistente separada','GET',A+'/'+require('node:crypto').randomUUID(),'admin',undefined,404,{categoria:'contexto'});
  // Autoridad vigente: solo se altera temporalmente una cuenta creada en esta base vacía.
  const id=actor('admin2').id;
  const pendienteVigente=await c.nuevaCuenta(db,'Pendiente para autoridad vigente',['Cliente'],'PENDIENTE_VERIFICACION');
  const [vinculo]=await db.ds.query("SELECT ur.* FROM identidad.usuarios_roles ur JOIN identidad.roles r ON r.id=ur.rol_id WHERE usuario_id=$1 AND r.nombre='Administrador'",[id]);
  await db.ds.query('DELETE FROM identidad.usuarios_roles WHERE usuario_id=$1 AND rol_id=$2',[id,vinculo.rol_id]);
  try{
    for(const [metodo,ruta,cuerpo]of [['GET',A],['GET',A+'/'+baja.id],['POST',A+'/'+pendienteVigente.id+'/activar',motivo],['POST',A+'/'+baja.id+'/desactivar',motivo],['DELETE',A+'/'+baja.id,motivo]]){
      await req('JWT antiguo no conserva administración tras retirar rol',metodo,ruta,'admin2',cuerpo,403);
    }
    await req('JWT antiguo tampoco administra roles','GET','/admin/roles','admin2',undefined,403);
  }finally{
    await db.ds.query('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id,asignado_en,asignado_por) VALUES($1,$2,$3,$4)',[id,vinculo.rol_id,vinculo.asignado_en,vinculo.asignado_por]);
  }
  await db.ds.query("UPDATE identidad.usuarios SET estado='DESACTIVADA' WHERE id=$1",[id]);
  try{for(const ruta of [A,'/admin/roles'])await req('administrador inactivo no usa sesión vieja', 'GET',ruta,'admin2',undefined,403);}
  finally{await db.ds.query("UPDATE identidad.usuarios SET estado='ACTIVA' WHERE id=$1",[id]);}
  await req('control positivo tras restaurar autoridad del actor propio','GET',A,'admin2',undefined,200);
};
