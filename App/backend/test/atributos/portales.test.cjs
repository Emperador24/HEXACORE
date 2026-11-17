const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
for(const portal of ['cliente','admin']){
  const fuente=readFileSync(resolve(__dirname,`../../../frontend/portal-web-${portal}/src/app/core/servidor.ts`),'utf8');
  const js=ts.transpileModule(fuente,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  function cargar(api){const contexto={exports:{},URL,window:{location:{hostname:'localhost',origin:'http://localhost:4200'},HEXACORE_CONFIGURACION:{api}}};vm.runInNewContext(js,contexto);return contexto.exports.Servidor.api;}
  test(`${portal}: predeterminado y configuración externa válida`,()=>{assert.equal(cargar(undefined),'http://localhost:8080/api/v1');assert.equal(cargar('/otra-api/v1'),'/otra-api/v1');assert.equal(cargar('https://api.example.test/api/v1'),'https://api.example.test/api/v1');});
  for(const api of ['http://[','http://', '',0,'javascript:alert(1)','//ajeno.test/api','https://usuario:secreto@api.test','https://api.test?token=privado','https://api.test#secreto',' /api','/api\\otra']){
    test(`${portal}: rechaza dirección inválida ${JSON.stringify(api)}`,()=>assert.throws(()=>cargar(api),/HEXACORE_CONFIGURACION.api/));
  }
}
