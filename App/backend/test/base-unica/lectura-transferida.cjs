const assert=require('node:assert/strict');
const fs=require('node:fs');const {resolve}=require('node:path');
const {entorno,base}=require('./conexiones.cjs');
process.env=entorno();
const {GRUPOS_MIGRACIONES}=require('../../dist/compartido/persistencia/historia');
const modulos=['identidad','alimentos','personal-logistica','entradas/ventas','entradas/catalogo','entradas/postventa','entradas/acceso-qr','finanzas/pagos','eventos-recintos'];
(async()=>{
  assert.equal(base,'hexacore_e2e','La lectura de referencia se hace solo sobre la copia transferida');
  const fuentes=[];
  try{
    for(const [i,ruta] of modulos.entries()){
      const datos=require('../../dist/modulos/'+ruta+'/persistencia/data-source').default;await datos.initialize();fuentes.push(datos);
      const g=GRUPOS_MIGRACIONES[i];
      assert.equal(datos.options.schema,g.esquema);assert.equal(datos.options.synchronize,false);assert.equal(datos.options.migrationsRun,false);
      const [p]=await datos.query('SELECT current_database() base,current_schema() esquema,current_setting(\'search_path\') ruta');
      assert.equal(p.base,base);assert.equal(p.esquema,g.esquema);assert.equal(p.ruta,g.esquema+',pg_catalog,extensiones');
      assert.equal(await datos.showMigrations(),false,'No reconoce historial original '+g.conexion);
      const [{n}]=await datos.query(`SELECT count(*)::int n FROM "${g.esquema}"."${g.historial}"`);assert.equal(n,g.migraciones.length);
    }
    const [{n:publicas}]=await fuentes[0].query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'");assert.equal(publicas,0);
    // Lectura ORM real de cada familia: no se reemplaza por datos nuevos ni semillas.
    const objetos=[['identidad','Usuario','usuarios'],['alimentos','Pedido','pedidos'],['personal-logistica','Empleado','empleados'],['entradas/ventas','Compra','compras'],['entradas/ventas','Entrada','entradas'],['entradas/ventas','HistorialPropietario','historial_propietarios'],['entradas/acceso-qr','QrEntrada','qr_entradas'],['finanzas/pagos','TransaccionPago','transacciones_pago']];
    for(const [ruta,entidad,tabla] of objetos){const fuente=fuentes[modulos.indexOf(ruta)];const meta=fuente.entityMetadatas.find(e=>e.tableName===tabla);assert.ok(meta,entidad);assert.ok(await fuente.getRepository(meta.target).findOne({where:{},order:{[meta.primaryColumns[0].propertyName]:'ASC'}}),'Sin registro conservado '+tabla);}
    assert.ok((await fuentes[0].query('SELECT id FROM auditoria_cuentas')).length);
    const [{n:movimientos}]=await fuentes[7].query('SELECT count(*)::int n FROM transacciones_pago');const archivo=JSON.parse(fs.readFileSync(resolve(__dirname,'../../.evidencia-e2e/base-unica.json'),'utf8'));
    const referencia=JSON.parse(fs.readFileSync(resolve(archivo.salida,'manifiesto.json'),'utf8'));
    assert.equal(movimientos,referencia.modulos.find(m=>m.esquema==='finanzas_pagos').inventario.filas.transacciones_pago.cantidad);
    const actividad=await fuentes[0].query("SELECT DISTINCT datname FROM pg_stat_activity WHERE backend_type='client backend' AND application_name <> ''");
    assert.deepEqual(actividad.map(x=>x.datname),[base]);
    fs.mkdirSync(resolve(__dirname,'../../.evidencia-e2e'),{recursive:true});
    fs.writeFileSync(resolve(__dirname,'../../.evidencia-e2e/lectura-transferida.json'),JSON.stringify({base,esquemas:GRUPOS_MIGRACIONES.map(g=>g.esquema),historias:GRUPOS_MIGRACIONES.reduce((n,g)=>n+g.migraciones.length,0),movimientos,publicas}),{mode:0o600});
    console.log('Nueve conexiones/nueve historiales/20 migraciones reconocidos; lectura ORM de cuentas, pedidos, personal, compras, propietarios, QR, auditoría y libro; cero tablas public.');
  }finally{for(const d of fuentes)await d.destroy();}
})().catch(e=>{console.error(e);process.exitCode=1;});
