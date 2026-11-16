// Coordinación operativa de este ámbito vacío. Solo A, nunca bootstrap Nest.
const { Client } = require('/app/node_modules/pg');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const e=process.env;
function exigir(v,m){if(!v)throw new Error(m);}
async function cliente(){
  const c=new Client({host:e.POSTGRES_HOST,port:Number(e.POSTGRES_PUERTO),user:e.POSTGRES_USUARIO,
    password:e.POSTGRES_CONTRASENA,database:e.POSTGRES_BD,connectionTimeoutMillis:3000,query_timeout:3000});
  await c.connect();return c;
}
(async()=>{
  exigir(e.DEMO_ROL==='A' && /^hexacore_zt_[a-z0-9_]+$/.test(e.POSTGRES_BD),'Solo preparación propia de A');
  const cuentas=process.argv.includes('--cuentas-demo');
  let c=await cliente();
  try{
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('hexacore:demo-zerotier',0))");
    await c.query(`CREATE TABLE IF NOT EXISTS migracion_control.demo_zerotier(
      id boolean PRIMARY KEY DEFAULT true CHECK(id), demo text NOT NULL, fuente text NOT NULL,
      estado text NOT NULL CHECK(estado IN ('EN_CURSO','LISTA')), cuentas_demo boolean NOT NULL)`);
    const anteriores=await c.query('SELECT * FROM migracion_control.demo_zerotier FOR UPDATE');
    if(anteriores.rowCount){
      const r=anteriores.rows[0];
      exigir(r.demo===e.DEMO_ID && r.fuente===e.DEMO_FUENTE && r.estado==='LISTA' && (!cuentas || r.cuentas_demo),
        'Preparación anterior incompleta/diferente; conservar y diagnosticar, no resembrar');
      await c.query('COMMIT');console.log(JSON.stringify({estado:'LISTA',anterior:true}));return;
    }
    if(cuentas){
      for(const h of JSON.parse(fs.readFileSync('/demo/historial.json','utf8'))){
        exigir(/^[a-z_]+$/.test(h.esquema),'Esquema inválido');
        const tablas=await c.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[h.esquema]);
        for(const t of tablas.rows){
          if(['migraciones','migrations'].includes(t.tablename) || (h.esquema==='identidad' && t.tablename==='roles'))continue;
          exigir(/^[a-z_]+$/.test(t.tablename),'Tabla inválida');
          const r=await c.query(`SELECT count(*)::int AS n FROM "${h.esquema}"."${t.tablename}"`);
          exigir(r.rows[0].n===0,'No sembrar sobre datos existentes');
        }
      }
    }
    await c.query("INSERT INTO migracion_control.demo_zerotier(id,demo,fuente,estado,cuentas_demo) VALUES(true,$1,$2,'EN_CURSO',$3)",[e.DEMO_ID,e.DEMO_FUENTE,cuentas]);
    await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
  finally{await c.end();}
  if(cuentas){
    // Reutiliza exactamente la semilla compilada de Identidad, solo con tablas vacías.
    // B está bloqueado por EN_CURSO y A aún no tiene la referencia de arranque.
    const r=spawnSync(process.execPath,['dist/modulos/identidad/persistencia/semillas/sembrar.js'],
      // El CLI existente prohíbe production: solo este hijo de fixtures usa development.
      // Las apps mantienen production/HTTPS; no se modifica su entorno ni el CLI.
      {encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,env:{...e,NODE_ENV:'development'}});
    // Python guarda esta salida, incluida la contraseña de fixtures, en archivo privado600.
    if(r.stdout)process.stdout.write(r.stdout);
    if(r.stderr)process.stderr.write(r.stderr);
    exigir(r.status===0,'Semilla incompleta: no repetir ni habilitar apps sin diagnóstico');
  }
  c=await cliente();
  try{
    await c.query("UPDATE migracion_control.demo_zerotier SET estado='LISTA' WHERE id AND demo=$1 AND fuente=$2 AND estado='EN_CURSO'",[e.DEMO_ID,e.DEMO_FUENTE]);
    console.log(JSON.stringify({estado:'LISTA',cuentas_demo:cuentas}));
  }finally{await c.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
