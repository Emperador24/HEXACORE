// Complemento de lectura RNF-05. Exige los propietarios/esquemas actuales.
const {execFileSync}=require('node:child_process');
const {cargar,backend,path,assert,guardar}=require('./comun.cjs');
async function main(){
 assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'feature/sebastian');
 assert.equal(execFileSync('docker',['ps','-q','--filter','label=com.docker.compose.project=redash'],{encoding:'utf8'}).trim(),'');
 cargar(path.join(backend,'test/cu012/entorno.cjs')).configuracion();
 const {Client}=cargar('pg');
 const c=new Client({host:'127.0.0.1',port:15459,user:process.env.POSTGRES_USUARIO,password:process.env.POSTGRES_CONTRASENA,database:'hexacore_cu015',statement_timeout:3000});
 await c.connect();
 try{
  for(let i=1;i<=3;i++){
   const datos=await require('./inspeccionar-base.cjs').inspeccionar(async(q,v)=>(await c.query(q,v)).rows);
   const activos=execFileSync('docker',['ps','--filter','label=com.docker.compose.project=hexacore-cu015-sebastian','--format','{{.Label "com.docker.compose.service"}}'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
   const d={fechaUTC:new Date().toISOString(),...datos,condicion:{serviciosPropiosActivos:activos,redashDetenido:true,soloLectura:true}};
   guardar('base-datos-complemento-'+i+'.json',d);console.log(JSON.stringify(d));assert.equal(d.canarioPAN,0,'Se encontró el canario');
  }
 }finally{await c.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
