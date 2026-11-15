// Dos peticiones ya autorizadas esperan el mismo candado. Solo cuentas del ámbito vacío.
module.exports=async function(ctx){
  const {c,db,servidor,actor,check,r,canal}=ctx;
  for(const accion of ['desactivar','eliminar']){
    const f=c.fixture(),admins=await db.ds.query("SELECT u.id FROM identidad.usuarios u JOIN identidad.usuarios_roles ur ON ur.usuario_id=u.id JOIN identidad.roles ro ON ro.id=ur.rol_id WHERE ro.nombre='Administrador' AND u.estado='ACTIVA'");
    c.assert.equal(admins.length,2);c.assert(admins.every(a=>[f.actores.admin.id,f.actores.admin2.id].includes(a.id)));
    const aa={...f.actores.admin,...await c.login('admin',servidor)},bb={...f.actores.admin2,...await c.login('admin2',servidor)};
    const motivo='Último administrador '+accion+' '+require('node:crypto').randomUUID();
    const lock=db.ds.createQueryRunner();await lock.connect();await lock.startTransaction();
    let pendientes=[];
    try{
      await lock.query('SELECT pg_advisory_xact_lock($1)',[270280]);
      const peticion=(autor,objetivo)=>c.http(servidor,accion==='eliminar'?'DELETE':'POST','/admin/cuentas/'+objetivo.id+(accion==='desactivar'?'/desactivar':''),autor.token,{motivo});
      pendientes=[peticion(aa,bb),peticion(bb,aa)];
      await c.esperar(async()=>{
        const [{n}]=await db.ds.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%' AND pid<>pg_backend_pid()");return n===2;
      },'Ambas guardas administrativas deben pasar antes de liberar el candado');
      await lock.commitTransaction();
      const respuestas=await Promise.all(pendientes),codigos=respuestas.map(x=>x.estado).sort();
      c.assert.deepEqual(codigos,[200,422]);
      c.assert.equal(respuestas.find(x=>x.estado===422).datos.codigo,'ULTIMO_ADMINISTRADOR');
      const actuales=await db.ds.query('SELECT id,estado,eliminada_en FROM identidad.usuarios WHERE id=ANY($1::uuid[])',[[aa.id,bb.id]]);
      check('último administrador protegido en carrera de '+accion,actuales.filter(a=>a.estado==='ACTIVA').length===1,'concurrencia');
      const audit=await db.ds.query('SELECT cuenta_id,realizada_por,accion FROM identidad.auditoria_cuentas WHERE cuenta_id=ANY($1::uuid[]) AND motivo=$2',[[aa.id,bb.id],motivo]);
      check('solo una mutación/auditoría válida en la carrera '+accion,audit.length===1&&audit[0].cuenta_id!==audit[0].realizada_por,'concurrencia');
      r.observaciones.push({canal,caso:'último administrador '+accion,categoria:'concurrencia',ok:true,respuestas,activos:1,auditorias:audit});
      const baja=actuales.find(a=>a.estado!=='ACTIVA'),vivo=actuales.find(a=>a.estado==='ACTIVA'),sesion=vivo.id===aa.id?aa:bb;
      if(accion==='desactivar'){
        const x=await c.http(servidor,'POST','/admin/cuentas/'+baja.id+'/activar',sesion.token,{motivo:'Restaurar actor propio de la medición'});c.assert.equal(x.estado,200);
      }else{
        const reemplazo=await c.nuevaCuenta(db,'Administrador propio siguiente',['Administrador']);
        const actual=c.fixture(),clave=baja.id===actual.actores.admin.id?'admin':'admin2';actual.actores[clave]=reemplazo;c.guardar('fixture-cierre.json',actual);
      }
    }finally{
      if(lock.isTransactionActive)await lock.rollbackTransaction();await lock.release();
      await Promise.allSettled(pendientes);
    }
  }
};
