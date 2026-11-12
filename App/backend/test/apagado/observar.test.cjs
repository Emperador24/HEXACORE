const {test}=require('node:test');const assert=require('node:assert/strict');
const {crearRegistro,diagnosticoCapturado}=require('./observar.cjs');
const {spawnSync}=require('node:child_process');
const {spawn}=require('node:child_process');
const http=require('node:http');
const {performance}=require('node:perf_hooks');

test('el reporte de plazo excluye la salida ordinaria y conserva el diagnóstico acotado',()=>{
 const linea='CIERRE_NUCLEO '+JSON.stringify({tipo:'inicio',desdeMs:0,fase:'HTTP.dispose'});
 const privado='Consulta, usuario, mensaje y credencial NO_PUBLICAR';
 assert.equal(diagnosticoCapturado(privado+'\n'+linea+'\n'+privado),linea);
 assert.equal(diagnosticoCapturado(privado),'Sin registros de diagnóstico de cierre');
 assert.equal(diagnosticoCapturado(Array(300).fill(linea).join('\n')).split('\n').length,256);
});

test('captura una fase abierta y recursos antes de los cinco segundos, sin forzar un aprobado',
 {timeout:15000},async()=>{
 const hijo=spawn(process.execPath,['--require',require.resolve('./observar.cjs'),require.resolve('./espera-controlada.cjs')],
  {env:{...process.env,NUCLEO_OBSERVAR_CIERRE:'1'},stdio:['ignore','pipe','pipe','ipc']});
 const salida=[],errores=[];let buffer='',timer,arranque,peticion,watchdog=false,inicio,muestras=0,ultimo;
 const fin=new Promise((resolve,reject)=>{hijo.once('error',reject);hijo.once('exit',(codigo,senal)=>resolve({codigo,senal}));});
 const captura=new Promise((resolve,reject)=>{
  arranque=setTimeout(()=>reject(new Error('La fixture no llegó al control')),10000);
  hijo.on('message',mensaje=>{
   if(mensaje.tipo==='listo'){
    peticion=http.get({host:'127.0.0.1',port:mensaje.puerto,path:'/NO_PUBLICAR_url',
     headers:{Authorization:'Bearer NO_PUBLICAR_token'}},r=>r.resume());
    peticion.on('error',()=>{});
   }
   if(mensaje.tipo==='solicitud'){
    clearTimeout(arranque);inicio=performance.now();
    timer=setTimeout(()=>{watchdog=true;hijo.kill('SIGKILL');reject(new Error('La fixture agotó los cinco segundos; esto es un fallo'));},5000);
    hijo.kill('SIGTERM');
   }
  });
  hijo.stdout.on('data',trozo=>{
   buffer+=trozo.toString();let salto;
   while((salto=buffer.indexOf('\n'))>=0){
    const linea=buffer.slice(0,salto);buffer=buffer.slice(salto+1);salida.push(linea);
    if(!linea.startsWith('CIERRE_NUCLEO '))continue;
    const d=JSON.parse(linea.slice('CIERRE_NUCLEO '.length));
    if(d.tipo==='recursos'&&d.fases.some(f=>f.fase==='hook.TareaEnEspera.onModuleDestroy')){
     ultimo=d;
     if(++muestras===8){hijo.send({tipo:'liberar'});resolve();}
    }
   }
  });
  hijo.stderr.on('data',trozo=>errores.push(trozo.toString()));
  hijo.once('exit',()=>{if(muestras<8)reject(new Error('La fixture salió antes de la captura requerida'));});
 });
 try{
  await captura;const resultado=await fin;clearTimeout(timer);
  assert.deepEqual(resultado,{codigo:null,senal:'SIGTERM'});
  assert.equal(watchdog,false);assert.ok(performance.now()-inicio<5000);
  assert.equal(muestras,8);assert.ok(ultimo.desdeMs>=3500&&ultimo.desdeMs<5000);
  assert.ok(ultimo.fases.some(f=>f.fase==='hook.TareaEnEspera.onModuleDestroy'&&f.esperandoMs>=3500));
  assert.ok(ultimo.http.some(h=>h.escuchando&&h.sockets===1&&h.solicitudes===1));
  assert.ok(ultimo.tareas.some(t=>t.proveedor==='TareaEnEspera'&&t.trabajos===1));
  assert.ok(salida.length<256);assert.equal((salida.join('\n')+errores.join('')).includes('NO_PUBLICAR'),false);
 }finally{
  clearTimeout(timer);clearTimeout(arranque);peticion?.destroy();
  if(hijo.exitCode===null&&hijo.signalCode===null)hijo.kill('SIGKILL');
  await fin;
 }
});

test('el preload carga con las dependencias instaladas y permanece silencioso sin señal',()=>{
 const r=spawnSync(process.execPath,['--require',require.resolve('./observar.cjs'),'-e','console.log("listo")'],
  {env:{...process.env,NUCLEO_OBSERVAR_CIERRE:'1'},encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'listo');
});

test('sin señal conserva el resultado y no registra argumentos',()=>{
 const filas=[],r=crearRegistro(x=>filas.push(x)),resultado={propio:true};
 const objeto={operar(){return resultado;}};r.medir(objeto,'operar','tareas');
 assert.equal(objeto.operar('dato-privado'),resultado);assert.deepEqual(filas,[]);
});
test('mantiene this, valor y espera asíncrona; la fase queda pendiente hasta resolver',async()=>{
 let tiempo=10,resolver;const filas=[],r=crearRegistro(x=>filas.push(x),()=>tiempo);
 const objeto={valor:7,async operar(arg){assert.equal(this.valor,7);assert.equal(arg,'dato-privado');await new Promise(ok=>resolver=ok);return this.valor;}};
 r.medir(objeto,'operar','tareas');r.comenzar();const trabajo=objeto.operar('dato-privado');
 tiempo=24;assert.deepEqual(r.pendientes(),[{id:1,fase:'tareas',esperandoMs:14}]);
 resolver();assert.equal(await trabajo,7);assert.deepEqual(r.pendientes(),[]);
 assert.equal(filas.at(-1).duracionMs,14);assert.equal(JSON.stringify(filas).includes('dato-privado'),false);
});
test('respeta el callback y su receptor, conserva el error y no copia su mensaje',()=>{
 const filas=[],r=crearRegistro(x=>filas.push(x)),error=new Error('consulta y clave privadas');
 const receptor={},resultado={sinCambios:true};let llamada=false;
 const objeto={fin(cb){cb.call(receptor,error,3);return resultado;}};
 r.medir(objeto,'fin','PostgreSQL.pool.end',true);r.comenzar();
 assert.equal(objeto.fin(function(e,n){assert.equal(this,receptor);assert.equal(e,error);assert.equal(n,3);llamada=true;}),resultado);
 assert.equal(llamada,true);assert.equal(filas.at(-1).resultado,'error');assert.deepEqual(r.pendientes(),[]);
 assert.equal(JSON.stringify(filas).includes(error.message),false);
});
test('propaga el mismo rechazo y limita la salida, sin usar los datos del error',async()=>{
 const filas=[],r=crearRegistro(x=>filas.push(x)),error=new Error('mensaje/usuario/token privados');
 const objeto={async fin(){throw error;}};r.medir(objeto,'fin','Redis.quit');r.comenzar();
 await assert.rejects(objeto.fin(),e=>e===error);assert.deepEqual(r.pendientes(),[]);
 for(let i=0;i<400;i++)r.emitir('recursos',{cantidad:0});
 assert.equal(filas.length,256);assert.equal(JSON.stringify(filas).includes(error.message),false);
});
