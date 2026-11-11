const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {resolve,join}=require('node:path');const {execFileSync}=require('node:child_process');const {randomUUID}=require('node:crypto');
const {Client}=require('pg');const {base,proyecto,opcionesPg}=require('./conexiones.cjs');
const db=async(modulo,f)=>{const c=new Client(opcionesPg(modulo));await c.connect();try{return await f(c);}finally{await c.end();}};
const inspeccionar=servicio=>JSON.parse(execFileSync('docker',['inspect',proyecto+'-'+servicio+'-1'],{encoding:'utf8'}))[0];
const referencia=()=>{const m=JSON.parse(fs.readFileSync(resolve(__dirname,'../../.evidencia-e2e/base-unica.json'),'utf8'));return JSON.parse(fs.readFileSync(join(m.salida,'fixtures.json'),'utf8'));};
async function api(ruta,metodo='GET',cuerpo,token){const r=await fetch('http://127.0.0.1:18082/api/v1'+ruta,{method:metodo,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:cuerpo===undefined?undefined:JSON.stringify(cuerpo),signal:AbortSignal.timeout(10000)});const texto=await r.text();return {status:r.status,body:texto?JSON.parse(texto):null};}
test('configuración efectiva, pools y únicos procesos corresponden a una base con sus ocho esquemas',async()=>{
  const env={};
  for(const app of ['nucleo','boleteria','trabajador']){
    const c=inspeccionar(app);assert.equal(c.Config.Labels['com.docker.compose.project'],proyecto);
    env[app]=Object.fromEntries(c.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
    const ps=execFileSync('docker',['exec',c.Id,'ps','-o','pid,args'],{encoding:'utf8'});
    assert.equal(ps.split('\n').filter(s=>new RegExp('^\\s*\\d+\\s+node dist/apps/'+app+'/main\\.js$').test(s)).length,1);
  }
  assert.equal(env.nucleo.POSTGRES_BD,base);assert.equal(env.boleteria.POSTGRES_BD,base);
  assert.ok(!env.boleteria.PASARELA_SECRETO_WEBHOOK);assert.ok(!env.boleteria.AUTH_JWT_CLAVE_PRIVADA_ARCHIVO);
  assert.ok(!Object.keys(env.trabajador).some(k=>/^(POSTGRES_|DB_|REDIS_|AUTH_JWT_|PAGOS_)/.test(k)));
  for(const app of ['nucleo','boleteria'])assert.ok(!Object.keys(env[app]).some(k=>/^(POSTGRES_BD_|DB_)/.test(k)));
  await db('pagos',async c=>{
    const con=(await c.query("SELECT DISTINCT datname,application_name FROM pg_stat_activity WHERE application_name LIKE 'nucleo-%' OR application_name LIKE 'boleteria-%' OR application_name LIKE 'finanzas-pagos:%' ORDER BY application_name")).rows;
    assert.ok(con.length>=9);assert.ok(con.every(r=>r.datname===base));
    for(const n of ['finanzas-pagos:nucleo','finanzas-pagos:boleteria'])assert.ok(con.some(r=>r.application_name===n));
    assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
    assert.equal((await c.query('SELECT count(*)::int n FROM migracion_control.procedencia')).rows[0].n,18);
  });
});
test('datos conservados se consultan con login nuevo; instalación vacía conserva roles y contratos',async()=>{
  if(base==='hexacore_e2e'){
    const f=referencia();
    const cuenta=await db('identidad',async c=>(await c.query('SELECT email,hash_contrasena FROM usuarios WHERE id=$1',[f.cuentas.cliente])).rows[0]);
    assert.ok(cuenta.hash_contrasena.startsWith('scrypt$'));
    const login=await api('/sesiones','POST',{email:cuenta.email,contrasena:'EnsayoHexacore22!'});assert.equal(login.status,200);
    const token=login.body.token;assert.equal((await api('/cuentas/perfil','GET',undefined,token)).body.id,f.cuentas.cliente);
    const personal=await db('identidad',async c=>(await c.query('SELECT email FROM usuarios WHERE id=$1',[f.cuentas.personal])).rows[0]);
    const sesionPersonal=await api('/sesiones','POST',{email:personal.email,contrasena:'EnsayoHexacore22!'});assert.equal(sesionPersonal.status,200);
    const rutaPedidos='/pedidos/establecimientos/'+f.ids.local+'/pedidos';
    // El corte original precede al vínculo CU-015. Primero se comprueba la
    // guarda actual y luego se completa el fixture solo en la copia del ensayo.
    assert.equal((await api(rutaPedidos,'GET',undefined,sesionPersonal.body.token)).status,403);
    await db('alimentos',async c=>{
      assert.equal((await c.query('SELECT current_database() b,current_schema() e')).rows[0].b,base);
      const vinculo=await c.query('INSERT INTO personal_establecimiento(establecimiento_id,usuario_id,asignado_por) VALUES($1,$2,$3)',[f.ids.local,f.cuentas.personal,f.cuentas.admin]);
      assert.equal(vinculo.rowCount,1);
    });
    const pedidos=await api(rutaPedidos,'GET',undefined,sesionPersonal.body.token);assert.equal(pedidos.status,200);
    const pedido=pedidos.body.find(p=>p.id===f.ids.pedidos[0]);assert.ok(pedido);assert.equal(pedido.total,'1150.25');assert.equal(pedido.moneda,'COP');
    assert.equal((await api('/sesiones/actual','DELETE',undefined,sesionPersonal.body.token)).status,200);
    assert.equal((await api('/compras/'+f.ids.compra,'GET',undefined,token)).status,200);
    assert.equal((await api('/sesiones/actual','DELETE',undefined,token)).status,200);
    assert.equal((await api('/cuentas/perfil','GET',undefined,token)).status,401);
  }else{
    await db('identidad',async c=>assert.deepEqual((await c.query('SELECT nombre FROM roles ORDER BY nombre')).rows.map(r=>r.nombre),['Administrador','Cliente','Organizador','Personal']));
    assert.equal((await api('/compras','POST',{})).status,401);
  }
});
test('correo real de Identidad llega al simulador, sin nuevas dependencias SQL del Trabajador',async()=>{
  const email='base-unica-'+randomUUID()+'@example.test';
  assert.equal((await api('/cuentas/registro','POST',{nombre:'Prueba base única',email,contrasena:'EnsayoBaseUnica22!'})).status,202);
  let entregado;const limite=Date.now()+10000;
  while(!entregado&&Date.now()<limite){const r=await fetch('http://127.0.0.1:13106/estado?para='+encodeURIComponent(email));assert.equal(r.status,200);entregado=(await r.json()).intentos.find(i=>i.aceptado);if(!entregado)await new Promise(r=>setTimeout(r,100));}
  assert.ok(entregado);assert.match(entregado.cuerpo.texto,/https:\/\/portal.example.test\/cuenta/);
  if(base==='hexacore_e2e'){
    const anterior=await fetch('http://127.0.0.1:13106/estado?para='+encodeURIComponent(referencia().pendiente));
    assert.ok((await anterior.json()).intentos.some(i=>i.aceptado),'Correo pendiente copiado no entregado');
  }
});
test('consumidores únicos conservan los pendientes sin consumidor implementado',async()=>{
  const amqp=await import('amqplib');const c=await amqp.connect('amqp://cu011_e2e:cu011_e2e@127.0.0.1:15679/cu011');
  try{const ch=await c.createChannel();
    for(const cola of ['cuentas.correos','nucleo-e2e.turnos.cambios','acceso-qr.entradas','ventas.ingresos','ventas.notificaciones','reventa.notificaciones','reventa.liquidaciones'])assert.equal((await ch.checkQueue(cola)).consumerCount,1,cola);
    const pendientes=await ch.checkQueue('pedidos.establecimientos');assert.equal(pendientes.consumerCount,0);const esperado=base==='hexacore_e2e'?(()=>{const m=JSON.parse(fs.readFileSync(resolve(__dirname,'../../.evidencia-e2e/base-unica.json'),'utf8'));return JSON.parse(fs.readFileSync(join(m.salida,'rabbitmq.json'),'utf8')).colas.find(c=>c.nombre==='pedidos.establecimientos').corte.pendientes;})():0;
    assert.ok(pendientes.messageCount>=esperado);
    await ch.close();
  }finally{await c.close();}
});
test('historial de propietarios y auditoría conservan los triggers de solo inserción',async()=>{
  for(const [modulo,tabla,codigo] of [['ventas','historial_propietarios','P0001'],['identidad','auditoria_cuentas','23001']])await db(modulo,async c=>{
    const fila=(await c.query('SELECT id FROM '+tabla+' LIMIT 1')).rows[0];assert.ok(fila);
    await c.query('BEGIN');try{await assert.rejects(()=>c.query('DELETE FROM '+tabla+' WHERE id=$1',[fila.id]),e=>e.code===codigo);}finally{await c.query('ROLLBACK');}
  });
});
