// Proceso de prueba: deja una intención durable y se interrumpe antes del Lua.
const {conectar}=require('./entorno.cjs');
(async()=>{
  const c=await conectar();
  const [local,producto,actor,id]=process.argv.slice(2);
  const transporte=new Proxy(c.redis,{get(t,p){if(p==='eval')return async()=>{
    process.stdout.write('INTENCION_DURABLE\n');await new Promise(()=>{});
  };const v=t[p];return typeof v==='function'?v.bind(t):v;}});
  const ajustes=new c.AjustesInventarioService(c.ds,transporte);
  await ajustes.solicitar(local,actor,id,{productoId:producto,delta:2,motivo:'Interrupción de proceso CU012'});
})().catch(()=>{process.stderr.write('No se alcanzó el punto de interrupción\n');process.exitCode=1;});
