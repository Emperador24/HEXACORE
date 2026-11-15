// Regresión pertinente de la guarda compartida; sin SIGTERM ni reiniciar contenedores.
const c=require('./cierre-comun.cjs');
async function main(){
  c.guarda();const archivo='regresion-sse-cierre.json';c.assert(!c.fs.existsSync(c.path.join(c.privado(),archivo)));
  const db=await c.conexion(),r={inicio:new Date().toISOString(),casos:[]};
  try{
    const org=await c.login('organizador'),e=await c.escenario(c.base,org.token),p=await c.proponer(c.base,org.token,e);
    const rutas=[['parqueaderos','/parqueaderos/eventos/'+e.evento.id+'/ocupacion/flujo','ocupacion'],['evacuacion','/emergencias/evacuaciones/'+p.evacuacion.id+'/flujo','evacuacion'],['monitoreo','/monitoreo/eventos/'+e.evento.id+'/flujo','panel']];
    for(const [canal,servidor]of [['gateway',c.base],['nucleo','http://127.0.0.1:13149']]){
      for(const [flujo,ruta,tipo]of rutas){
        for(const fallo of ['revocacion','rolesIlegibles']){
          const s=await c.login('organizador',servidor),f=await c.abrir(servidor,ruta,s.token);c.assert.equal(f.estado,200);
          const id=c.fixture().actores.organizador.id,clave='roles-usuario:'+id,antes=await db.redis.get(clave),exp=Number(await db.redis.call('PEXPIRETIME',clave));
          try{
            c.assert.equal((await f.siguiente()).tipo,tipo);
            const inicio=performance.now();
            if(fallo==='revocacion'){const x=await c.http(servidor,'DELETE','/sesiones/actual',s.token);c.assert.equal(x.estado,200);}
            else{c.assert.equal(antes,null);await db.redis.set(clave,'{','PX',10000);}
            await f.hastaCierre();
            const deteccionMs=performance.now()-inicio;
            const terminales=f.frames.filter(x=>x.tipo==='sesion_finalizada'),terminal=terminales[0];
            c.assert.equal(terminales.length,1);c.assert.equal(f.frames.at(-1),terminal);
            c.assert.equal(terminal.datos.codigo,fallo==='revocacion'?'SIN_AUTENTICAR':'SESIONES_NO_DISPONIBLES');
            const nueva=await c.abrir(servidor,ruta,s.token);c.assert.equal(nueva.estado,fallo==='revocacion'?401:503);await nueva.cerrar();
            r.casos.push({canal,flujo,fallo,deteccionMs,frames:f.frames,eof:f.fin,sinDatosTrasTerminal:true,inicial:nueva.estado});
          }finally{
            await f.cerrar();
            if(fallo==='rolesIlegibles'){if(antes===null)await db.redis.del(clave);else if(exp>0)await db.redis.set(clave,antes,'PXAT',exp);else await db.redis.set(clave,antes);}
          }
        }
      }
    }
    r.estado='APROBADA';console.log('12 regresiones SSE aprobadas: tres flujos, dos canales, revocación real y roles no comprobables. Sin reinicios/SIGTERM.');
  }catch(e){r.estado='FALLIDA';r.error=e.message;throw e;}
  finally{r.fin=new Date().toISOString();try{c.guardar(archivo,r);}finally{await db.cerrar();}}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
