#!/usr/bin/env node
// Operaciones exclusivamente sobre los dos proyectos de pruebas fijados en config.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { mapa, raiz, q, lit, docker, guardas, cliente, directorio, composeOrigen, proyectoOrigen, proyectoDestino } = require('./config.cjs');
const { sha, inventario, comparar } = require('./catalogo.cjs');
const { migracionesOriginales } = require('./migraciones-originales.cjs');
const contenedor = lado => `${lado === 'origen' ? proyectoOrigen : proyectoDestino}-postgres-1`;
const guardar = (salida,nombre,valor) => fs.writeFileSync(join(salida,nombre),JSON.stringify(valor,null,2)+'\n',{mode:0o600,flag:'wx'});
const leer = (salida,nombre) => JSON.parse(fs.readFileSync(join(salida,nombre),'utf8'));
async function usar(lado,base,f) { const c = await cliente(lado,base); try { return await f(c); } finally { await c.end(); } }
function pg(lado,programa,args,opciones={}) { return docker(['exec','-i',contenedor(lado),programa,'-U','cu011_e2e',...args],opciones); }
async function sinEscritores() {
  // No mata sesiones desconocidas: si hay otra, se detiene el ensayo con evidencia.
  await usar('origen','postgres',async c => {
    const r = await c.query(`SELECT datname,application_name,state,xact_start FROM pg_stat_activity
      WHERE datname=ANY($1) AND backend_type='client backend'`,[mapa.map(m=>m.base)]);
    assert.deepEqual(r.rows,[],'Aún existen escritores/clientes: detener únicamente los del ensayo');
    assert.equal((await c.query('SELECT count(*)::int n FROM pg_prepared_xacts')).rows[0].n,0,'Transacción preparada pendiente');
    for (const m of mapa) {
      const d = (await c.query('SELECT setconfig FROM pg_db_role_setting s JOIN pg_database d ON d.oid=s.setdatabase WHERE d.datname=$1',[m.base])).rows;
      assert.ok(d.some(x=>x.setconfig.includes('default_transaction_read_only=on')),`Origen no inmovilizado: ${m.base}`);
    }
  });
}
async function inventariarTemporales(salida) {
  const Redis = require('ioredis');
  const redis = new Redis({host:'127.0.0.1',port:16382,lazyConnect:true});
  const keys = [];
  try {
    await redis.connect(); let cursor='0';
    do { const r = await redis.scan(cursor,'COUNT',100); cursor=r[0]; keys.push(...r[1]); } while(cursor!=='0');
    const temporal=[];
    for (const clave of keys.sort()) {
      const tipo = await redis.type(clave), ttl = await redis.pttl(clave), dump = await redis.dumpBuffer(clave);
      if (dump) temporal.push({clave,tipo,ttlMs:ttl,sha256:sha(dump)});
    }
    const tiempo = await redis.time();
    await redis.save();
    docker(['cp',`${proyectoOrigen}-redis-1:/data/dump.rdb`,join(salida,'redis.rdb')]);
    fs.chmodSync(join(salida,'redis.rdb'),0o600);
    guardar(salida,'redis.json',{tiempo,claves:temporal,rdbSha256:sha(fs.readFileSync(join(salida,'redis.rdb'))),advertencia:'TTL sigue corriendo; inventario separado del corte SQL. No se migra ni elimina ninguna reserva.'});
  } finally { redis.disconnect(); }
  const cabeceras={Authorization:'Basic '+Buffer.from('cu011_e2e:cu011_e2e').toString('base64')};
  const obtener = async ruta => {const r=await fetch('http://127.0.0.1:16775/api/'+ruta,{headers:cabeceras});assert.equal(r.status,200);return r.json();};
  const conexiones=await obtener('connections');
  assert.equal(conexiones.length,0,'Conexiones AMQP aún activas en el broker aislado');
  const colas=await obtener('queues/cu011');
  // checkQueue obtiene conteos actuales del broker, sin extraer/reencolar mensajes.
  const amqp=await import('amqplib');const conn=await amqp.connect('amqp://cu011_e2e:cu011_e2e@127.0.0.1:15675/cu011');
  try {const canal=await conn.createChannel();for(const cola of colas){const r=await canal.checkQueue(cola.name);assert.equal(r.consumerCount,0);cola.corte={pendientes:r.messageCount,consumidores:r.consumerCount};}await canal.close();}finally{await conn.close();}
  guardar(salida,'rabbitmq.json',{colas:colas.map(c=>({nombre:c.name,durable:c.durable,arguments:c.arguments,corte:c.corte})),
    exchanges:await obtener('exchanges/cu011'),bindings:await obtener('bindings/cu011'),advertencia:'Solo inventario; sin consumir/purgar mensajes. No equivale a respaldo restaurable de mensajes.'});
}
async function capturar(salida) {
  assert.ok(!fs.existsSync(join(salida,'manifiesto.json')),'Referencia ya capturada; usa un directorio nuevo, no sobrescribas respaldos');
  const identidad=guardas();
  const originales=migracionesOriginales(); // Validar procedencia antes de inmovilizar el origen.
  const fixtures=leer(salida,'fixtures.json');assert.deepEqual(fixtures.identidad,identidad);
  docker([...composeOrigen,'stop','gateway','nucleo','boleteria','pasarela']);
  await usar('origen','postgres',async c=>{for(const m of mapa)await c.query(`ALTER DATABASE ${q(m.base)} SET default_transaction_read_only=on`);});
  await sinEscritores();
  await inventariarTemporales(salida);
  const modulos=[];
  for(const m of mapa){
    await sinEscritores();
    const antes=await usar('origen',m.base,c=>inventario(c,'public'));
    // Esta versión solo acepta los dos cuerpos PL/pgSQL de solo inserción ya revisados.
    for(const f of antes.funciones){assert.ok(['auditoria_cuentas_solo_insercion','historial_propietarios_solo_insercion'].includes(f.nombre));assert.ok(!/public\s*\./i.test(f.definicion.replace(/FUNCTION public\./,'')),'SQL textual public requiere revisión explícita');}
    const historia=await usar('origen',m.base,async c=>(await c.query(`SELECT id,"timestamp"::text,nombre.name FROM ${q(m.historial)} nombre ORDER BY id`)).rows);
    assert.equal(historia.length,m.cantidad);
    assert.deepEqual(historia.map(h=>h.name).sort(),originales.filter(o=>o.conexion===m.conexion).map(o=>o.nombre).sort());
    const archivo=m.esquema+'.dump';
    const dump=pg('origen','pg_dump',['-d',m.base,'--format=custom'],{encoding:null});
    fs.writeFileSync(join(salida,archivo),dump,{mode:0o600,flag:'wx'});
    const despues=await usar('origen',m.base,c=>inventario(c,'public'));
    comparar(antes,despues,m.conexion+' durante captura');
    modulos.push({...m,archivo,sha256:sha(dump),inventario:antes,historia});
  }
  // Segunda vuelta conjunta: detecta cambios en cualquier base durante los ocho dumps.
  await sinEscritores();
  for(const m of modulos)comparar(m.inventario,await usar('origen',m.base,c=>inventario(c,'public')),m.conexion+' después del corte');
  const extensiones={};
  for(const m of modulos)for(const e of m.inventario.extensiones){
    assert.ok(['public','pg_catalog'].includes(e.esquema));
    if(extensiones[e.nombre])assert.deepEqual(extensiones[e.nombre],e,'Extensiones incompatibles');else extensiones[e.nombre]=e;
  }
  const systemas={};for(const lado of ['origen','destino'])systemas[lado]=await usar(lado,'postgres',async c=>(await c.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier);
  assert.notEqual(systemas.origen,systemas.destino);
  const manifiesto={version:1,fecha:new Date().toISOString(),identidad,systemas,originales,extensiones,modulos};
  manifiesto.huella=sha(JSON.stringify(manifiesto));
  guardar(salida,'manifiesto.json',manifiesto);
  guardar(salida,'referencias-origen.json',await referencias('origen'));
  console.log('Corte SQL inmóvil, ocho respaldos y 18 migraciones verificadas; temporales inventariados sin borrado.');
}
async function validarManifiesto(salida){
  const m=leer(salida,'manifiesto.json'),{huella,...resto}=m;
  assert.equal(huella,sha(JSON.stringify(resto)),'Manifiesto modificado');
  assert.deepEqual(m.identidad,guardas(),'Contenedor sustituido desde la referencia');
  for(const lado of ['origen','destino'])assert.equal(await usar(lado,'postgres',async c=>(await c.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id),m.systemas[lado],'Cluster sustituido');
  assert.deepEqual(m.originales,migracionesOriginales(),'Código de migraciones distinto a la referencia');
  assert.deepEqual(m.modulos.map(({inventario,historia,archivo,sha256,...datos})=>datos),mapa);
  for(const modulo of m.modulos){assert.equal(modulo.archivo,modulo.esquema+'.dump');assert.equal(sha(fs.readFileSync(join(salida,modulo.archivo))),modulo.sha256,'Respaldo alterado/incompleto');}
  return m;
}
async function referencias(lado){
  // Consultas explícitas de relaciones lógicas sin crear FK nuevas ni corregir discrepancias.
  const filas={};
  for(const m of mapa)filas[m.esquema]=await usar(lado,lado==='origen'?m.base:'hexacore',async c=>{
    await c.query(`SET search_path TO ${q(lado==='origen'?'public':m.esquema)},extensiones,pg_catalog`);
    const tablas={identidad:['usuarios','auditoria_cuentas'],alimentos:['pedidos','transacciones_pedido'],personal_logistica:['empleados'],
      entradas_ventas:['entradas','compras','cancelaciones','historial_propietarios'],entradas_catalogo:[],entradas_postventa:['publicaciones_reventa','transacciones_reventa'],entradas_acceso_qr:['qr_entradas','ingresos'],finanzas_pagos:['transacciones_pago']}[m.esquema];
    const resultado={};for(const t of tablas)resultado[t]=(await c.query(`SELECT row_to_json(t)::text fila FROM ${q(t)} t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows.map(r=>JSON.parse(r.fila));return resultado;
  });
  const cuentas=new Set(filas.identidad.usuarios.map(r=>r.id));
  const entradas=new Map(filas.entradas_ventas.entradas.map(r=>[r.id,r]));
  const libro=filas.finanzas_pagos.transacciones_pago;
  const referenciasLibro=new Set(libro.filter(r=>r.referencia).map(r=>r.referencia));
  const huecos={cuentasPedido:filas.alimentos.pedidos.filter(r=>!cuentas.has(r.cliente_id)).length,
    cuentasPropietario: [...entradas.values()].filter(r=>!cuentas.has(r.propietario_id)).length,
    cuentasEmpleado:filas.personal_logistica.empleados.filter(r=>!cuentas.has(r.usuarioId)).length,
    referenciasCompras:filas.entradas_ventas.compras.filter(r=>r.referencia_pasarela&&!referenciasLibro.has(r.referencia_pasarela)).length,
    referenciasAlimentos:filas.alimentos.transacciones_pedido.filter(r=>r.referencia_pasarela&&!referenciasLibro.has(r.referencia_pasarela)).length,
    qrSinAutoridad:filas.entradas_acceso_qr.qr_entradas.filter(r=>!entradas.has(r.entrada_id)).length,
    ingresosSinAutoridad:filas.entradas_acceso_qr.ingresos.filter(r=>!entradas.has(r.entrada_id)).length,
    qrDivergente:filas.entradas_acceso_qr.qr_entradas.filter(r=>{const e=entradas.get(r.entrada_id);return e&&(r.hash_qr!==sha(e.codigo_qr)||r.estado!==e.estado);}).length,
    reventasSinAutoridad:filas.entradas_postventa.publicaciones_reventa.filter(r=>!entradas.has(r.entrada_id)).length,
    financierosSinFinalizar:filas.alimentos.transacciones_pedido.filter(r=>r.estado==='FALLIDA'&&libro.some(l=>l.clave_idempotencia===r.id&&l.resultado==='APROBADO')).length};
  // Importes se suman en PostgreSQL como numeric, nunca con Number de JavaScript.
  const dinero=await usar(lado,lado==='origen'?'pagos_e2e':'hexacore',async c=>(await c.query(`SELECT solicitante,tipo,moneda,resultado,count(*)::text cantidad,sum(monto)::text total FROM ${lado==='origen'?'public':'finanzas_pagos'}.transacciones_pago GROUP BY solicitante,tipo,moneda,resultado ORDER BY solicitante,tipo,moneda,resultado`)).rows);
  return {huecos,dinero,hashReferencias:sha(JSON.stringify(filas))};
}
async function crearBase(nombre,comentario){
  return usar('destino','postgres',async c=>{
    const r=await c.query('SELECT shobj_description(oid,\'pg_database\') comentario FROM pg_database WHERE datname=$1',[nombre]);
    if(r.rowCount){assert.equal(r.rows[0].comentario,comentario,'Base existente ajena a este respaldo: no tocar');return false;}
    await c.query(`CREATE DATABASE ${q(nombre)} TEMPLATE template0`);await c.query(`COMMENT ON DATABASE ${q(nombre)} IS ${lit(comentario)}`);return true;
  });
}
async function restaurar(salida,{reanudar=false}={}){
  const manifiesto=await validarManifiesto(salida);
  const resultados=[];
  for(const m of manifiesto.modulos){
    const nombre='restauracion_'+m.esquema,marca=`ensayo-restauracion:${manifiesto.huella}:${m.esquema}`;
    const nueva=await crearBase(nombre,marca);
    const anterior=await usar('destino',nombre,c=>inventario(c,'public'));
    if(nueva||(reanudar&&anterior.objetos.length===0&&anterior.extensiones.length===1)){
      // pg_dump asume el public estándar de template0. No se elimina.
      await usar('destino',nombre,async c=>{
        const otros=await c.query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')");assert.deepEqual(otros.rows,[]);
        await c.query('CREATE SCHEMA IF NOT EXISTS public AUTHORIZATION pg_database_owner');
        await c.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
      });
      pg('destino','pg_restore',['-d',nombre,'--exit-on-error','--single-transaction'],{input:fs.readFileSync(join(salida,m.archivo))});
    }
    // Si una restauración se interrumpió, falla aquí; no la acepta ni sobreescribe.
    const restaurado=await usar('destino',nombre,c=>inventario(c,'public'));
    comparar(m.inventario,restaurado,'restauración '+m.esquema);
    resultados.push({base:nombre,tablas:Object.keys(restaurado.filas).length,filas:Object.values(restaurado.filas).reduce((n,t)=>n+t.cantidad,0)});
  }
  fs.writeFileSync(join(salida,'restauracion-verificada.json'),JSON.stringify(resultados,null,2)+'\n',{mode:0o600});
  console.log('Ocho restauraciones originales conciliadas: '+resultados.reduce((n,r)=>n+r.filas,0)+' filas.');
}
async function prepararSQL(salida,manifiesto){
  for(const m of manifiesto.modulos){
    const base='preparacion_'+m.esquema,marca=`ensayo-preparacion:${manifiesto.huella}:${m.esquema}`;
    const nueva=await crearBase(base,marca);
    if(nueva){
      pg('destino','pg_restore',['-d',base,'--exit-on-error','--single-transaction'],{input:fs.readFileSync(join(salida,m.archivo))});
      await usar('destino',base,async c=>{
        await c.query('BEGIN');
        await c.query('CREATE SCHEMA extensiones');
        for(const e of m.inventario.extensiones.filter(e=>e.esquema==='public')){
          assert.equal(e.trasladable,true,'Extensión no relocatable: requiere decisión explícita');
          await c.query(`ALTER EXTENSION ${q(e.nombre)} SET SCHEMA extensiones`);
        }
        await c.query(`ALTER SCHEMA public RENAME TO ${q(m.esquema)}`);
        await c.query('COMMIT');
      });
    }
    comparar(m.inventario,await usar('destino',base,c=>inventario(c,m.esquema)),'preparación '+m.esquema);
    const sql=pg('destino','pg_dump',['-d',base,'--schema='+m.esquema]);
    assert.ok(!/\bpublic\./.test(sql),'Referencia SQL public residual: revisar antes de transferir');
    fs.writeFileSync(join(salida,m.esquema+'.sql'),sql,{mode:0o600});
  }
}
async function transferir(salida,opciones){
  const manifiesto=await validarManifiesto(salida);
  fs.rmSync(join(salida,'conciliacion.json'),{force:true});
  await restaurar(salida,opciones); // No permite transferir un respaldo sin restauración comprobada.
  await prepararSQL(salida,manifiesto);
  const nueva=await crearBase('hexacore','ensayo-hexacore:'+manifiesto.huella);
  if(!nueva){
    assert.ok(opciones.reanudar||opciones['verificar-existente'],'Destino existente: requiere --reanudar (vacío) o --verificar-existente (completo)');
    const existe=await usar('destino','hexacore',async c=>(await c.query("SELECT to_regclass('migracion_control.ensayo') AS tabla")).rows[0].tabla);
    if(existe){assert.ok(opciones['verificar-existente'],'Destino completo: usa --verificar-existente');await conciliar(salida);console.log('Repetición verificada: cero registros escritos.');return;}
    assert.ok(opciones.reanudar,'Destino incompleto: requiere --reanudar');
  }
  await usar('destino','hexacore',async c=>{const r=await c.query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')");assert.deepEqual(r.rows,[],'Destino parcial/ajeno: no se reconstruye ni duplica silenciosamente');});
  let sql='CREATE SCHEMA extensiones;\n';
  for(const e of Object.values(manifiesto.extensiones).filter(e=>e.esquema==='public'))sql+=`CREATE EXTENSION ${q(e.nombre)} WITH SCHEMA extensiones VERSION ${lit(e.version)};\n`;
  for(const [i,m] of manifiesto.modulos.entries()){
    sql+=fs.readFileSync(join(salida,m.esquema+'.sql'),'utf8')+'\n';
    // PG16 trata la ACL inicial de public como implícita aun tras renombrarlo;
    // pg_dump -n no la reproduce para un esquema nuevo. Preserva explícitamente
    // la ACL estándar constatada; no adivina permisos si el origen evoluciona.
    const permiso=await usar('origen',m.base,async c=>(await c.query("SELECT pg_get_userbyid(nspowner) propietario,nspacl::text acl FROM pg_namespace WHERE nspname='public'")).rows[0]);
    assert.deepEqual(permiso,{propietario:'pg_database_owner',acl:'{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}'},'ACL no estándar: ampliar transferencia antes de usarla');
    sql+=`GRANT USAGE ON SCHEMA ${q(m.esquema)} TO PUBLIC;\n`;
    if(Number(opciones['fallar-despues'])===i+1)sql+='SELECT 1/0; -- fallo controlado, revierte TODO\n';
    if(Number(opciones['interrumpir-despues'])===i+1)sql+='SELECT pg_terminate_backend(pg_backend_pid()); -- pérdida de conexión propia\n';
  }
  sql+=`CREATE SCHEMA migracion_control;
    CREATE TABLE migracion_control.ensayo(huella text PRIMARY KEY,estado text NOT NULL CHECK(estado IN ('TRANSFERIDO','CONCILIADO')),fecha timestamptz NOT NULL DEFAULT now());
    INSERT INTO migracion_control.ensayo(huella,estado) VALUES(${lit(manifiesto.huella)},'TRANSFERIDO');
    CREATE TABLE migracion_control.procedencia(conexion text NOT NULL,origen text NOT NULL,esquema text NOT NULL,historial text NOT NULL,nombre text NOT NULL,ruta text NOT NULL,sha256 text NOT NULL,PRIMARY KEY(conexion,nombre));\n`;
  for(const o of manifiesto.originales){const m=mapa.find(m=>m.conexion===o.conexion);sql+=`INSERT INTO migracion_control.procedencia VALUES(${[o.conexion,m.base,m.esquema,m.historial,o.nombre,o.ruta,o.sha256].map(lit).join(',')});\n`;}
  fs.writeFileSync(join(salida,'transferencia.sql'),sql,{mode:0o600});
  try {pg('destino','psql',['-X','-d','hexacore','--single-transaction','-v','ON_ERROR_STOP=1'],{input:sql,stdio:['pipe','pipe','pipe']});}
  catch(e){fs.writeFileSync(join(salida,'transferencia-ultimo-fallo.log'),String(e.stderr||e.message),{mode:0o600});throw new Error('Transferencia abortada; véase evidencia privada. Transacción completa revertida; no hay marca CONCILIADO. Usa --reanudar tras inspeccionar.');}
  await conciliar(salida);
  console.log('Transferencia atómica de ocho esquemas conciliada; aplicaciones aún utilizan ocho bases originales.');
}
async function conciliar(salida){
  const manifiesto=await validarManifiesto(salida);await sinEscritores();
  for(const m of manifiesto.modulos){
    comparar(m.inventario,await usar('origen',m.base,c=>inventario(c,'public')),'origen congelado '+m.esquema);
    comparar(m.inventario,await usar('destino','hexacore',c=>inventario(c,m.esquema)),'destino '+m.esquema,{extensionesCompartidas:true});
  }
  const extensiones=await usar('destino','hexacore',async c=>(await c.query("SELECT extname nombre,extversion version,n.nspname esquema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY extname")).rows);
  assert.deepEqual(extensiones,Object.values(manifiesto.extensiones).map(e=>({nombre:e.nombre,version:e.version,esquema:e.esquema==='public'?'extensiones':e.esquema})).sort((a,b)=>a.nombre.localeCompare(b.nombre)));
  const control=await usar('destino','hexacore',async c=>({marca:(await c.query('SELECT huella,estado FROM migracion_control.ensayo')).rows,
    procedencia:(await c.query('SELECT conexion,nombre,ruta,sha256 FROM migracion_control.procedencia ORDER BY conexion,nombre')).rows}));
  assert.equal(control.marca.length,1);
  assert.equal(control.marca[0].huella,manifiesto.huella);
  assert.ok(['TRANSFERIDO','CONCILIADO'].includes(control.marca[0].estado));
  assert.deepEqual(control.procedencia,[...manifiesto.originales].sort((a,b)=>a.conexion.localeCompare(b.conexion)||a.nombre.localeCompare(b.nombre)));
  const ref=await referencias('destino');assert.deepEqual(ref,leer(salida,'referencias-origen.json'),'Relaciones/dinero/propietarios/QR distintos');
  const catalogos=await conciliarCompartidos(manifiesto);
  if(control.marca[0].estado==='TRANSFERIDO')await usar('destino','hexacore',c=>c.query("UPDATE migracion_control.ensayo SET estado='CONCILIADO' WHERE huella=$1 AND estado='TRANSFERIDO'",[manifiesto.huella]));
  fs.writeFileSync(join(salida,'catalogos-compartidos.json'),JSON.stringify(catalogos,null,2)+'\n',{mode:0o600});
  fs.writeFileSync(join(salida,'conciliacion.json'),JSON.stringify({estado:'CONCILIADO',huella:manifiesto.huella,modulos:mapa.length,migraciones:control.procedencia.length,referencias:ref},null,2)+'\n',{mode:0o600});
  console.log('Conciliación completa: estructura, contenido SHA-256, secuencias, índices, restricciones, funciones/triggers, relaciones y dinero.');
}
async function conciliarCompartidos(manifiesto){
  const propiedades=async c=>(await c.query(`SELECT pg_encoding_to_char(encoding) encoding,datcollate,datctype,datlocprovider,daticulocale,datcollversion
    FROM pg_database WHERE datname=current_database()`)).rows[0];
  const funciones=async(c)=>{
    await c.query('SET search_path TO pg_catalog');
    return (await c.query(`SELECT e.extname extension,p.proname nombre,pg_get_function_identity_arguments(p.oid) argumentos,
      pg_get_function_result(p.oid) resultado,l.lanname lenguaje,p.prosrc cuerpo,p.probin biblioteca,
      p.prosecdef security_definer,p.provolatile volatilidad,pg_get_userbyid(p.proowner) propietario,p.proacl::text permisos
      FROM pg_depend d JOIN pg_proc p ON d.classid='pg_proc'::regclass AND d.objid=p.oid JOIN pg_extension e ON e.oid=d.refobjid
      JOIN pg_language l ON l.oid=p.prolang WHERE d.refclassid='pg_extension'::regclass AND d.deptype='e'
      ORDER BY e.extname,p.proname,argumentos`)).rows;
  };
  const esquema=async(c,n)=>(await c.query(`SELECT pg_get_userbyid(nspowner) propietario,nspacl::text permisos,
    obj_description(oid,'pg_namespace') comentario FROM pg_namespace WHERE nspname=$1`,[n])).rows;
  const union=new Map();
  for(const m of manifiesto.modulos){
    const original=await usar('origen',m.base,async c=>({base:await propiedades(c),esquema:await esquema(c,'public'),funciones:await funciones(c)}));
    for(const base of ['restauracion_'+m.esquema,'preparacion_'+m.esquema,'hexacore']){
      const n=base.startsWith('restauracion_')?'public':m.esquema;
      assert.deepEqual(await usar('destino',base,c=>esquema(c,n)),original.esquema,'Propietario/permisos del esquema '+n);
      assert.deepEqual(await usar('destino',base,propiedades),original.base,'Encoding/collation de '+base);
    }
    for(const f of original.funciones){const k=[f.extension,f.nombre,f.argumentos].join(':');if(union.has(k))assert.deepEqual(union.get(k),f,'Funciones de extensión incompatibles');else union.set(k,f);}
  }
  const destino=await usar('destino','hexacore',funciones);
  assert.equal(destino.length,union.size);
  for(const f of destino)assert.deepEqual(f,union.get([f.extension,f.nombre,f.argumentos].join(':')),'Función de extensión distinta');
  return {funcionesExtensiones:destino,esquemas:mapa.map(m=>m.esquema)};
}
async function reiniciarDestinoPruebas(salida){
  const m=await validarManifiesto(salida);
  // Acción explícita para repetir la batería destructiva de fallos. Nunca toca origen/restauraciones/respaldos.
  await usar('destino','postgres',async c=>{
    for(const [base,marca] of [['verificacion_hexacore','ensayo-sondas:'+m.huella],['hexacore','ensayo-hexacore:'+m.huella]]){
      const d=await c.query("SELECT shobj_description(oid,'pg_database') marca FROM pg_database WHERE datname=$1",[base]);
      if(d.rowCount){
        assert.equal(d.rows[0].marca,marca,'Destino ajeno: no se elimina');
        assert.equal((await c.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[base])).rows[0].n,0,'Destino en uso: no se elimina');
        await c.query(`DROP DATABASE ${q(base)}`);
      }
    }
  });
  fs.rmSync(join(salida,'conciliacion.json'),{force:true});
  console.log('Reinicio explícito: eliminadas solo hexacore/verificacion_hexacore de este ensayo identificado. Respaldos y ocho restauraciones conservados.');
}
async function main(){
  const [accion,...argumentos]=process.argv.slice(2),opciones={};
  for(const a of argumentos){assert.match(a,/^--(?:salida|reanudar|verificar-existente|fallar-despues|interrumpir-despues)(?:=|$)/);const [k,v]=a.slice(2).split('=');opciones[k]=v??true;}
  for(const k of ['fallar-despues','interrumpir-despues'])if(opciones[k]!==undefined)assert.ok(Number.isInteger(Number(opciones[k]))&&Number(opciones[k])>=1&&Number(opciones[k])<=8);
  guardas();const salida=directorio(opciones.salida);
  const acciones={preparar:()=>require('./preparar.cjs').preparar(salida),capturar:()=>capturar(salida),restaurar:()=>restaurar(salida,opciones),transferir:()=>transferir(salida,opciones),conciliar:()=>conciliar(salida),'reiniciar-destino-pruebas':()=>reiniciarDestinoPruebas(salida)};
  assert.ok(acciones[accion],'Acción: preparar | capturar | restaurar | transferir | conciliar | reiniciar-destino-pruebas');
  await acciones[accion]();
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validarManifiesto,restaurar,conciliar,referencias,sinEscritores};
