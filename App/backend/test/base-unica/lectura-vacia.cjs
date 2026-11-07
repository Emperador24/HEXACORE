const assert=require('node:assert/strict');const {Client}=require('pg');
const {base,opcionesPg}=require('./conexiones.cjs');
const {GRUPOS_MIGRACIONES}=require('../../dist/compartido/persistencia/historia');
(async()=>{
  assert.equal(base,'hexacore_vacia_e2e','Solo instalación nueva, antes de fixtures');
  const c=new Client(opcionesPg('identidad'));await c.connect();
  try{
    const tablas=(await c.query('SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1) ORDER BY schemaname,tablename',[GRUPOS_MIGRACIONES.map(g=>g.esquema)])).rows;
    assert.equal(tablas.length,76);let filas=0;
    for(const t of tablas){const n=(await c.query(`SELECT count(*)::int n FROM "${t.schemaname}"."${t.tablename}"`)).rows[0].n;
      const grupo=GRUPOS_MIGRACIONES.find(g=>g.esquema===t.schemaname);
      const esperadas=t.tablename===grupo.historial?grupo.migraciones.length:t.schemaname==='identidad'&&t.tablename==='roles'?4:0;
      assert.equal(n,esperadas,t.schemaname+'.'+t.tablename);filas+=n;
    }
    assert.equal(filas,31);assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
    assert.equal((await c.query("SELECT count(*)::int n FROM migracion_control.procedencia WHERE origen='instalacion-vacia'")).rows[0].n,18);
    console.log('Instalación vacía: 76 tablas, 27 historiales + cuatro roles, cero filas de negocio/public; sin semillas.');
  }finally{await c.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
