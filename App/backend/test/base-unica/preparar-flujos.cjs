const {execFileSync}=require('node:child_process');
const {resolve}=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
const {Client}=require('pg');const {opcionesPg,base,proyecto}=require('./conexiones.cjs');const {argumentos}=require('./compose.cjs');
const {preparar}=require('../consolidacion/preparar.cjs');
(async()=>{
  const c=JSON.parse(execFileSync('docker',['inspect',proyecto+'-postgres-1'],{encoding:'utf8'}))[0];
  assert.equal(c.Config.Labels['com.docker.compose.project'],proyecto);
  assert.deepEqual(c.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'15439'}]);
  const carpeta=resolve(__dirname,'../../.evidencia-e2e/flujos-'+base+'-'+Date.now());fs.mkdirSync(carpeta,{recursive:true,mode:0o700});
  await preparar(carpeta,{identidad:{base,contenedor:c.Id},gateway:'http://127.0.0.1:18082/api/v1',
    cliente:async esquema=>{const db=new Client(opcionesPg(esquema));await db.connect();assert.equal((await db.query('SELECT current_database() b,current_schema() e')).rows[0].e,esquema);return db;},
    prepararEvento:async(eventoId,creadoPor)=>{
      // Fixture exclusivo de las aplicaciones actuales, tanto sobre la copia
      // transferida como sobre la instalación vacía. No publica eventos ni toca
      // el origen histórico; las cuatro proyecciones se preparan más abajo.
      const db=new Client(opcionesPg('eventos'));await db.connect();
      try{
        const sesion=(await db.query('SELECT current_database() b,current_schema() e')).rows[0];
        assert.deepEqual(sesion,{b:base,e:'eventos_recintos'});
        await db.query('BEGIN');
        const recinto=(await db.query("INSERT INTO recintos(nombre,ciudad,capacidad) VALUES($1,'Bogotá',100) RETURNING id",['Ensayo '+eventoId])).rows[0];
        await db.query("INSERT INTO eventos(id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en) VALUES($1,'Ensayo','Conciertos',$2,now()+interval '30 days',now()+interval '31 days',100,'PUBLICADO',$3,now())",[eventoId,recinto.id,creadoPor]);
        await db.query('COMMIT');
      }catch(error){await db.query('ROLLBACK');throw error;}
      finally{await db.end();}
    },
    prepararInventario:id=>execFileSync('docker',[...argumentos(true),'exec','-T','nucleo','node','dist/modulos/alimentos/inventario/preparar-inventario.js',id,'--compras-detenidas'],{encoding:'utf8'})});
  console.log('Escenario común de 46 comprobaciones completado sobre '+base);
})().catch(e=>{console.error(e);process.exitCode=1;});
