const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {resolve}=require('node:path');
const {Client}=require('pg');
const {conectar,backend}=require('../cu012/entorno.cjs');
(async()=>{
 const entorno=await conectar();
 const comunes={host:'127.0.0.1',port:15459,user:process.env.POSTGRES_USUARIO,password:process.env.POSTGRES_CONTRASENA};
 const control=new Client({...comunes,database:'hexacore_cu015'});await control.connect();
 function preparar(base,anterior=false){
  const programa=`const h=require(${JSON.stringify(resolve(backend,'dist/compartido/persistencia/historia'))});
   ${anterior?"const g=h.GRUPOS_MIGRACIONES.find(g=>g.conexion==='alimentos');g.migraciones=g.migraciones.filter(M=>!['PreparacionCu0131794500000000','EntregaCu0141794600000000'].includes(M.name));":''}
   require(${JSON.stringify(resolve(backend,'dist/compartido/persistencia/preparar-base'))}).prepararBase().catch(e=>{console.error(e.message);process.exitCode=1;});`;
  const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',POSTGRES_HOST:'127.0.0.1',POSTGRES_PUERTO:'15459',POSTGRES_USUARIO:comunes.user,POSTGRES_CONTRASENA:comunes.password,POSTGRES_BD:base};
  return JSON.parse(execFileSync(process.execPath,['-e',programa],{env,cwd:'/tmp',encoding:'utf8'}).trim().split('\n').at(-1));
 }
 try {
  const sufijo=randomUUID().replaceAll('-','').slice(0,12);
  for(const modo of ['vacia','actualizacion']){
   const base=`cu013_${sufijo}_${modo}`;await control.query(`CREATE DATABASE "${base}"`);
   assert.equal(preparar(base,modo==='actualizacion').migraciones,modo==='vacia'?34:32);
   const c=new Client({...comunes,database:base});await c.connect();
   try {
    if(modo==='actualizacion'){
     const evento=randomUUID(),local=randomUUID(),producto=randomUUID(),cliente=randomUUID(),pagado=randomUUID(),pendiente=randomUUID();
     await c.query("INSERT INTO alimentos.eventos_referencia(evento_id,nombre,disponible) VALUES($1,'Evento previo',true)",[evento]);
     await c.query("INSERT INTO alimentos.establecimientos(id,evento_id,nombre,estado,punto_entrega) VALUES($1,$2,'Local histórico','CERRADO','Puerta histórica')",[local,evento]);
     await c.query("INSERT INTO alimentos.productos(id,establecimiento_id,nombre,descripcion,precio,cantidad_inventario,activo,restricciones_alimentarias) VALUES($1,$2,'Producto histórico','Receta anterior',1000.25,7,true,'[\"leche\"]')",[producto,local]);
     for(const [id,estado,cantidad] of [[pagado,'CONFIRMADO',2],[pendiente,'PENDIENTE_PAGO',1]]){
      await c.query("INSERT INTO alimentos.pedidos(id,cliente_id,establecimiento_id,estado,total,moneda,metodo_entrega,expira_en,codigo_qr,confirmado_en) VALUES($1,$2,$3,$4,$5,'COP','RECOGER',now()+interval '10 minutes',$6,$7)",[id,cliente,local,estado,cantidad===2?'2000.50':'1000.25',cantidad===2?'qr-historico':null,cantidad===2?new Date():null]);
      await c.query("INSERT INTO alimentos.detalles_pedido(pedido_id,producto_id,nombre_producto,precio_unitario,cantidad,descripcion_producto,restricciones_alimentarias) VALUES($1,$2,'Nombre acordado',1000.25,$3,'Descripción acordada','[\"leche\"]')",[id,producto,cantidad]);
      await c.query('INSERT INTO alimentos.reservas_inventario(pedido_id,estado) VALUES($1,$2)',[id,cantidad===2?'CONSUMIDA':'ACTIVA']);
     }
     await c.query("INSERT INTO alimentos.transacciones_pedido(id,pedido_id,monto,moneda,estado,referencia_pasarela) VALUES($1,$2,2000.50,'COP','APROBADA','referencia previa')",[randomUUID(),pagado]);
     const tablas=['productos','pedidos','transacciones_pedido','reservas_inventario','detalles_pedido','establecimientos'];
     const antes=[];for(const t of tablas)antes.push((await c.query(`SELECT * FROM alimentos.${t} ORDER BY 1`)).rows);
     assert.deepEqual(preparar(base).esquemas.alimentos.aplicadas,['PreparacionCu0131794500000000','EntregaCu0141794600000000']);
     for(let i=0;i<tablas.length;i++)assert.deepEqual((await c.query(`SELECT * FROM alimentos.${tablas[i]} ORDER BY 1`)).rows,antes[i]);
     const {DataSource}=require('typeorm');const {ENTIDADES}=require(resolve(backend,'dist/modulos/alimentos/persistencia/data-source'));
     const ds=new DataSource({type:'postgres',host:comunes.host,port:comunes.port,username:comunes.user,password:comunes.password,database:base,schema:'alimentos',entities:ENTIDADES,synchronize:false,installExtensions:false,extra:{options:'-c search_path=alimentos,pg_catalog,extensiones',max:2}});
     await ds.initialize();try{
      const {RecepcionService}=require(resolve(backend,'dist/modulos/alimentos/recepcion/recepcion.service'));const servicio=new RecepcionService(ds);
      const lista=await servicio.listar(local);assert.equal(lista.length,1);assert.equal(lista[0].pagoVerificado,true);assert.equal(lista[0].preparacion.estado,'RECIBIDO');assert.equal(lista[0].preparacion.version,0);assert.equal('codigoQr' in lista[0],false);
      assert.equal((await servicio.detalleCliente(cliente,pagado)).codigoQr,'qr-historico');
     }finally{await ds.destroy();}
    }
    assert.ok(Object.values(preparar(base).esquemas).every(g=>g.aplicadas.length===0));
    assert.equal((await c.query('SELECT count(*)::int n FROM migracion_control.procedencia')).rows[0].n,18);
    assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
    console.log(`${modo}: ${base}, 34 migraciones; repetición sin DDL y 18 procedencias. Productos, reservas, pedidos, pagos y detalles previos idénticos; confirmado histórico recibido y mismo QR.`);
   }finally{await c.end();}
  }
 }finally{await control.end();await entorno.cerrar();}
})().catch(e=>{console.error(e.stack??e.message);process.exitCode=1;});
