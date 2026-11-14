const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const raiz=path.resolve(__dirname,'../../../..'),backend=path.join(raiz,'App/backend');
const cargar=createRequire(path.join(backend,'package.json'));
const proyecto='hexacore-cu015-sebastian',base='http://127.0.0.1:18100';
function privado(){
 const d=process.env.SEGURIDAD_SALIDA;if(!d)throw Error('Define SEGURIDAD_SALIDA en una carpeta ignorada');
 const dir=path.resolve(d);assert(dir.startsWith(raiz+'/'));execFileSync('git',['check-ignore','--quiet',dir+'/control'],{cwd:raiz});
 fs.mkdirSync(dir,{recursive:true,mode:0o700});return dir;
}
function guardar(nombre,obj){fs.writeFileSync(path.join(privado(),nombre),JSON.stringify(obj,null,2)+'\n',{mode:0o600});}
function leer(nombre){return JSON.parse(fs.readFileSync(path.join(privado(),nombre),'utf8'));}
function guarda(){
 assert.equal(execFileSync('git',['branch','--show-current'],{cwd:raiz,encoding:'utf8'}).trim(),'feature/sebastian');
 const ids=execFileSync('docker',['ps','-q','--filter','label=com.docker.compose.project=redash'],{encoding:'utf8'}).trim();assert.equal(ids,'','Detén Redash según la guía antes de analizar');
 cargar(path.join(backend,'test/cu012/entorno.cjs')).configuracion();
 const n=JSON.parse(execFileSync('docker',['inspect',proyecto+'-nucleo-1'],{encoding:'utf8'}))[0];
 assert.equal(n.Config.Labels['hexacore.uso'],'cu015');assert(n.State.Running);
 assert.equal(process.env.PAGOS_PROVEEDOR??'simulada','simulada','Solo proveedor simulado');
 assert.equal(process.env.CORREO_PROVEEDOR??'simulado','simulado','Solo correo simulado');
}
async function peticion(ruta,{metodo='GET',token,cuerpo,cabeceras={},servidor=base}={}){
 assert(/^http:\/\/127\.0\.0\.1:(18100|13149|13147)$/.test(servidor),'Destino fuera del ensayo');assert(ruta.startsWith('/api/v1/'));
 const r=await fetch(servidor+ruta,{method:metodo,redirect:'manual',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(cuerpo!==undefined?{'Content-Type':'application/json'}:{}),...cabeceras},body:cuerpo===undefined?undefined:JSON.stringify(cuerpo),signal:AbortSignal.timeout(10000)});
 const texto=await r.text();let datos;try{datos=JSON.parse(texto);}catch{datos=null;}
 return {estado:r.status,datos,cookie:r.headers.get('set-cookie'),cabeceras:Object.fromEntries(r.headers)};
}
async function conexion(){const {conectar}=cargar(path.join(backend,'test/cu012/entorno.cjs'));return conectar();}
module.exports={raiz,backend,cargar,proyecto,base,privado,guardar,leer,guarda,peticion,conexion,fs,path,assert};
