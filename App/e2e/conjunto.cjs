// Ejecuta lo implementado y hace explícita la dependencia CU-028, sin omisiones verdes.
const {spawnSync}=require('node:child_process');
const {mkdirSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {estadoCu028}=require('./cu028-estado.cjs');
const salida=resolve(__dirname,'.evidencia',`conjunto-${new Date().toISOString().replace(/[:.]/g,'-')}`);
mkdirSync(salida,{recursive:true});
const estado=estadoCu028();writeFileSync(resolve(salida,'cu028.json'),JSON.stringify(estado,null,2));
console.log(`CU-028 ${estado.estado}: no se acredita CRUD/matriz/propagación/auditoría. Referencias conservadas en`,salida);
const r=spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test',...process.argv.slice(2),`--output=${resolve(salida,'resultados')}`],
 {cwd:__dirname,env:{...process.env,PLAYWRIGHT_HTML_OUTPUT_DIR:resolve(salida,'informe')},stdio:'inherit'});
writeFileSync(resolve(salida,'resultado.json'),JSON.stringify({playwright:r.status,senal:r.signal,error:r.error?.message,cu028:estado.estado,completo:false},null,2));
if(r.error)console.error('No pudo ejecutarse Playwright:',r.error.message);
console.log('El conjunto completo permanece bloqueado por CU-028 aunque los recorridos implementados aprueben.');
process.exitCode=r.status===0 ? 2 : (r.status ?? 1);
