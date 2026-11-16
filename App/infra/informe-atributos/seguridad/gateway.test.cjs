const {test}=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,sign,webcrypto,randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const ahora=Math.floor(Date.now()/1000),enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const datos=enc({alg:'RS256'})+'.'+enc({iss:'hexacore-administracion',sub:randomUUID(),jti:randomUUID(),roles:['Cliente'],iat:ahora,exp:ahora+600});
const token=datos+'.'+sign('RSA-SHA256',Buffer.from(datos),privateKey).toString('base64url');
const fuente=readFileSync(path.resolve(__dirname,'../../../gateway/autenticacion.js'),'utf8').replace("import fs from 'fs';",'const fs=globalThis.archivos;').replace('export default { verificar };','globalThis.autenticacion={verificar};');
test('RNF-06: un 401 de Cola conserva la falta de sesión; otros fallos siguen cerrados',async()=>{
 for(const [respuesta,esperado,motivo]of [[401,401,'SIN_AUTENTICAR'],[404,403,'TURNO_INVALIDO'],[503,403,'COLA_NO_DISPONIBLE'],[204,204,undefined]]){
  const c=vm.createContext({Buffer,crypto:{subtle:{importKey:(...a)=>webcrypto.subtle.importKey(...a),verify:(alg,key,firma,datos)=>webcrypto.subtle.verify(alg,key,firma,Buffer.from(datos))}},archivos:{readFileSync:()=>publicKey.export({type:'spki',format:'pem'})},ngx:{fetch:async()=>({status:respuesta,headers:{get:()=>randomUUID()}})}});vm.runInContext(fuente,c);
  const r={headersIn:{Authorization:'Bearer '+token,'X-Turno-Cola':randomUUID()},variables:{roles_requeridos:'Cliente',turno_requerido:'1'},headersOut:{},error:()=>{},return:estado=>{r.estado=estado;}};
  await c.autenticacion.verificar(r);assert.equal(r.estado,esperado);assert.equal(r.headersOut['X-Motivo'],motivo);
 }
});
