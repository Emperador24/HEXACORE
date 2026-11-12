const {spawnSync}=require('node:child_process');
const {guarda,leer,guardar,conexion,proyecto}=require('./comun.cjs');
async function main(){
 guarda();const f=leer('fixture.json'),desde=f.creadaEn??process.env.SEGURIDAD_DESDE;if(!desde||!Number.isFinite(Date.parse(desde)))throw Error('Define SEGURIDAD_DESDE con el inicio UTC del ensayo');const c=await conexion();const claves=new Set();
 try{
  for(const id of [f.pedido,f.producto]){let cursor='0';do{const r=await c.redis.scan(cursor,'MATCH','*'+id+'*','COUNT',100);cursor=r[0];for(const k of r[1])claves.add(k);}while(cursor!=='0');}
  let coincidencias=0;
  for(const k of claves){const tipo=await c.redis.type(k);let valor='';
   if(tipo==='string')valor=await c.redis.get(k);
   else if(tipo==='hash')valor=JSON.stringify(await c.redis.hgetall(k));
   else if(tipo==='list')valor=JSON.stringify(await c.redis.lrange(k,0,100));
   else throw Error('Tipo de fixture no previsto; revisar cobertura sin volcar valores');
   if(valor?.includes('4111111111111111'))coincidencias++;
  }
  const logs={};for(const s of ['nucleo','boleteria','trabajador','api-gateway','pasarela','correo']){
   const r=spawnSync('docker',['logs','--since',desde,proyecto+'-'+s+'-1'],{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error('No se pudieron leer logs de '+s);const texto=r.stdout+r.stderr;
   // docker logs separa stderr: conservar ambas corrientes sin imprimirlas.
   logs[s]={canarioPAN:texto.split('4111111111111111').length-1};
  }
  const resultado={redis:{clavesPropias:claves.size,canarioPAN:coincidencias},logs,limite:'Canario y claves exclusivas del pedido/producto; no detector exhaustivo de tarjetas'};
  guardar('almacenamiento.json',resultado);console.log(JSON.stringify(resultado));if(coincidencias||Object.values(logs).some(x=>x.canarioPAN))process.exitCode=1;
 }finally{await c.cerrar();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
