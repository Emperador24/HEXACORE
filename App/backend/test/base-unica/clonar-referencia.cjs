const assert=require('node:assert/strict');
const fs=require('node:fs');const {resolve,join}=require('node:path');
const {execFileSync}=require('node:child_process');
const {directorio,cliente,guardas}=require('../consolidacion/config.cjs');
const {validarManifiesto,conciliar}=require('../consolidacion/ensayo.cjs');
const {inventario,comparar}=require('../consolidacion/catalogo.cjs');
const {argumentos}=require('./compose.cjs');
const {base,proyecto}=require('./conexiones.cjs');
const d=(a,o={})=>execFileSync('docker',a,{encoding:'utf8',maxBuffer:64*1024*1024,...o});
const inspeccionar=n=>JSON.parse(d(['inspect',n]))[0];
(async()=>{
  assert.equal(base,'hexacore_e2e','Clonar solo admite el recorrido A');
  assert.equal(proyecto,'hexacore-base-unica-e2e');
  const salida=directorio(process.argv[2]);guardas();const m=await validarManifiesto(salida);
  const archivo=resolve(__dirname,'../../.evidencia-e2e/base-unica.json');
  assert.ok(!fs.existsSync(archivo),'Ya existe una copia de ejecución; no se sobrescribe');
  assert.equal(d(['ps','-a','-q','--filter','label=com.docker.compose.project='+proyecto]).trim(),'','El proyecto de copia ya existe: no se modifica');
  assert.equal(d(['volume','ls','-q','--filter','label=com.docker.compose.project='+proyecto]).trim(),'','Hay volúmenes conservados: no se reutilizan ni borran');
  await conciliar(salida);
  const fuentes={};
  for(const servicio of ['redis','rabbitmq']){
    const c=inspeccionar('hexacore-backend-e2e-'+servicio+'-1');assert.equal(c.State.Status,'exited');
    assert.equal(c.Config.Labels['com.docker.compose.project'],'hexacore-backend-e2e');fuentes[servicio]=c;
  }
  process.env.RABBITMQ_NODO_PRUEBAS=fuentes.rabbitmq.Config.Hostname;
  fs.mkdirSync(resolve(__dirname,'../../.evidencia-e2e'),{recursive:true,mode:0o700});
  const datos={referencia:m.huella,salida,nodoRabbit:fuentes.rabbitmq.Config.Hostname,origen:m.identidad,fecha:new Date().toISOString()};
  fs.writeFileSync(archivo,JSON.stringify(datos,null,2),{mode:0o600,flag:'wx'});
  d([...argumentos(),'create','postgres','redis','rabbitmq','pasarela','correo']);
  for(const servicio of ['redis','rabbitmq']){
    const c=inspeccionar('hexacore-base-unica-e2e-'+servicio+'-1');
    assert.equal(c.Config.Labels['com.docker.compose.project'],'hexacore-base-unica-e2e');assert.equal(c.State.Status,'created');
    const src=fuentes[servicio].Mounts.find(x=>x.Type==='volume').Name,dst=c.Mounts.find(x=>x.Type==='volume').Name;
    assert.ok(dst.startsWith('hexacore-base-unica-e2e_'));assert.notEqual(src,dst);
    d(['run','--rm','--label','hexacore.uso=copia-base-unica','--entrypoint','sh','-v',src+':/origen:ro','-v',dst+':/destino','postgres:16-alpine','-c','test -z "$(ls -A /destino)" && cp -a /origen/. /destino/']);
  }
  d([...argumentos(),'up','-d','--wait','postgres','redis','rabbitmq','pasarela','correo']);
  const referencia=await cliente('destino','hexacore');
  try {
    // La referencia permanece inmóvil. Solo se restaura su dump en el nuevo servidor.
    const admin=await cliente('destino','postgres');try{await admin.query('ALTER DATABASE hexacore SET default_transaction_read_only=on');}finally{await admin.end();}
    const dump=d(['exec','hexacore-consolidacion-e2e-postgres-1','pg_dump','-U','cu011_e2e','-d','hexacore','-Fc'],{encoding:null});
    fs.writeFileSync(join(salida,'copia-ejecucion.dump'),dump,{mode:0o600,flag:'wx'});
    d(['exec','-i','hexacore-base-unica-e2e-postgres-1','pg_restore','-U','cu011_e2e','-d','hexacore_e2e','--single-transaction','--exit-on-error'],{input:dump});
    const {Client}=require('pg'),c=new Client(require('./conexiones.cjs').opcionesPg('identidad'));await c.connect();
    try{
      await c.query("COMMENT ON DATABASE hexacore_e2e IS 'copia-ejecucion:"+m.huella+"'");
      for(const modulo of m.modulos)comparar(await inventario(referencia,modulo.esquema),await inventario(c,modulo.esquema),'copia de ejecución '+modulo.esquema);
    }finally{await c.end();}
  }finally{await referencia.end();}
  console.log('Copia SQL idéntica antes de escrituras; Redis/RabbitMQ copiados sin tocar originales. No se han arrancado aplicaciones.');
})().catch(e=>{console.error(e);process.exitCode=1;});
