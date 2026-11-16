const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {resolve}=require('node:path');
const raiz=resolve(__dirname,'../../../..');
const backend=resolve(__dirname,'../..');
function configuracion() {
  const c=JSON.parse(execFileSync('python3',[resolve(raiz,'App/infra/revision/revision.py'),'--perfil','cu015','config'],{encoding:'utf8'}));
  assert.equal(c.name,'hexacore-cu015-sebastian');
  const [pg]=JSON.parse(execFileSync('docker',['inspect','hexacore-cu015-sebastian-postgres-1'],{encoding:'utf8'}));
  assert.equal(pg.Config.Labels['hexacore.uso'],'cu015');
  assert.equal(pg.NetworkSettings.Ports['5432/tcp'][0].HostPort,'15459');
  const e=c.services.nucleo.environment;
  assert.equal(e.POSTGRES_BD,'hexacore_cu015');
  for(const k of Object.keys(process.env)) if(k.startsWith('DB_') || k.startsWith('POSTGRES_')) delete process.env[k];
  Object.assign(process.env,e,{NODE_ENV:'test',POSTGRES_HOST:'127.0.0.1',POSTGRES_PUERTO:'15459',REDIS_HOST:'127.0.0.1',REDIS_PUERTO:'16404',
    AUTH_JWT_CLAVE_PUBLICA_ARCHIVO:resolve(raiz,'App/infra/revision/.estado-cu015/jwt-publica.pem'),
    AUTH_JWT_CLAVE_PRIVADA_ARCHIVO:resolve(raiz,'App/infra/revision/.estado-cu015/jwt-privada.pem')});
}
async function conectar() {
  configuracion();
  const {DataSource}=require('typeorm'), Redis=require('ioredis');
  const {ENTIDADES}=require(resolve(backend,'dist/modulos/alimentos/persistencia/data-source'));
  const ds=new DataSource({type:'postgres',host:'127.0.0.1',port:15459,username:process.env.POSTGRES_USUARIO,password:process.env.POSTGRES_CONTRASENA,
    database:'hexacore_cu015',schema:'alimentos',entities:ENTIDADES,synchronize:false,migrationsRun:false,installExtensions:false,
    extra:{options:'-c search_path=alimentos,pg_catalog,extensiones',max:3,statement_timeout:3000}});
  await ds.initialize();
  const redis=new Redis({host:'127.0.0.1',port:16404,maxRetriesPerRequest:0,commandTimeout:2000,lazyConnect:true});await redis.connect();
  const {AjustesInventarioService}=require(resolve(backend,'dist/modulos/alimentos/inventario/ajustes-inventario.service'));
  const {ReservasService,clavesReserva}=require(resolve(backend,'dist/modulos/alimentos/inventario/reservas.service'));
  return {ds,redis,AjustesInventarioService,ReservasService,clavesReserva,cerrar:async()=>{await redis.quit();await ds.destroy();}};
}
function nucleo(accion) {
  // Misma validación y bloqueo exclusivo del checkout; nunca tocar Redis ni volúmenes.
  const codigo=`import sys,json,fcntl
sys.path.insert(0,${JSON.stringify(resolve(raiz,'App/infra/revision'))})
import revision as r
r.seleccionar_perfil('cu015')
c=json.loads(r.compose('config','--format','json',capturar=True));r.validar_configuracion(c);r.comprobar_recursos(c,r.contenedores_propios())
with (r.ESTADO/'operacion.lock').open('a') as f:
 fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
 ${accion==='parar' ? "r.compose('stop','--timeout','30','nucleo')" : "r.compose('up','--no-build','--no-deps','-d','--wait','--wait-timeout','240','nucleo')"}
`;
  execFileSync('python3',['-c',codigo],{stdio:'pipe'});
}
module.exports={configuracion,conectar,nucleo,backend};
