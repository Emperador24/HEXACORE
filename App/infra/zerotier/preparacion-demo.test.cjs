// Dobles de SQL/proceso: no se abre una base ni se ejecuta una semilla real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const fuente=fs.readFileSync(require('node:path').join(__dirname,'preparacion-demo.cjs'),'utf8');

async function caso({rol='A',cuentas=false,anterior=null,ocupado=false,semilla=0}={}){
  const consultas=[],hijos=[];let marca=anterior, codigo=0;
  class Client{
    async connect(){} async end(){}
    async query(sql,args){
      consultas.push(sql);
      if(sql.startsWith('SELECT *'))return {rowCount:marca?1:0,rows:marca?[marca]:[]};
      if(sql.includes('FROM pg_tables'))return {rows:[{tablename:'usuarios'},{tablename:'roles'},{tablename:'migraciones'}]};
      if(sql.startsWith('SELECT count'))return {rows:[{n:ocupado?1:0}]};
      if(sql.startsWith('INSERT INTO'))marca={demo:args[0],fuente:args[1],estado:'EN_CURSO',cuentas_demo:args[2]};
      if(sql.startsWith('UPDATE'))marca.estado='LISTA';
      return {rowCount:1,rows:[]};
    }
  }
  const proceso={env:{DEMO_ROL:rol,DEMO_ID:'fixture',DEMO_FUENTE:'a'.repeat(40),
    POSTGRES_BD:'hexacore_zt_fixture',NODE_ENV:'production'},argv:cuentas?['node','script','--cuentas-demo']:['node','script'],
    execPath:process.execPath,stdout:{write(){}},stderr:{write(){}},set exitCode(v){codigo=v;}};
  const dependencias={
    '/app/node_modules/pg':{Client},'node:fs':{readFileSync:()=>JSON.stringify([{esquema:'identidad'}])},
    'node:child_process':{spawnSync:(...args)=>{hijos.push(args);return {status:semilla,stdout:'',stderr:''};}},
  };
  await vm.runInNewContext(fuente,{require:n=>dependencias[n],process:proceso,console:{log(){},error(){}}});
  return {consultas,hijos,codigo,marca};
}
test('B rechaza antes de SQL o procesos',async()=>{
  const r=await caso({rol:'B',cuentas:true});assert.equal(r.codigo,1);assert.deepEqual(r.consultas,[]);assert.deepEqual(r.hijos,[]);
});
test('preparación sin opción no ejecuta semilla',async()=>{
  const r=await caso();assert.equal(r.codigo,0);assert.equal(r.marca.estado,'LISTA');assert.equal(r.hijos.length,0);
});
test('datos presentes bloquean semilla y conservan tablas',async()=>{
  const r=await caso({cuentas:true,ocupado:true});assert.equal(r.codigo,1);assert.equal(r.hijos.length,0);
  assert.equal(r.marca,null);assert(r.consultas.includes('ROLLBACK'));assert(!r.consultas.some(s=>/TRUNCATE|DELETE/.test(s)));
});
test('vacío permite solo el CLI existente de Identidad y un hijo development',async()=>{
  const r=await caso({cuentas:true});assert.equal(r.codigo,0);assert.equal(r.hijos.length,1);
  assert.deepEqual(Array.from(r.hijos[0][1]),['dist/modulos/identidad/persistencia/semillas/sembrar.js']);
  assert.equal(r.hijos[0][2].env.NODE_ENV,'development');assert.equal(r.marca.cuentas_demo,true);assert.equal(r.marca.estado,'LISTA');
});
test('fallo conserva EN_CURSO y bloquea repetición',async()=>{
  const r=await caso({cuentas:true,semilla:1});assert.equal(r.codigo,1);assert.equal(r.marca.estado,'EN_CURSO');
  const otro=await caso({cuentas:true,anterior:r.marca});assert.equal(otro.codigo,1);assert.equal(otro.hijos.length,0);
});
test('LISTA misma fuente no vuelve a sembrar',async()=>{
  const r=await caso({cuentas:true,anterior:{demo:'fixture',fuente:'a'.repeat(40),estado:'LISTA',cuentas_demo:true}});
  assert.equal(r.codigo,0);assert.equal(r.hijos.length,0);
});
test('otra fuente bloquea repetición',async()=>{
  const r=await caso({anterior:{demo:'fixture',fuente:'b'.repeat(40),estado:'LISTA',cuentas_demo:true}});
  assert.equal(r.codigo,1);assert.equal(r.hijos.length,0);
});
