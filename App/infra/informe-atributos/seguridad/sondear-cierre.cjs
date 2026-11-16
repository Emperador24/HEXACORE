// Reproduce antes de corregir; no confunde un 400/404 con una decisión de autorización.
const c=require('./cierre-comun.cjs');
const {gzipSync}=require('node:zlib');
async function main(){
  const archivo='brechas-antes.json';c.assert(!c.fs.existsSync(c.path.join(c.privado(),archivo)));
  const meta=c.guarda(),db=await c.conexion(),r={inicio:new Date().toISOString(),imagen:meta.imagen,gateway:meta.gatewayEnsayo.imagen,casos:[]};
  try{
    const admin=await c.login('admin'),org=await c.login('organizador'),cliente=await c.login('cliente2');
    const e=await c.evento(db,org.token),f=c.fixture(),snapshot=await c.capturador(db);
    const rol=await c.rol(admin.token,f.codigo+' concesion');
    const base=await c.http(c.base,'GET','/eventos',cliente.token);c.assert.equal(base.estado,403);
    const asignar=await c.http(c.base,'POST','/admin/roles/'+rol.id+'/usuarios',admin.token,{email:f.actores.cliente2.email});c.assert.equal(asignar.estado,200);
    const gateway=await c.http(c.base,'GET','/eventos',cliente.token),directo=await c.http('http://127.0.0.1:13149','GET','/eventos',cliente.token);
    c.assert.equal(gateway.estado,403);c.assert.equal(directo.estado,200);c.assert(JSON.stringify(directo.datos).includes(e.evento.id));
    r.casos.push({caso:'rol concedido a sesión ya abierta',tokenInicialRoles:JSON.parse(Buffer.from(cliente.token.split('.')[1],'base64url')).roles,asignacion:asignar.estado,gateway,directo,evento:e.evento.id});
    const propio=await c.login('propio');
    const quitar=await c.http(c.base,'DELETE','/admin/roles/'+f.rolPropio.id+'/usuarios/'+f.actores.propio.id,admin.token);c.assert.equal(quitar.estado,200);
    for(const servidor of [c.base,'http://127.0.0.1:13149'])c.assert.equal((await c.http(servidor,'GET','/eventos',propio.token)).estado,403);
    const clave='roles-usuario:'+f.actores.propio.id,valor=await db.redis.get(clave),exp=Number(await db.redis.call('PEXPIRETIME',clave));c.assert(exp>Date.now());
    try{
      for(const [nombre,roto] of [['JSON inválido','{'],['cadena vacía','']]){
        await db.redis.set(clave,roto,'PXAT',exp);
        for(const [canal,servidor] of [['gateway',c.base],['nucleo','http://127.0.0.1:13149']]){
          const antes=await snapshot(),x=await c.http(servidor,'GET','/eventos',propio.token),despues=await snapshot();
          c.assert.equal(x.estado,200);c.assert(JSON.stringify(x.datos).includes(e.evento.id));
          const base='brecha-'+r.casos.length;
          for(const [fase,s] of [['antes',antes],['despues',despues]])c.fs.writeFileSync(c.path.join(c.privado(),base+'-'+fase+'.json.gz'),gzipSync(JSON.stringify(s)),{mode:0o600});
          c.comparar(antes,despues);
          r.casos.push({caso:'roles vigentes no comprobables: '+nombre,canal,respuesta:x,retiradoPorAPI:true,inyeccionEnRedisExclusivo:true,expiracionConservada:exp,conservacion:true});
        }
      }
    }finally{await db.redis.set(clave,valor,'PXAT',exp);}
    r.estado='BRECHAS_REPRODUCIDAS';
    console.log('Reproducidas: concesión nueva 403 gateway/200 directo; roles vigentes inválidos o vacíos vuelven al privilegio anterior (200 por ambos).');
  }finally{r.fin=new Date().toISOString();try{c.guardar(archivo,r);}finally{await db.cerrar();}}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
