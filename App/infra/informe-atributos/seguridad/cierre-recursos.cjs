// 16 operaciones nuevas; controles de contexto/DTO/estado separados de autorización.
const c=require('./cierre-comun.cjs'),{gzipSync}=require('node:zlib');
async function main(){
  const nombre=process.argv[2];c.assert(/^(desarrollo(?:-\d+)?|(?:(?:normalizada|cierre|precisa)-)?final-[123])$/.test(nombre));
  const soloQR=process.argv[3]==='--solo-qr';c.assert(!process.argv[3]||(soloQR&&nombre.startsWith('desarrollo')));
  const archivo='cierre-'+nombre+'.json';c.assert(!c.fs.existsSync(c.path.join(c.privado(),archivo)));
  const meta=c.guarda(),db=await c.conexion(),r={nombre,alcance:soloQR?'QR y último administrador':'16 operaciones',inicio:new Date().toISOString(),imagenes:{nucleo:meta.imagen,boleteria:meta.boleteriaEnsayo.imagen,gateway:meta.gatewayEnsayo.imagen},observaciones:[],canales:[],estado:'EN_CURSO'};
  try{
    const snapshot=await c.capturador(db),carpeta='comparaciones-'+nombre;c.fs.mkdirSync(c.path.join(c.privado(),carpeta),{mode:0o700});
    for(const [canal,servidor,puerta] of [['gateway',c.base,c.base],['directo','http://127.0.0.1:13149','http://127.0.0.1:13147']]){
      const tokens={};
      const preparar=await c.login('admin',servidor),f=c.fixture();
      const asignar=await c.http(servidor,'POST','/admin/roles/'+f.rolPropio.id+'/usuarios',preparar.token,{email:f.actores.propio.email});c.assert.equal(asignar.estado,200);
      for(const a of Object.keys(c.fixture().actores))tokens[a]=await c.login(a,servidor);
      const ops=new Set();let conservaciones=0;
      const ctx={c,db,canal,servidor,puerta,tokens,r,meta,ops,actor:a=>({...c.fixture().actores[a],...tokens[a]}),
        check(caso,ok,categoria='semantica'){r.observaciones.push({canal,caso,categoria,ok:!!ok});c.assert(ok,caso);}};
      ctx.req=async(caso,metodo,ruta,actor,cuerpo,esperado,opts={})=>{
        const conservar=opts.conservar??esperado>=400,liberar=conservar?await c.aislarBarridos(db):async()=>{};
        try{
        const antes=conservar?await snapshot():null;
        const a=typeof actor==='string'?ctx.actor(actor):actor,token=a?.token;
        const headers={'X-Usuario-Id':c.fixture().actores.admin2.id,'X-Usuario-Roles':'Administrador','X-Rol':'Administrador',...opts.cabeceras};
        const inicio=performance.now(),x=await c.http(opts.puerta?puerta:servidor,metodo,ruta,token,cuerpo,headers);
        const o={canal,caso,metodo,ruta,categoria:opts.categoria??'semantica',estado:x.estado,esperado,codigo:x.datos?.codigo,datos:x.datos,duracionMs:performance.now()-inicio,ok:x.estado===esperado};r.observaciones.push(o);
        if(conservar){
          const despues=await snapshot(),n=String(r.observaciones.length).padStart(4,'0');o.comparacion={tablas:antes.filas.length};
          for(const [fase,s] of [['antes',antes],['despues',despues]]){
            const bytes=Buffer.from(JSON.stringify(s)),rel=carpeta+'/'+n+'-'+fase+'.json.gz';c.fs.writeFileSync(c.path.join(c.privado(),rel),gzipSync(bytes),{mode:0o600});
            o.comparacion[fase]=rel;o.comparacion[fase+'Sha256']=c.hash(bytes);
          }
          o.expiracionesNaturales=c.comparar(antes,despues);o.conservado=true;conservaciones++;
        }
        c.assert(o.ok,caso+': '+x.estado+'/'+x.datos?.codigo);
        if(opts.operacion)ops.add(opts.operacion);
        return x.datos;
        }finally{await liberar();}
      };
      ctx.caso=async(titulo,metodo,ruta,cuerpo,actor,estado,operacion,denegados=['cliente','personal','organizador','propio'],opts={})=>{
        for(const a of denegados)await ctx.req(titulo+' / rechazo '+a,metodo,ruta,a,cuerpo,403,opts);
        await ctx.req(titulo+' / sin sesión',metodo,ruta,null,cuerpo,401,opts);
        return ctx.req(titulo+' / positivo '+actor,metodo,ruta,actor,cuerpo,estado,{...opts,operacion});
      };
      if(!soloQR){await require('./cierre-cuentas.cjs')(ctx);await require('./cierre-roles.cjs')(ctx);}
      await require('./cierre-qr.cjs')(ctx);
      await require('./cierre-ultimo-admin.cjs')(ctx);
      c.assert.equal(ops.size,soloQR?3:16);r.canales.push({canal,operaciones:[...ops].sort(),conservaciones});
    }
    r.estado='APROBADA';console.log(nombre+': '+r.observaciones.length+' observaciones; '+(soloQR?3:16)+' operaciones por ambos canales.');
  }catch(e){r.estado='FALLIDA';r.error=e.message;throw e;}
  finally{r.fin=new Date().toISOString();r.duracionMs=Date.parse(r.fin)-Date.parse(r.inicio);try{c.guardar(archivo,r);}finally{await db.cerrar();}}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
