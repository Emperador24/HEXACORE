// Preload exclusivo del hijo E2E. Observa; no cierra recursos, cancela tareas,
// cambia plazos ni añade un manejador persistente que absorba el SIGTERM de Nest.
const {performance}=require('node:perf_hooks');

// El timeout de CI publica el diagnóstico, no la salida ordinaria del servicio.
function diagnosticoCapturado(salida){
  return salida.split('\n').filter(linea=>linea.startsWith('CIERRE_NUCLEO ')).slice(0,256).join('\n')||'Sin registros de diagnóstico de cierre';
}

function crearRegistro(escribir,ahora=()=>performance.now()){
  let inicio,emitidos=0,secuencia=0;
  const pendientes=new Map();
  function emitir(tipo,datos={}){
    if(inicio===undefined||emitidos++>=256)return;
    escribir({tipo,desdeMs:Math.round((ahora()-inicio)*100)/100,...datos});
  }
  function comenzar(){inicio??=ahora();emitir('senal',{senal:'SIGTERM'});}
  function medir(objeto,metodo,fase,callback=false){
    const original=objeto?.[metodo];if(typeof original!=='function')return;
    objeto[metodo]=function(...args){
      if(inicio===undefined)return Reflect.apply(original,this,args);
      const id=++secuencia,t=ahora();let terminado=false;
      pendientes.set(id,{fase,inicio:t});emitir('inicio',{id,fase});
      const fin=(error)=>{if(terminado)return;terminado=true;pendientes.delete(id);
        emitir('fin',{id,fase,duracionMs:Math.round((ahora()-t)*100)/100,resultado:error?'error':'ok'});};
      const ultimo=args.length-1;
      const usaCallback=callback&&typeof args[ultimo]==='function';
      if(usaCallback){const cb=args[ultimo];args[ultimo]=function(...valores){fin(valores[0]);return Reflect.apply(cb,this,valores);};}
      try{
        const resultado=Reflect.apply(original,this,args);
        if(resultado&&typeof resultado.then==='function')return resultado.then(valor=>{fin();return valor;},error=>{fin(error);throw error;});
        if(!usaCallback)fin();return resultado;
      }catch(error){fin(error);throw error;}
    };
  }
  return {comenzar,emitir,medir,pendientes:()=>[...pendientes].map(([id,p])=>({id,fase:p.fase,esperandoMs:Math.round(ahora()-p.inicio)}))};
}

function instalar(){
  const http=require('node:http');
  const {DataSource}=require('typeorm');
  const {Pool}=require('pg');
  const Redis=require('ioredis');
  const {NestApplicationContext}=require('@nestjs/core/nest-application-context');
  const {NestApplication}=require('@nestjs/core/nest-application');
  const amqp=require('amqplib');
  const registro=crearRegistro(d=>process.stdout.write('CIERRE_NUCLEO '+JSON.stringify(d)+'\n'));
  const fuentes=new Set(),pools=new Set(),clientes=new Set(),servidores=new Map(),instancias=new Set(),vistos=new WeakSet();
  const conexionesAmqp=new Set(),canalesAmqp=new Set();
  let timer,muestras=0;
  const nombre=objeto=>/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(objeto?.constructor?.name??'')?objeto.constructor.name:'Proveedor';
  const cantidad=x=>Number.isFinite(x)?x:0;
  const estadoRedis=c=>['wait','connecting','connect','ready','close','reconnecting','end'].includes(c.status)?c.status:'otro';
  const seguir=(proto,metodo,coleccion)=>{
    const original=proto[metodo];proto[metodo]=function(...args){coleccion.add(this);return Reflect.apply(original,this,args);};
  };
  seguir(DataSource.prototype,'initialize',fuentes);
  seguir(Pool.prototype,'connect',pools);
  seguir(Redis.prototype,'connect',clientes);
  const conectarAmqp=amqp.connect;
  amqp.connect=function(...args){return Reflect.apply(conectarAmqp,this,args).then(conexion=>{
    conexionesAmqp.add(conexion);conexion.once('close',()=>conexionesAmqp.delete(conexion));
    registro.medir(conexion,'close','AMQP.conexion.close');
    for(const metodo of ['createChannel','createConfirmChannel']){
      const crear=conexion[metodo];conexion[metodo]=function(...opciones){return Reflect.apply(crear,this,opciones).then(canal=>{
        canalesAmqp.add(canal);canal.once('close',()=>canalesAmqp.delete(canal));
        registro.medir(canal,'close','AMQP.canal.close');return canal;
      });};
    }
    return conexion;
  });};
  const crearServidor=http.createServer;
  http.createServer=function(...args){
    const servidor=Reflect.apply(crearServidor,this,args),sockets=new Set();
    const datos={sockets,solicitudes:0};servidores.set(servidor,datos);
    servidor.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
    servidor.on('request',(_req,res)=>{datos.solicitudes++;let contado=true;
      const fin=()=>{if(contado){contado=false;datos.solicitudes--;}};res.once('finish',fin);res.once('close',fin);});
    return servidor;
  };
  function observarHooks(app){
    for(const modulo of app.getModulesToTriggerHooksOn()){
      for(const mapa of [modulo.providers,modulo.controllers,modulo.injectables,modulo.middlewares]){
        for(const envoltorio of mapa.values()){
          const instancia=envoltorio.instance;
          if(!instancia||!['object','function'].includes(typeof instancia)||vistos.has(instancia))continue;
          vistos.add(instancia);instancias.add(instancia);
          const clase=nombre(instancia);
          for(const hook of ['onModuleDestroy','beforeApplicationShutdown','onApplicationShutdown'])registro.medir(instancia,hook,`hook.${clase}.${hook}`);
        }
      }
    }
  }
  function recursos(){
    const activos={};for(const tipo of process.getActiveResourcesInfo()){
      const clave=/^[A-Za-z0-9]+$/.test(tipo)?tipo:'Otro';activos[clave]=(activos[clave]??0)+1;
    }
    const tareas=[];
    for(const instancia of instancias){
      const fila={proveedor:nombre(instancia)};
      for(const campo of ['trabajos','consumidores'])if(instancia[campo] instanceof Map||instancia[campo] instanceof Set)fila[campo]=instancia[campo].size;
      for(const campo of ['ciclo','barriendo','trabajando','ejecucion'])if(instancia[campo]!==undefined&&instancia[campo]!==null){
        const x=instancia[campo];fila[campo]=typeof x==='boolean'?x:typeof x?.then==='function'?'promesa-registrada':'otro';
      }
      if(Object.keys(fila).length>1)tareas.push(fila);
    }
    return {fases:registro.pendientes(),http:[...servidores].map(([s,d])=>({escuchando:s.listening,sockets:d.sockets.size,solicitudes:d.solicitudes})),
      postgres:[...pools].map(p=>({total:cantidad(p.totalCount),libres:cantidad(p.idleCount),esperando:cantidad(p.waitingCount),cerrando:!!p.ending,cerrado:!!p.ended})),
      fuentesPostgres:[...fuentes].map(f=>({inicializada:!!f.isInitialized})),
      redis:[...clientes].map(c=>({estado:estadoRedis(c),comandos:cantidad(c.commandQueue?.length),colaSinConexion:cantidad(c.offlineQueue?.length)})),
      amqp:{conexiones:conexionesAmqp.size,canales:canalesAmqp.size},tareas,handles:activos};
  }
  // Los hooks se envuelven justo antes de ejecutarse, con los providers ya listos.
  const destroy=NestApplicationContext.prototype.callDestroyHook;
  NestApplicationContext.prototype.callDestroyHook=function(...args){observarHooks(this);return Reflect.apply(destroy,this,args);};
  for(const [metodo,fase]of [['callDestroyHook','tareas'],['callBeforeShutdownHook','antes-de-cerrar'],['callShutdownHook','liberar-proveedores']])registro.medir(NestApplicationContext.prototype,metodo,fase);
  registro.medir(NestApplication.prototype,'dispose','HTTP.dispose');
  registro.medir(DataSource.prototype,'destroy','PostgreSQL.destroy');
  registro.medir(Pool.prototype,'end','PostgreSQL.pool.end',true);
  registro.medir(Redis.prototype,'quit','Redis.quit',true);
  // Una sola escucha: Nest conserva su señal final y su política de errores.
  process.once('SIGTERM',()=>{
    registro.comenzar();registro.emitir('recursos',recursos());
    timer=setInterval(()=>{registro.emitir('recursos',recursos());if(++muestras>=8)clearInterval(timer);},500);timer.unref();
  });
  const shutdown=NestApplicationContext.prototype.callShutdownHook;
  NestApplicationContext.prototype.callShutdownHook=function(...args){
    return Reflect.apply(shutdown,this,args).then(valor=>{clearInterval(timer);registro.emitir('completo',recursos());return valor;});
  };
}

module.exports={crearRegistro,diagnosticoCapturado};
if(process.env.NUCLEO_OBSERVAR_CIERRE==='1')instalar();
