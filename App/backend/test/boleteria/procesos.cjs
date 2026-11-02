const { spawn, spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const raiz = resolve(__dirname, '../../../..');
const nombres = ['ventas', 'catalogo', 'cola-virtual', 'postventa', 'acceso-qr'];
const bases = { ventas:'entradas_e2e', catalogo:'catalogo_boleteria_e2e', postventa:'postventa_boleteria_e2e', 'acceso-qr':'acceso_qr_boleteria_e2e' };
const puertos = Object.fromEntries(nombres.map((n,i)=>[n,13091+i]));
const entorno = (nombre='ventas') => ({ ...process.env, NODE_ENV:'test', PUERTO:String(puertos[nombre]), PREFIJO_API:'api/v1',
 POSTGRES_HOST:'127.0.0.1', POSTGRES_PUERTO:'15436', POSTGRES_USUARIO:'boleteria_e2e', POSTGRES_CONTRASENA:'boleteria_e2e', POSTGRES_BASE:bases[nombre],
 REDIS_HOST:'127.0.0.1', REDIS_PUERTO:'16383', RABBITMQ_URL:'amqp://boleteria_e2e:boleteria_e2e@127.0.0.1:15676/boleteria',
 PAGOS_URL:'http://127.0.0.1:13090/api/v1', PAGOS_TIMEOUT_MS:'12000', VENTAS_URL:'http://127.0.0.1:13091/api/v1',
 AUTH_JWT_EMISOR:'hexacore-administracion', AUTH_JWT_CLAVE_PUBLICA_ARCHIVO:resolve(__dirname,'../claves/jwt-publica.pem'),
 TOKEN_SERVICIOS:'boleteria-e2e-servicios', RESERVAS_CRON:'*/1 * * * * *', EXPIRACION_CRON:'*/1 * * * * *', COMPRA_RESERVA_MINUTOS:'2', PGAPPNAME:`referencia-${nombre}` });
async function esperar(accion, limite=15000) {
 const fin=Date.now()+limite;
 while(!await accion()) { if(Date.now()>fin) throw Error('Condición de integración no alcanzada'); await new Promise(r=>setTimeout(r,50)); }
}
async function iniciar() {
 assert.equal(process.version,'v22.22.3');
 const procesos=[];
 try {
  for(const nombre of nombres) {
   const cwd=resolve(raiz,'App/services',nombre), env=entorno(nombre);
   if(bases[nombre]) {
    const m=spawnSync(process.execPath,['node_modules/typeorm/cli.js','migration:run','-d','dist/persistencia/data-source.js'],{cwd,env,encoding:'utf8'});
    assert.equal(m.status,0,`Migración ${nombre}: ${m.stdout}\n${m.stderr}`);
   }
   const hijo=spawn(process.execPath,['dist/main.js'],{cwd,env,stdio:['ignore','pipe','pipe']});
   const p={nombre,hijo,salida:'',url:`http://127.0.0.1:${puertos[nombre]}`};procesos.push(p);
   hijo.stdout.on('data',d=>p.salida+=d);hijo.stderr.on('data',d=>p.salida+=d);
   await esperar(async()=>{
    if(hijo.exitCode!==null||hijo.signalCode!==null)throw Error(p.salida);
    try{return(await fetch(p.url+'/api/v1/salud',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}
   });
  }
  return { procesos, urls:Object.fromEntries(procesos.map(p=>[p.nombre,p.url])) };
 } catch(e) { await cerrar({procesos}); throw e; }
}
async function cerrar({procesos}) {
 const fallos=[];mkdirSync(resolve(raiz,'App/backend/.evidencia-e2e'),{recursive:true});
 for(const p of [...procesos].reverse()) {
  if(p.hijo.exitCode===null&&p.hijo.signalCode===null) {
   let forzado=false;
   const salida=new Promise(r=>p.hijo.once('exit',r));
   const timer=setTimeout(()=>{forzado=true;p.hijo.kill('SIGKILL');},5000);
   p.hijo.kill('SIGTERM');await salida;clearTimeout(timer);
   if(forzado)fallos.push(`${p.nombre}: SIGKILL necesario`);
  }
  writeFileSync(resolve(raiz,`App/backend/.evidencia-e2e/referencia-${p.nombre}.log`),p.salida);
  if(/UnknownElementException|Cierre de RabbitMQ con incidencias/.test(p.salida)) fallos.push(`${p.nombre}: error de cierre, ver log`);
 }
 assert.deepEqual(fallos,[]);
}
module.exports={iniciar,cerrar,entorno,bases,puertos,esperar,raiz};
