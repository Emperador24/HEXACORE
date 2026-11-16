// Reutiliza las guardas y el comparador íntegro; solo base/Redis/vhost y actores propios.
const { randomUUID } = require('node:crypto');
const c = require('./operacion-comun.cjs');
const entorno = require('./parqueaderos-entorno.cjs');
const fixture = () => c.leer('fixture-cierre.json');
async function http(servidor, metodo, ruta, token, cuerpo, cabeceras) {
  c.assert(/^\/(admin\/(cuentas|roles)|cuentas\/permisos|ingresos|sesiones|cuentas\/perfil|eventos|recintos|monitoreo|parqueaderos|logistica|emergencias|reventa)(?:\/|\?|$)/.test(ruta));
  return c.peticion('/api/v1' + ruta, { servidor, metodo, token, cuerpo, cabeceras });
}
function guarda() {
  const m = c.guarda();
  c.assert(m.boleteriaEnsayo && m.gatewayEnsayo);
  for (const x of [m.boleteriaEnsayo,m.gatewayEnsayo]) {
    const a=entorno.inspect(x.id);c.assert.equal(a.Image,x.imagen);c.assert(a.State.Running);
    c.assert.equal(a.Config.Labels['com.docker.compose.project'],m.proyecto);
  }
  return m;
}
async function login(actor, servidor=c.base) {
  const f=fixture(), a=typeof actor==='string'?f.actores[actor]:actor;
  const r=await http(servidor,'POST','/sesiones',undefined,{email:a.email,contrasena:f.clave});
  c.assert.equal(r.estado,200,'Login exclusivo '+(typeof actor==='string'?actor:'objetivo'));
  return r.datos;
}
async function nuevaCuenta(db, nombre, roles=['Cliente'], estado='ACTIVA') {
  const f=fixture(), id=randomUUID(), email=(f.codigo+'-'+randomUUID().slice(0,12)+'@example.test').toLowerCase();
  c.assert(['ACTIVA','PENDIENTE_VERIFICACION','DESACTIVADA'].includes(estado));
  await db.ds.transaction(async m=>{
    await m.query('INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,$5,$6)',[id,nombre,email,f.hash,estado,estado==='PENDIENTE_VERIFICACION'?null:new Date()]);
    for(const rol of roles){const r=await m.query('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre=$2 RETURNING rol_id',[id,rol]);c.assert.equal(r.length,1);}
  });
  const a={id,email,nombre,roles};f.cuentas.push(a);c.guardar('fixture-cierre.json',f);return a;
}
async function rol(token, nombre, permisos=[{modulo:'eventos',accion:'leer'}], servidor=c.base) {
  const r=await http(servidor,'POST','/admin/roles',token,{nombre,descripcion:'Ensayo exclusivo de autorización',permisos});c.assert.equal(r.estado,201);return r.datos;
}
async function esperar(consulta, mensaje, plazo=3000) {
  const limite=performance.now()+plazo;
  while(!await consulta()){c.assert(performance.now()<limite,mensaje);await c.esperar(25);}
}
async function capturador(db) {
  const original=await c.capturador(db);
  return async()=>{
    await esperar(async()=>{
      const [{n}]=await db.ds.query(`SELECT (
        (SELECT count(*) FROM entradas_acceso_qr.eventos_salientes WHERE publicado_en IS NULL)+
        (SELECT count(*) FROM entradas_ventas.eventos_salientes WHERE publicado_en IS NULL)
      )::int n`);return n===0;
    },'Precondición: acuses de QR/Ventas pendientes, sin excluirlos de la comparación');
    const x=await original();
    x.secuencias=await db.ds.query("SELECT schemaname,sequencename,last_value FROM pg_sequences WHERE schemaname=ANY($1) ORDER BY schemaname,sequencename",[['identidad','alimentos','personal_logistica','entradas_ventas','entradas_catalogo','entradas_postventa','entradas_acceso_qr','finanzas_pagos','eventos_recintos','operacion','parqueaderos']]);
    return x;
  };
}
async function evento(db, token, servidor=c.base) {
  let x=await http(servidor,'POST','/recintos',token,c.recinto());c.assert.equal(x.estado,201);
  const recinto=x.datos.recinto;
  x=await http(servidor,'POST','/eventos',token,c.evento(recinto));c.assert.equal(x.estado,201);
  const e=x.datos.evento;
  x=await http(servidor,'POST','/eventos/'+e.id+'/publicar',token,{version:e.version});c.assert.equal(x.estado,200);
  await esperar(async()=>{
    const [{n}]=await db.ds.query(`SELECT count(*)::int n FROM entradas_acceso_qr.eventos_referencia a JOIN entradas_ventas.localidades_evento v ON v.evento_id=a.evento_id WHERE a.evento_id=$1`,[e.id]);return n>0;
  },'Proyecciones propias no listas');
  return {evento:e,recinto};
}
async function entrada(db, e, propietarioId, estado='VALIDA') {
  const id=randomUUID(),codigo='SEG-QR-'+randomUUID(),numero='SEG-'+randomUUID().slice(0,20),localidad=e.evento.localidades[0];
  c.assert(['VALIDA','ANULADA','EN_REVENTA'].includes(estado));
  await db.ds.transaction(async m=>{
    await m.query(`INSERT INTO entradas_ventas.entradas(id,evento_id,localidad_id,localidad_nombre,propietario_id,codigo_qr,estado,precio_original,numero_ticket)
      VALUES($1,$2,$3,$4,$5,$6,$7,1000,$8)`,[id,e.evento.id,localidad.id,localidad.nombre,propietarioId,codigo,estado,numero]);
    await m.query(`INSERT INTO entradas_acceso_qr.qr_entradas(entrada_id,evento_id,hash_qr,numero_ticket,localidad_nombre,estado,secuencia)
      VALUES($1,$2,$3,$4,$5,$6,1)`,[id,e.evento.id,c.hash(codigo),numero,localidad.nombre,estado]);
  });
  const f=fixture(),q={id,codigo,numero,eventoId:e.evento.id};f.entradas.push(q);c.guardar('fixture-cierre.json',f);return q;
}
async function ingresoEstable(db,id){
  await esperar(async()=>{
    const [{n}]=await db.ds.query(`SELECT count(*)::int n FROM entradas_ventas.entradas v JOIN entradas_acceso_qr.ingresos q ON q.entrada_id=v.id JOIN operacion.ingresos o ON o.id=q.id WHERE v.id=$1 AND v.estado='USADA'`,[id]);return n===1;
  },'Precondición: efectos de ingreso todavía no convergen');
}
async function aislarBarridos(db){
  const [{n}]=await db.ds.query(`SELECT (
    (SELECT count(*) FROM entradas_ventas.compras WHERE estado='PENDIENTE' AND expira_en<=now())+
    (SELECT count(*) FROM entradas_postventa.publicaciones_reventa WHERE estado='ACTIVA' AND fecha_expiracion<=now())
  )::int n`);c.assert.equal(n,0,'No retener barridos con trabajo de negocio vencido');
  const {GestorConcurrencia}=c.cargar(c.path.join(c.backend,'dist/modulos/entradas/compartido/gestor-concurrencia.service'));
  const gestor=new GestorConcurrencia(db.redis,{reventa:{bloqueoTtlSegundos:120}}),propios=[];
  const liberar=async()=>{for(const [nombre,testigo]of propios.reverse())c.assert(await gestor.liberarTarea(nombre,testigo),'No liberar un candado que dejó de ser propio');};
  try{
    for(const [nombre,ttl]of [['venta-expirar-reservas',50000],['expirar-publicaciones',60000]]){
      let testigo;await esperar(async()=>{testigo=await gestor.bloquearTarea(nombre,ttl);return !!testigo;},'Precondición: barrido no liberó su candado');propios.push([nombre,testigo]);
    }
    return liberar;
  }catch(e){await liberar();throw e;}
}
module.exports={...c,fixture,http,guarda,login,nuevaCuenta,rol,esperar,capturador,evento,entrada,ingresoEstable,aislarBarridos};
