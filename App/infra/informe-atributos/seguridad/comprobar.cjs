// Una pasada serial. No repite fallos ni guarda cuerpos/identidades en el resumen.
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {guarda,guardar,leer,peticion,conexion,cargar,raiz,fs,path,assert}=require('./comun.cjs');
const {inventario}=require('./inventario.cjs');
async function main(){
 guarda();const nombre=process.argv[2];assert(/^(inicial|final-[123])$/.test(nombre));
 const f=leer('fixture.json'),inv=await inventario(),tokens={};const controles=[],fallos=[];
 async function login(actor,web=false){const r=await peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:f.actores[actor].email,contrasena:f.clave},cabeceras:web?{'X-Hexacore-Cliente':'web'}:{}});assert.equal(r.estado,200,'Precondición login');return r;}
 for(const a of Object.keys(f.actores))tokens[a]=(await login(a)).datos.token;
 const rev=(await login('cliente')).datos.token;
 const turno=await peticion('/api/v1/cola/eventos/'+f.evento+'/turnos',{metodo:'POST',token:rev,cuerpo:{}});assert(turno.datos?.token,'Precondición: turno exclusivo para comprobar revocación');
 assert.equal((await peticion('/api/v1/sesiones/actual',{metodo:'DELETE',token:rev})).estado,200);
 const jwt=cargar('jsonwebtoken'),ahora=Math.floor(Date.now()/1000),claims=jwt.decode(tokens.cliente);
 const exp=jwt.sign({...claims,jti:randomUUID(),iat:ahora-120,exp:ahora-60},fs.readFileSync(path.join(raiz,'App/infra/revision/.estado-cu015/jwt-privada.pem')),{algorithm:'RS256'});
 const casos={sin:null,invalido:'no.es.valido',caducado:exp,revocado:rev};
 function concreta(r){return r.replace(/:([A-Za-z0-9_]+)/g,(_,p)=>({establecimientoId:f.local,eventoId:f.evento,pedidoId:f.pedido,productoId:f.producto,propietarioId:f.actores.cliente.id}[p]??'00000000-0000-4000-8000-000000000001'));}
 async function registrar(r,canal,caso,token,esperados,cabeceras={}){
  const servidor=canal==='gateway'?'http://127.0.0.1:18100':r.programa==='nucleo'?'http://127.0.0.1:13149':'http://127.0.0.1:13147';
  try{const x=await peticion(concreta(r.ruta),{metodo:r.metodo,servidor,token,cabeceras:{...(r.ruta==='/api/v1/compras'&&canal==='gateway'&&caso==='revocado'?{'X-Turno-Cola':turno.datos.token}:{}),...cabeceras},cuerpo:['POST','PATCH','PUT'].includes(r.metodo)?{}:undefined});const c={programa:r.programa,metodo:r.metodo,ruta:r.ruta,canal,caso,estado:x.estado,esperados,ok:esperados.includes(x.estado)};controles.push(c);if(!c.ok)fallos.push(c);}
  catch(e){const c={programa:r.programa,metodo:r.metodo,ruta:r.ruta,canal,caso,error:e.name,ok:false};controles.push(c);fallos.push(c);}
 }
 const protegidas=inv.rutas.filter(r=>r.clase==='protegida'||r.clase==='sin-clasificar');
 for(const r of protegidas){
  for(const canal of ['gateway','directo'])for(const [caso,token]of Object.entries(casos))await registrar(r,canal,caso,token,caso==='revocado'&&canal==='gateway'?[401,403]:[401]);
  await registrar(r,'directo','cabeceras-falsas',null,[401],{'X-Usuario-Id':f.actores.admin.id,'X-Usuario-Roles':'Administrador'});
  if(r.metodo==='GET')await registrar({...r,metodo:'HEAD'},'directo','head-sin-token',null,[401]);
  const prohibido=Object.keys(f.actores).find(a=>r.roles.length&&!r.roles.includes(f.actores[a].rol));
  if(prohibido)for(const canal of ['gateway','directo'])await registrar(r,canal,'rol-incorrecto',tokens[prohibido],[403]);
 }
 for(const r of inv.rutas.filter(r=>r.clase==='interna')){
  await registrar(r,'directo','interna-sin-credencial',null,[401]);
  await registrar(r,'gateway','interna-no-publicada',null,[404]);
  if(r.guards.includes('LlamadaInterna')){
   await registrar(r,'directo','interna-jwt-cliente',tokens.ajeno,[401]);
   await registrar(r,'directo','interna-jwt-admin',tokens.admin,[401]);
   await registrar(r,'directo','interna-servicio-invalido',tokens.cliente,[401],{'X-Token-Servicio':'credencial-invalida','X-Usuario-Roles':'Administrador'});
  }
 }
 const financieros=[];
 for(const [ruta,campo,resto]of [[`/pedidos/${f.pedido}/pagos`,'tokenPago',{}],[`/compras/${f.pedido}/pagar`,'token',{metodoPago:'TARJETA'}],[`/reventa/checkout/${f.pedido}/pagar`,'token',{metodoPago:'TARJETA'}],[`/parqueaderos/reservas/${f.pedido}/pagar`,'token',{}]]){
  const esBoleteria=ruta.startsWith('/compras/')||ruta.startsWith('/reventa/');
  for(const servidor of ['http://127.0.0.1:18100',esBoleteria?'http://127.0.0.1:13147':'http://127.0.0.1:13149']){
   const x=await peticion('/api/v1'+ruta,{servidor,metodo:'POST',token:tokens.cliente,cabeceras:{'Idempotency-Key':randomUUID()},cuerpo:{...resto,[campo]:'4111111111111111'}});
   const c={ruta:ruta.replaceAll(f.pedido,':fixtureId'),servidor,estado:x.estado,esperado:400,ok:x.estado===400};financieros.push(c);if(!c.ok)fallos.push(c);
  }
 }
 const webhooks=[];
 for(const [ruta,esperado,cuerpo]of [['/pagos/webhook',401,{claveIdempotencia:randomUUID(),operacion:'COBRO',resultado:'APROBADO',referencia:'pas_'+randomUUID(),motivo:null}],['/pagos/webhook/stripe',404,{}]]){
  const x=await peticion('/api/v1'+ruta,{metodo:'POST',cuerpo,cabeceras:{'X-Pasarela-Firma':'0'.repeat(64),'Stripe-Signature':'t=0,v1='+ '0'.repeat(64)}});
  const c={ruta,estado:x.estado,esperado,ok:x.estado===esperado};webhooks.push(c);if(!c.ok)fallos.push(c);
 }
 const positivos=[];
 const interna=await peticion('/api/v1/interno/entradas/de/'+f.actores.cliente.id,{servidor:'http://127.0.0.1:13147',cabeceras:{'X-Token-Servicio':process.env.TOKEN_SERVICIOS}});
 positivos.push({ruta:'/api/v1/interno/entradas/de/:propietarioId',actor:'servicio',estado:interna.estado,esperado:200,ok:interna.estado===200});if(interna.estado!==200)fallos.push({internaServicio:interna.estado});
 for(const [ruta,actor,esperado]of [[`/pedidos/mis-pedidos/${f.pedido}`,'cliente',200],[`/pedidos/mis-pedidos/${f.pedido}`,'ajeno',404],[`/pedidos/establecimientos/${f.local}/menu`,'personal',200],[`/pedidos/establecimientos/${f.local}/menu`,'otroPersonal',403],['/cuentas/perfil','cliente',200]]){
  for(const servidor of ['http://127.0.0.1:18100','http://127.0.0.1:13149']){const r=await peticion('/api/v1'+ruta,{token:tokens[actor],servidor,cabeceras:{'X-Usuario-Id':f.actores.cliente.id,'X-Usuario-Roles':'Administrador'}});const c={ruta:ruta.replaceAll(f.pedido,':pedidoId').replaceAll(f.local,':establecimientoId'),actor,servidor,estado:r.estado,esperado,ok:r.estado===esperado};positivos.push(c);if(!c.ok)fallos.push(c);}
 }
 const web=await login('cliente',true),cookie=web.cookie?.split(';')[0];
 const cookies={login:web.estado,httpOnly:/HttpOnly/i.test(web.cookie??''),sameSite:/SameSite=Strict/i.test(web.cookie??''),path:/Path=\/api\/v1\/sesiones(?:;|$)/.test(web.cookie??''),sinRefreshEnCuerpo:!web.datos.tokenRenovacion,secureLocal:/; Secure/i.test(web.cookie??'')};
 const renovar=await peticion('/api/v1/sesiones/renovar',{metodo:'POST',cuerpo:{},cabeceras:{'X-Hexacore-Cliente':'web',Cookie:cookie}});cookies.renovacion=renovar.estado;cookies.rotada=!!renovar.cookie&&renovar.cookie.split(';')[0]!==cookie;
 const replay=await peticion('/api/v1/sesiones/renovar',{metodo:'POST',cuerpo:{},cabeceras:{'X-Hexacore-Cliente':'web',Cookie:cookie}});cookies.replay=replay.estado;
 cookies.replayRevoca=(await peticion('/api/v1/cuentas/perfil',{token:renovar.datos?.token})).estado;
 cookies.cookieNoEsBearer=(await peticion('/api/v1/cuentas/perfil',{cabeceras:{Cookie:cookie}})).estado;
 if(!cookies.httpOnly||!cookies.sameSite||!cookies.path||!cookies.sinRefreshEnCuerpo||cookies.renovacion!==200||!cookies.rotada||cookies.replay!==401||cookies.replayRevoca!==401||cookies.cookieNoEsBearer!==401)fallos.push({cookies});
 const propios=await conexion();let baseDatos;
 try{
  baseDatos=await require('./inspeccionar-base.cjs').inspeccionar((q,v)=>propios.ds.query(q,v));
  if(baseDatos.canarioPAN)fallos.push({almacenamiento:baseDatos.canarioPAN});
 }finally{await propios.cerrar();}
 guardar('sesiones-zap.json',{cliente:tokens.cliente,personal:tokens.personal});
 const resultado={fecha:new Date().toISOString(),sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inventario:{total:inv.total,clases:inv.clases,pendientes:inv.pendientes},rutasProtegidas:protegidas.length,controles:controles.length,aprobados:controles.filter(c=>c.ok).length,fallidos:fallos.length,detalle:controles,positivos,financieros,webhooks,cookies,baseDatos,fallos,rolesPendientes:protegidas.filter(r=>!r.roles.length).map(r=>r.metodo+' '+r.ruta),cu028:'Pendiente Samuel; solo roles fijos'};
 guardar(nombre+'.json',resultado);console.log(JSON.stringify({ejecucion:nombre,operaciones:inv.total,rutas:protegidas.length,controles:resultado.controles,aprobados:resultado.aprobados,fallos:resultado.fallidos,cookies,baseDatos}));if(fallos.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
