const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {resolve}=require('node:path');
const {Client}=require('pg');
const {conectar,backend}=require('./entorno.cjs');
(async()=>{
  const entorno=await conectar();
  const comunes={host:'127.0.0.1',port:15459,user:process.env.POSTGRES_USUARIO,password:process.env.POSTGRES_CONTRASENA};
  const control=new Client({...comunes,database:'hexacore_cu015'});await control.connect();
  function preparar(base,anterior=false) {
    const codigo=`const h=require(${JSON.stringify(resolve(backend,'dist/compartido/persistencia/historia'))});
      ${anterior?"const g=h.GRUPOS_MIGRACIONES.find(g=>g.conexion==='alimentos');g.migraciones=g.migraciones.filter(M=>!['MenuInventarioCu0121794400000000','PreparacionCu0131794500000000','EntregaCu0141794600000000','CancelacionCu011F1794700000000'].includes(M.name));":''}
      require(${JSON.stringify(resolve(backend,'dist/compartido/persistencia/preparar-base'))}).prepararBase().catch(e=>{console.error(e.message);process.exitCode=1;});`;
    const e={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',POSTGRES_HOST:'127.0.0.1',POSTGRES_PUERTO:'15459',
      POSTGRES_USUARIO:comunes.user,POSTGRES_CONTRASENA:comunes.password,POSTGRES_BD:base};
    const salida=execFileSync(process.execPath,['-e',codigo],{env:e,cwd:'/tmp',encoding:'utf8'});
    return JSON.parse(salida.trim().split('\n').at(-1));
  }
  try {
    const sufijo=randomUUID().replaceAll('-','').slice(0,12);
    for(const modo of ['vacia','actualizacion']) {
      const base=`cu012_${sufijo}_${modo}`;
      await control.query(`CREATE DATABASE "${base}"`);
      assert.equal(preparar(base,modo==='actualizacion').migraciones,modo==='vacia'?36:32);
      const c=new Client({...comunes,database:base});await c.connect();
      try {
        if(modo==='actualizacion') {
          const evento=randomUUID(),local=randomUUID(),producto=randomUUID(),pedido=randomUUID();
          await c.query("INSERT INTO alimentos.eventos_referencia(evento_id,nombre,disponible) VALUES($1,'Evento conservado',true)",[evento]);
          await c.query("INSERT INTO alimentos.establecimientos(id,evento_id,nombre,estado,punto_entrega) VALUES($1,$2,'Local previo','CERRADO','Puerta previa')",[local,evento]);
          await c.query("INSERT INTO alimentos.productos(id,establecimiento_id,nombre,precio,cantidad_inventario,activo) VALUES($1,$2,'Producto previo',1000.25,10,true)",[producto,local]);
          await c.query("INSERT INTO alimentos.pedidos(id,cliente_id,establecimiento_id,estado,total,moneda,metodo_entrega,expira_en) VALUES($1,$2,$3,'PENDIENTE_PAGO',4001.00,'COP','RECOGER',now()+interval '10 minutes')",[pedido,randomUUID(),local]);
          await c.query("INSERT INTO alimentos.detalles_pedido(pedido_id,producto_id,nombre_producto,precio_unitario,cantidad) VALUES($1,$2,'Snapshot previo',1000.25,4)",[pedido,producto]);
          await c.query("INSERT INTO alimentos.reservas_inventario(pedido_id,estado) VALUES($1,'ACTIVA')",[pedido]);
          const tablas=['productos','pedidos','detalles_pedido','reservas_inventario','establecimientos'];
          const previas=[];
          for(const t of tablas)previas.push((await c.query(`SELECT * FROM alimentos.${t}`)).rows);
          const r=preparar(base);assert.deepEqual(r.esquemas.alimentos.aplicadas,['MenuInventarioCu0121794400000000','PreparacionCu0131794500000000','EntregaCu0141794600000000','CancelacionCu011F1794700000000']);
          for(let n=0;n<tablas.length;n++) {
            const nuevas=(await c.query(`SELECT * FROM alimentos.${tablas[n]}`)).rows;
            assert.equal(nuevas.length,previas[n].length);
            assert.deepEqual(nuevas.map(f=>Object.fromEntries(Object.keys(previas[n][0]).map(k=>[k,f[k]]))),previas[n]);
          }
          assert.deepEqual((await c.query('SELECT restricciones_alimentarias FROM alimentos.productos')).rows[0].restricciones_alimentarias,[]);
          assert.equal((await c.query('SELECT count(*)::int n FROM alimentos.operaciones_inventario')).rows[0].n,0);
        }
        assert.ok(Object.values(preparar(base).esquemas).every(g=>g.aplicadas.length===0));
        assert.equal((await c.query('SELECT count(*)::int n FROM migracion_control.procedencia')).rows[0].n,18);
        assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
        console.log(`${modo}: ${base}, 36 migraciones, repetición sin DDL, 18 procedencias; productos/reservas/pedidos previos conservados.`);
      } finally { await c.end(); }
    }
  } finally { await control.end();await entorno.cerrar(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
