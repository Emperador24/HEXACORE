const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {join}=require('node:path');
const {spawnSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {guardas,cliente,directorio,mapa,q,lit,validarInspeccion}=require('./config.cjs');
const {validarManifiesto,restaurar,conciliar}=require('./ensayo.cjs');
const {normalizarCheck}=require('./catalogo.cjs');
let salida,manifiesto;
const usar=async(base,f)=>{const c=await cliente('destino',base);try{return await f(c);}finally{await c.end();}};
function ejecutar(...args){return spawnSync(process.execPath,[join(__dirname,'ensayo.cjs'),...args,'--salida='+salida],{encoding:'utf8',timeout:120000});}
async function vacio(){await usar('hexacore',async c=>assert.deepEqual((await c.query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')")).rows,[],'Quedó carga parcial tras fallo'));}
before(async()=>{salida=directorio(process.env.ENSAYO_SALIDA);guardas();manifiesto=await validarManifiesto(salida);});
test('guardas rechazan proyecto/puertos habituales, bases arbitrarias y salida en repositorio',async()=>{
  const correcto={Config:{Labels:{'com.docker.compose.project':'hexacore-backend-e2e','com.docker.compose.service':'postgres'},Env:['POSTGRES_USER=cu011_e2e','POSTGRES_PASSWORD=cu011_e2e']},State:{Running:true},NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'15435'}]}}};
  validarInspeccion(correcto,'hexacore-backend-e2e',15435);
  for(const alterar of [c=>c.Config.Labels['com.docker.compose.project']='hexacore',c=>c.NetworkSettings.Ports['5432/tcp'][0].HostPort='5432',c=>c.Config.Env[0]='POSTGRES_USER=postgres']){const c=structuredClone(correcto);alterar(c);assert.throws(()=>validarInspeccion(c,'hexacore-backend-e2e',15435));}
  await assert.rejects(()=>cliente('destino','administracion'),/Base no autorizada/);
  assert.throws(()=>directorio(__dirname));
});
test('respaldo alterado es rechazado antes de restaurar o transferir',async()=>{
  const alterado=directorio(salida+'-alterado');
  fs.copyFileSync(join(salida,'manifiesto.json'),join(alterado,'manifiesto.json'));
  for(const m of manifiesto.modulos)fs.copyFileSync(join(salida,m.archivo),join(alterado,m.archivo));
  fs.appendFileSync(join(alterado,manifiesto.modulos[0].archivo),'CORRUPTO');
  await assert.rejects(()=>validarManifiesto(alterado),/Respaldo alterado/);
});
test('comparación normaliza solo casts equivalentes de arrays literales y detecta reglas diferentes',()=>{
  assert.equal(normalizarCheck("CHECK (accion::text = ANY (ARRAY['ACTIVAR'::character varying, 'ELIMINAR'::character varying]::text[]))"),normalizarCheck("CHECK (accion::text = ANY (ARRAY['ACTIVAR'::character varying::text, 'ELIMINAR'::character varying::text]))"));
  assert.notEqual(normalizarCheck("CHECK (monto > 0)"),normalizarCheck("CHECK (monto >= 0)"));
  assert.equal(normalizarCheck("CHECK (columna::text = 'ACTIVA'::text)"),"CHECK (columna::text = 'ACTIVA'::text)");
});
test('ocho respaldos restauran estructura, datos y secuencias en otras ocho bases',async()=>{await restaurar(salida);});
test('fallo controlado tras tres esquemas aborta y revierte la transacción completa',async()=>{
  const r=ejecutar('transferir','--fallar-despues=3');assert.notEqual(r.status,0,r.stdout);assert.match(r.stderr,/Transferencia abortada/);await vacio();
});
test('pérdida de conexión al reanudar también revierte y no marca éxito',async()=>{
  const r=ejecutar('transferir','--reanudar','--interrumpir-despues=3');assert.notEqual(r.status,0,r.stdout);assert.match(r.stderr,/Transferencia abortada/);await vacio();
});
test('reanuda un destino vacío identificado y concilia sin duplicación',async()=>{
  const r=ejecutar('transferir','--reanudar');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Transferencia atómica/);await conciliar(salida);
});
test('destino existente exige decisión explícita y repetición verificada no escribe',async()=>{
  await usar('postgres',async c=>{
    await c.query("COMMENT ON DATABASE hexacore IS 'marca-ajena-fixture' ");
    try{const ajena=ejecutar('transferir','--verificar-existente');assert.notEqual(ajena.status,0);assert.match(ajena.stderr,/Base existente ajena/);}
    finally{await c.query(`COMMENT ON DATABASE hexacore IS ${lit('ensayo-hexacore:'+manifiesto.huella)}`);}
  });
  const rechazada=ejecutar('transferir');assert.notEqual(rechazada.status,0);assert.match(rechazada.stderr,/Destino existente/);
  const repetir=ejecutar('transferir','--verificar-existente');assert.equal(repetir.status,0,repetir.stderr);assert.match(repetir.stdout,/cero registros escritos/);await conciliar(salida);
});
test('origen permanece de solo lectura y no admite nuevas escrituras durante el corte',async()=>{
  const c=await cliente('origen','pagos_e2e');try{
    await assert.rejects(()=>c.query("INSERT INTO transacciones_pago(clave_idempotencia,tipo,solicitante,monto,moneda,resultado) VALUES('guardia-ensayo','COBRO','prueba',1,'COP','INDETERMINADO')"),e=>e.code==='25006');
  }finally{await c.end();}
});
test('secuencias restauradas avanzan desde su estado original sin chocar con seriales',async()=>{
  await usar('postgres',async c=>{
    assert.equal((await c.query("SELECT count(*)::int n FROM pg_database WHERE datname='verificacion_hexacore'")).rows[0].n,0,'La base de sondas ya existe; no se sobrescribe');
    await c.query('CREATE DATABASE verificacion_hexacore TEMPLATE hexacore');
    await c.query(`COMMENT ON DATABASE verificacion_hexacore IS ${lit('ensayo-sondas:'+manifiesto.huella)}`);
  });
  let n=0;
  await usar('verificacion_hexacore',async c=>{
    for(const m of manifiesto.modulos)for(const s of m.inventario.secuencias){
      const esperada=s.usado?BigInt(s.ultimo)+BigInt(s.incremento):BigInt(s.ultimo);
      const valor=(await c.query('SELECT nextval($1::regclass)::text n',[`${q(m.esquema)}.${q(s.nombre)}`])).rows[0].n;
      assert.equal(valor,esperada.toString(),m.esquema+'.'+s.nombre);
      for(const v of s.vinculo){const max=(await c.query(`SELECT max(${q(v.columna)})::text n FROM ${q(m.esquema)}.${q(v.tabla)}`)).rows[0].n;if(max!==null)assert.ok(BigInt(valor)>BigInt(max),'Secuencia serial retrasada');}
      n++;
    }
  });
  assert.ok(n>8,'No se ejecutaron las sondas de secuencias');console.log('Secuencias comprobadas mediante nextval en copia propia:',n);
});
test('inserción propia y restricciones PK/FK/check/unique y triggers inmutables siguen funcionando',async()=>{
  await usar('verificacion_hexacore',async c=>{
    await c.query('BEGIN');
    try{
      await c.query("INSERT INTO finanzas_pagos.transacciones_pago(clave_idempotencia,tipo,solicitante,monto,moneda,resultado,referencia) VALUES($1,'COBRO','sonda',123.45,'USD','APROBADO',$2)",[randomUUID(),'sonda-'+randomUUID()]);
      const rechazar=async(sql,parametros,codigo)=>{await c.query('SAVEPOINT sonda');await assert.rejects(()=>c.query(sql,parametros),e=>e.code===codigo);await c.query('ROLLBACK TO SAVEPOINT sonda');};
      await rechazar("INSERT INTO finanzas_pagos.transacciones_pago(clave_idempotencia,tipo,solicitante,monto,moneda,resultado) VALUES($1,'COBRO','sonda',-1,'COP','INDETERMINADO')",[randomUUID()],'23514');
      await rechazar("INSERT INTO finanzas_pagos.transacciones_pago(clave_idempotencia,tipo,solicitante,monto,moneda,resultado) VALUES($1,'COBRO','sonda',1,'COP','APROBADO')",[randomUUID()],'23514');
      await rechazar('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) VALUES($1,$2)',[randomUUID(),randomUUID()],'23503');
      await rechazar('INSERT INTO identidad.roles SELECT * FROM identidad.roles LIMIT 1',[],'23505');
      const audit=(await c.query('SELECT id FROM identidad.auditoria_cuentas LIMIT 1')).rows[0];assert.ok(audit);
      await rechazar('UPDATE identidad.auditoria_cuentas SET motivo=\'sonda\' WHERE id=$1',[audit.id],'23001');
      const historial=(await c.query('SELECT id FROM entradas_ventas.historial_propietarios LIMIT 1')).rows[0];assert.ok(historial);
      // El trigger original de Ventas usa RAISE EXCEPTION sin ERRCODE (P0001).
      await rechazar('DELETE FROM entradas_ventas.historial_propietarios WHERE id=$1',[historial.id],'P0001');
    }finally{await c.query('ROLLBACK');}
  });
});
test('sondas no modifican ni origen ni destino conciliado; las restauraciones vuelven a conciliar',async()=>{
  await conciliar(salida);await restaurar(salida);
});
