const {spawn}=require('node:child_process');const {resolve}=require('node:path');const assert=require('node:assert/strict');
const {entorno,base}=require('./conexiones.cjs');const {Client}=require('pg');const {opcionesPg}=require('./conexiones.cjs');
function preparar(extra={}){return new Promise((ok,fail)=>{let texto='';const p=spawn(process.execPath,[resolve(__dirname,'../../dist/compartido/persistencia/preparar-base.js')],{env:{...entorno(),...extra},stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>texto+=b);p.stderr.on('data',b=>texto+=b);p.once('error',fail);p.once('exit',codigo=>ok({codigo,texto}));});}
(async()=>{
  const r=await Promise.all([preparar(),preparar()]);
  for(const x of r){assert.equal(x.codigo,0,x.texto);const resultado=JSON.parse(x.texto.split('\n').find(l=>l.startsWith('{"base"')));assert.equal(resultado.base,base);assert.equal(Object.keys(resultado.esquemas).length,11);assert.ok(Object.values(resultado.esquemas).every(m=>m.aplicadas.length===0));}
  const error=await preparar({POSTGRES_BD_PAGOS:'pagos'});assert.notEqual(error.codigo,0);assert.match(error.texto,/Configuración PostgreSQL retirada/);
  const c=new Client(opcionesPg('identidad'));await c.connect();try{
    const n=(await c.query('SELECT count(*)::int n FROM migracion_control.procedencia')).rows[0].n;assert.equal(n,18);
    assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
  }finally{await c.end();}
  console.log('Dos preparaciones concurrentes serializadas, cero reaplicaciones y errores propagados: '+base);
})().catch(e=>{console.error(e);process.exitCode=1;});
