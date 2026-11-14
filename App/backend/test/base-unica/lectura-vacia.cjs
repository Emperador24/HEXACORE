const assert=require('node:assert/strict');const {Client}=require('pg');
const {base,opcionesPg}=require('./conexiones.cjs');
const {GRUPOS_MIGRACIONES,PROCEDENCIA_ORIGINAL}=require('../../dist/compartido/persistencia/historia');
(async()=>{
  assert.equal(base,'hexacore_vacia_e2e','Solo instalación nueva, antes de fixtures');
  const c=new Client(opcionesPg('identidad'));await c.connect();
  try{
    const tablas=(await c.query('SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1) ORDER BY schemaname,tablename',[GRUPOS_MIGRACIONES.map(g=>g.esquema)])).rows;
    // CU-011F añade una sola tabla, propiedad de Alimentos; no basta variar el total.
    assert.deepEqual((await c.query("SELECT schemaname,tablename FROM pg_tables WHERE tablename='cancelaciones_pedido'")).rows,
      [{schemaname:'alimentos',tablename:'cancelaciones_pedido'}]);
    assert.equal(tablas.length,85);let filas=0;
    for(const g of GRUPOS_MIGRACIONES){
      const historia=(await c.query(`SELECT name,timestamp::text FROM "${g.esquema}"."${g.historial}" ORDER BY timestamp`)).rows;
      const esperada=g.migraciones.map(M=>{const name=new M().name??M.name;return {name,timestamp:name.match(/\d{13}$/)[0]};})
        .sort((a,b)=>Number(a.timestamp)-Number(b.timestamp));
      assert.deepEqual(historia,esperada,`Nombres, marcas e historial del propietario ${g.conexion}`);
    }
    for(const t of tablas){const n=(await c.query(`SELECT count(*)::int n FROM "${t.schemaname}"."${t.tablename}"`)).rows[0].n;
      const grupo=GRUPOS_MIGRACIONES.find(g=>g.esquema===t.schemaname);
      const esperadas=t.tablename===grupo.historial?grupo.migraciones.length:t.schemaname==='identidad'&&t.tablename==='roles'?4:0;
      assert.equal(n,esperadas,t.schemaname+'.'+t.tablename);filas+=n;
    }
    assert.equal(filas,39);assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
    const originales=(await c.query('SELECT * FROM migracion_control.procedencia')).rows;
    assert.equal(originales.length,18);
    const esperadas=PROCEDENCIA_ORIGINAL.map(h=>{const g=GRUPOS_MIGRACIONES.find(g=>g.conexion===h.conexion);
      return {...h,origen:'instalacion-vacia',esquema:g.esquema,historial:g.historial};});
    const porOrigen=rows=>Object.fromEntries(rows.map(h=>[h.conexion+':'+h.nombre,h]));
    assert.deepEqual(porOrigen(originales),porOrigen(esperadas),'18 procedencias completas, con dueño, fuente y SHA intactos');
    console.log('Instalación vacía: 85 tablas (incluida alimentos.cancelaciones_pedido), 35 historiales por nombre/dueño + cuatro roles, cero negocio/public y 18 procedencias intactas; sin semillas.');
  }finally{await c.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
