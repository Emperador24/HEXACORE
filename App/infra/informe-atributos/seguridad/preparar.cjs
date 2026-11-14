// Crea exclusivamente fixtures SEG; no resiembra ni modifica cuentas existentes.
const {randomUUID,randomBytes}=require('node:crypto');
const {guarda,guardar,privado,fs,path,cargar,backend,conexion,peticion,assert}=require('./comun.cjs');
async function main(){
 guarda();assert(!fs.existsSync(path.join(privado(),'fixture.json')),'Ya existe fixture: no duplicar');
 const c=await conexion();const clave=randomBytes(24).toString('base64url')+'!aA1';const codigo='SEG-'+randomUUID().slice(0,8),actores={};
 try{
  const {cifrarContrasena}=cargar(path.join(backend,'dist/modulos/identidad/comun/contrasenas'));
  const hash=await cifrarContrasena(clave);
  for(const [nombre,rol]of Object.entries({cliente:'Cliente',ajeno:'Cliente',personal:'Personal',otroPersonal:'Personal',organizador:'Organizador',admin:'Administrador'})){
   const id=randomUUID(),email=`${codigo}-${nombre}@example.test`.toLowerCase();
   await c.ds.query('INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,\'ACTIVA\',now())',[id,codigo+' '+nombre,email,hash]);
   await c.ds.query('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre=$2',[id,rol]);actores[nombre]={id,email,rol};
  }
 }finally{await c.cerrar();}
 const fixture={creadaEn:new Date().toISOString(),codigo,clave,actores};guardar('fixture.json',fixture);
 async function entrar(a){const r=await peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:a.email,contrasena:clave}});assert.equal(r.estado,200,'Login fixture');return r.datos.token;}
 const org=await entrar(actores.organizador),per=await entrar(actores.personal),cli=await entrar(actores.cliente);
 async function alta(ruta,token,cuerpo,metodo='POST',cabeceras={}){const r=await peticion('/api/v1'+ruta,{metodo,token,cuerpo,cabeceras});assert([200,201].includes(r.estado),ruta+': '+r.estado);return r.datos;}
 const recinto=await alta('/recintos',org,{nombre:codigo,ciudad:'Bogotá',direccion:'Fixture seguridad',capacidad:50,zonas:[]});
 let e=(await alta('/eventos',org,{nombre:codigo,categoria:'Ensayo seguridad',recintoId:recinto.recinto.id,fechaInicio:new Date(Date.now()+86400000).toISOString(),fechaFin:new Date(Date.now()+90000000).toISOString(),aforoMaximo:50,localidades:[{nombre:'General',precio:1000,cantidad:50}]})).evento;
 e=(await alta('/eventos/'+e.id+'/publicar',org,{version:e.version})).evento;
 const local=await alta('/pedidos/admin/establecimientos',org,{eventoId:e.id,nombre:codigo,contacto:'Fixture seguridad',puntoEntrega:'Fixture',horaApertura:'00:00',horaCierre:'00:00',zonaHoraria:'America/Bogota',estado:'DISPONIBLE'});
 await alta(`/pedidos/admin/establecimientos/${local.id}/personal/${actores.personal.id}`,org,undefined,'PUT');
 const prod=await alta(`/pedidos/establecimientos/${local.id}/productos`,per,{nombre:codigo,descripcion:'Fixture sintética',precio:'1000.25',restriccionesAlimentarias:[],activo:true,cantidadInicial:10},'POST',{'Idempotency-Key':randomUUID()});
 const pedido=await alta('/pedidos/checkout',cli,{eventoId:e.id,establecimientoId:local.id,metodoEntrega:'RECOGER',productos:[{productoId:prod.producto.id,cantidad:1}]});
 const pago=await alta(`/pedidos/${pedido.id}/pagos`,cli,{tokenPago:'tok_ok_seguridad'},'POST',{'Idempotency-Key':randomUUID()});assert.equal(pago.compraConfirmada,true);
 Object.assign(fixture,{evento:e.id,local:local.id,producto:prod.producto.id,pedido:pedido.id});guardar('fixture.json',fixture);
 console.log('Fixture propia creada: seis cuentas, evento, local, producto y pedido pagado; ningún dato demo sobrescrito.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
