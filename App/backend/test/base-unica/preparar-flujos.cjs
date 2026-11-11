const {execFileSync}=require('node:child_process');
const {resolve}=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
const {Client}=require('pg');const {opcionesPg,base,proyecto}=require('./conexiones.cjs');const {argumentos}=require('./compose.cjs');
const {preparar}=require('../consolidacion/preparar.cjs');
const {prepararEvento}=require('./preparar-evento.cjs');
(async()=>{
  const c=JSON.parse(execFileSync('docker',['inspect',proyecto+'-postgres-1'],{encoding:'utf8'}))[0];
  assert.equal(c.Config.Labels['com.docker.compose.project'],proyecto);
  assert.deepEqual(c.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'15439'}]);
  const carpeta=resolve(__dirname,'../../.evidencia-e2e/flujos-'+base+'-'+Date.now());fs.mkdirSync(carpeta,{recursive:true,mode:0o700});
  await preparar(carpeta,{identidad:{base,contenedor:c.Id},gateway:'http://127.0.0.1:18082/api/v1',
    cliente:async esquema=>{const db=new Client(opcionesPg(esquema));await db.connect();assert.equal((await db.query('SELECT current_database() b,current_schema() e')).rows[0].e,esquema);return db;},
    prepararEvento,
    prepararInventario:id=>execFileSync('docker',[...argumentos(true),'exec','-T','nucleo','node','dist/modulos/alimentos/inventario/preparar-inventario.js',id,'--compras-detenidas'],{encoding:'utf8'})});
  console.log('Escenario común de 46 comprobaciones completado sobre '+base);
})().catch(e=>{console.error(e);process.exitCode=1;});
