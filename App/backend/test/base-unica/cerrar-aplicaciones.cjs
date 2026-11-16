const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');
const {Client}=require('pg');const {proyecto,opcionesPg}=require('./conexiones.cjs');
const {argumentos}=require('./compose.cjs');
(async()=>{
  execFileSync('docker',[...argumentos(true),'stop','gateway','nucleo','boleteria','trabajador'],{stdio:'inherit'});
  for(const app of ['nucleo','boleteria','trabajador']){
    const c=JSON.parse(execFileSync('docker',['inspect',proyecto+'-'+app+'-1']))[0];
    assert.equal(c.Config.Labels['com.docker.compose.project'],proyecto);
    assert.equal(c.State.Status,'exited');assert.equal(c.State.OOMKilled,false);
    assert.ok([0,143].includes(c.State.ExitCode),'Cierre forzado: '+app+' '+c.State.ExitCode);
  }
  const c=new Client(opcionesPg('pagos'));await c.connect();
  try{assert.equal((await c.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name LIKE 'nucleo-%' OR application_name LIKE 'boleteria-%' OR application_name LIKE 'finanzas-pagos:%'")).rows[0].n,0);}finally{await c.end();}
  const amqp=await require('amqplib').connect('amqp://cu011_e2e:cu011_e2e@127.0.0.1:15679/cu011');
  try{const canal=await amqp.createChannel();
    for(const cola of ['cuentas.correos','nucleo-e2e.turnos.cambios','acceso-qr.entradas','ventas.ingresos','ventas.notificaciones','reventa.notificaciones','reventa.liquidaciones','pedidos.establecimientos'])assert.equal((await canal.checkQueue(cola)).consumerCount,0,cola);
    await canal.close();
  }finally{await amqp.close();}
  console.log('SIGTERM de las tres imágenes: sin SIGKILL/OOM, sin pools SQL ni consumidores; datos y colas conservados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
