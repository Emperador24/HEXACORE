const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');
const {resolve}=require('node:path');
const {Client}=require('pg');
const {conectar,backend}=require('../cu012/entorno.cjs');
(async()=>{
 const entorno=await conectar();
 const comunes={host:'127.0.0.1',port:15459,user:process.env.POSTGRES_USUARIO,password:process.env.POSTGRES_CONTRASENA};
 const control=new Client({...comunes,database:'hexacore_cu015'});await control.connect();
 function preparar(base,anterior=false){
  const programa=`const h=require(${JSON.stringify(resolve(backend,'dist/compartido/persistencia/historia'))});
   ${anterior?"const g=h.GRUPOS_MIGRACIONES.find(g=>g.conexion==='alimentos');g.migraciones=g.migraciones.filter(M=>!['EntregaCu0141794600000000','CancelacionCu011F1794700000000'].includes(M.name));":''}
   require(${JSON.stringify(resolve(backend,'dist/compartido/persistencia/preparar-base'))}).prepararBase().catch(e=>{console.error(e.message);process.exitCode=1;});`;
  const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',POSTGRES_HOST:'127.0.0.1',POSTGRES_PUERTO:'15459',POSTGRES_USUARIO:comunes.user,POSTGRES_CONTRASENA:comunes.password,POSTGRES_BD:base};
  return JSON.parse(execFileSync(process.execPath,['-e',programa],{env,cwd:'/tmp',encoding:'utf8'}).trim().split('\n').at(-1));
 }
 try{
  const sufijo=randomUUID().replaceAll('-','').slice(0,12);
  for(const modo of ['vacia','actualizacion']){
   const base=`cu014_${sufijo}_${modo}`;await control.query(`CREATE DATABASE "${base}"`);
   assert.equal(preparar(base,modo==='actualizacion').migraciones,modo==='vacia'?36:34);
   const c=new Client({...comunes,database:base});await c.connect();
   try{
    let local,pedido,qr;
    if(modo==='vacia'){
     const grupos=require('../../dist/compartido/persistencia/historia').GRUPOS_MIGRACIONES;
     const tablas=(await c.query('SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1)',[grupos.map(g=>g.esquema)])).rows;
     assert.equal(tablas.length,87);let filas=0;
     for(const t of tablas){
      const n=(await c.query(`SELECT count(*)::int n FROM "${t.schemaname}"."${t.tablename}"`)).rows[0].n;
      const grupo=grupos.find(g=>g.esquema===t.schemaname);
      assert.equal(n,t.tablename===grupo.historial?grupo.migraciones.length:t.schemaname==='identidad'&&t.tablename==='roles'?4:0,`${t.schemaname}.${t.tablename}`);filas+=n;
     }
     assert.equal(filas,40); // 36 historiales y cuatro roles; cero negocio.
    }
    if(modo==='actualizacion'){
     const evento=randomUUID(),producto=randomUUID(),cliente=randomUUID(),pago=randomUUID();local=randomUUID();pedido=randomUUID();qr='e'.repeat(64);
     await c.query("INSERT INTO alimentos.eventos_referencia(evento_id,nombre,disponible) VALUES($1,'Evento previo CU014',true)",[evento]);
     await c.query("INSERT INTO alimentos.establecimientos(id,evento_id,nombre,estado,punto_entrega) VALUES($1,$2,'Punto previo','CERRADO','Puerta histórica')",[local,evento]);
     await c.query("INSERT INTO alimentos.productos(id,establecimiento_id,nombre,descripcion,precio,cantidad_inventario,activo) VALUES($1,$2,'Receta previa','Descripción original',1000.25,7,true)",[producto,local]);
     await c.query("INSERT INTO alimentos.pedidos(id,cliente_id,establecimiento_id,estado,total,moneda,metodo_entrega,expira_en,codigo_qr,confirmado_en) VALUES($1,$2,$3,'CONFIRMADO',2000.50,'COP','RECOGER',now()+interval '10 minutes',$4,now())",[pedido,cliente,local,qr]);
     await c.query("INSERT INTO alimentos.detalles_pedido(pedido_id,producto_id,nombre_producto,precio_unitario,cantidad,descripcion_producto,restricciones_alimentarias) VALUES($1,$2,'Nombre acordado',1000.25,2,'Descripción acordada','[\"leche\"]')",[pedido,producto]);
     await c.query("INSERT INTO alimentos.reservas_inventario(pedido_id,estado) VALUES($1,'CONSUMIDA')",[pedido]);
     await c.query("INSERT INTO alimentos.transacciones_pedido(id,pedido_id,monto,moneda,estado,referencia_pasarela) VALUES($1,$2,2000.50,'COP','APROBADA','referencia previa')",[pago,pedido]);
     await c.query("INSERT INTO finanzas_pagos.transacciones_pago(clave_idempotencia,tipo,solicitante,monto,moneda,resultado,referencia) VALUES($1,'COBRO','alimentos',2000.50,'COP','APROBADO','referencia previa')",[pago]);
     await c.query("INSERT INTO alimentos.preparaciones_pedido(pedido_id,estado,version,iniciado_en,estimado_listo_en,listo_en) VALUES($1,'LISTO_PARA_ENTREGAR',2,now(),now()+interval '10 minutes',now())",[pedido]);
     for(const [v,accion] of [[1,'INICIAR'],[2,'LISTO']])await c.query("INSERT INTO alimentos.historial_preparacion(id,pedido_id,actor_id,accion,huella,version_anterior,version_nueva,datos,resultado,aviso,creado_en) VALUES($1,$2,$3,$4,$5,$6,$7,'{}','{}','Aviso anterior',now())",[randomUUID(),pedido,randomUUID(),accion,'a'.repeat(64),v-1,v]);
     const tablas=['alimentos.productos','alimentos.pedidos','alimentos.transacciones_pedido','alimentos.reservas_inventario','alimentos.detalles_pedido','alimentos.establecimientos','alimentos.preparaciones_pedido','alimentos.historial_preparacion','alimentos.incidencias_preparacion','finanzas_pagos.transacciones_pago'];
     const anteriores=[];for(const t of tablas)anteriores.push((await c.query(`SELECT * FROM ${t} ORDER BY 1`)).rows);
     assert.deepEqual(preparar(base).esquemas.alimentos.aplicadas,['EntregaCu0141794600000000','CancelacionCu011F1794700000000']);
     for(let i=0;i<tablas.length;i++)assert.deepEqual((await c.query(`SELECT * FROM ${tablas[i]} ORDER BY 1`)).rows,anteriores[i]);
     const huella=createHash('sha256').update(qr).digest('hex');
     const encontrado=await c.query("SELECT id FROM alimentos.pedidos WHERE establecimiento_id=$1 AND codigo_qr IS NOT NULL AND encode(extensiones.digest(codigo_qr,'sha256'),'hex')=$2",[local,huella]);
     assert.deepEqual(encontrado.rows,[{id:pedido}]);
     assert.equal((await c.query('SELECT count(*)::int n FROM alimentos.entregas_pedido')).rows[0].n,0);
    }
    assert.equal((await c.query("SELECT count(*)::int n FROM pg_indexes WHERE schemaname='alimentos' AND indexname='idx_pedidos_punto_qr_huella'")).rows[0].n,1);
    assert.ok(Object.values(preparar(base).esquemas).every(g=>g.aplicadas.length===0));
    assert.equal((await c.query('SELECT count(*)::int n FROM migracion_control.procedencia')).rows[0].n,18);
    assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
    console.log(`${modo}: ${base}, 36 migraciones, 18 procedencias, repetición sin DDL; productos/reservas/pedidos/preparaciones/avisos/pagos locales y libro previos idénticos, QR conservado.`);
   }finally{await c.end();}
  }
 }finally{await control.end();await entorno.cerrar();}
})().catch(e=>{console.error(e.stack??e.message);process.exitCode=1;});
