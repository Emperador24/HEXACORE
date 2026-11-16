// Regresión dirigida: reutilizar la conexión de la sonda, sin datos ni escrituras.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const {configuracion}=require('../cu012/entorno.cjs');
configuracion(); // Valida exclusivamente PostgreSQL/puertos/etiquetas CU-015.
const {opcionesSesion}=require('../../dist/compartido/persistencia/esquemas');
const sesion=opcionesSesion('identidad');assert.equal(sesion.min,1);
const comunes={...sesion,host:'127.0.0.1',port:15459,database:'hexacore_cu015',
 user:process.env.POSTGRES_USUARIO,password:process.env.POSTGRES_CONTRASENA,
 max:10,connectionTimeoutMillis:3000,query_timeout:3000,statement_timeout:3000};
(async()=>{
 const resultados=[];
 for(const min of [0,sesion.min]){
  const pool=new Pool({...comunes,min,application_name:`cu015-pool-${randomUUID()}`});
  assert.equal(pool.options.idleTimeoutMillis,10000);
  const pids=[];
  try{
   for(let paso=0;paso<3;paso++){
    // Intervalo de la sonda + margen de planificación; las consultas siguen a 3 s.
    if(paso)await new Promise(r=>setTimeout(r,10500));
    const r=await pool.query('SELECT pg_backend_pid() pid');pids.push(r.rows[0].pid);
   }
  }finally{await pool.end();}
  assert.equal(pool.totalCount,0,'end debe cerrar incluso la conexión mínima');
  const distintos=new Set(pids).size;assert.equal(distintos,min===0?3:1);
  resultados.push({min,consultas:pids.length,backendsDistintos:distintos,cerradas:true});
 }
 console.log(JSON.stringify(resultados));
})().catch(e=>{console.error(e.code??e.message);process.exitCode=1;});
