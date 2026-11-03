// Reconstruye la referencia publicada, fuera del workspace activo. No duplica fuentes versionadas.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const {resolve,join}=require('node:path');const assert=require('node:assert/strict');
const base='be57961472a0802c90a57d247fb67e96e6717b1b',raiz=resolve(__dirname,'../../../../..');
const ejecutar=(cmd,args,opciones={})=>execFileSync(cmd,args,{cwd:raiz,stdio:'inherit',...opciones});
assert.equal(process.version,'v22.22.3');
assert.ok(process.argv.slice(2).every(a=>['--levantar','--verificar','--verificar-archivo'].includes(a)));
const verificarArchivo=process.argv.includes('--verificar-archivo');
if(verificarArchivo)assert.equal(process.argv.length,3,'La comprobación del archivo no arranca ni construye servicios');
ejecutar('git',['cat-file','-e',base+'^{commit}']);
const compose=['compose','-p','hexacore-backend-e2e','-f',join(__dirname,'docker-compose.e2e.yml'),'-f',join(__dirname,'docker-compose.imagen.yml')];
if(!verificarArchivo)ejecutar('docker',[...compose,'config','-q']);
if(!process.argv.includes('--verificar')){
  if(process.argv.includes('--levantar')){
    const ids=execFileSync('docker',['ps','-a','-q','--filter','label=com.docker.compose.project=hexacore-backend-e2e'],{encoding:'utf8'}).trim();
    assert.equal(ids,'','Referencia ya existente: no arrancar escritores ni preparar sobre sus datos');
  }
  const temporal=fs.mkdtempSync('/tmp/hexacore-historico-');
  const archivo=execFileSync('git',['archive',base,'App/backend','App/infra','App/gateway'],{cwd:raiz,maxBuffer:64*1024*1024});
  // execFileSync necesita stdin canalizado: con stdio=inherit tar recibe un archivo vacío en CI.
  ejecutar('tar',['-xf','-','-C',temporal],{input:archivo,stdio:['pipe','inherit','inherit']});
  for(const ruta of ['App/backend/package-lock.json','App/backend/Dockerfile','App/backend/Dockerfile.boleteria']){
    assert.deepEqual(fs.readFileSync(join(temporal,ruta)),execFileSync('git',['show',base+':'+ruta],{cwd:raiz,maxBuffer:64*1024*1024}));
  }
  if(verificarArchivo){
    fs.rmSync(temporal,{recursive:true});
    console.log('Archivo histórico extraído: 3 archivos idénticos al commit '+base+'; sin Docker.');
    process.exit(0);
  }
  for(const [app,f] of [['nucleo','Dockerfile'],['boleteria','Dockerfile.boleteria']])ejecutar('docker',['build','--label','hexacore.referencia='+base,'-t','hexacore-historico-'+app+':be57961','-f',join(temporal,'App/backend',f),join(temporal,'App/backend')]);
  for(const app of ['nucleo','boleteria'])ejecutar('docker',['tag','hexacore-historico-'+app+':be57961','hexacore-backend-e2e-'+app]);
  if(process.argv.includes('--levantar')){
    ejecutar('docker',[...compose,'up','-d','--wait']);
    const backend=join(temporal,'App/backend');
    fs.symlinkSync(resolve(raiz,'App/backend/node_modules'),join(backend,'node_modules'),'dir');
    ejecutar(process.execPath,[join(backend,'node_modules/@nestjs/cli/bin/nest.js'),'build','nucleo'],{cwd:backend});
    ejecutar(process.execPath,['--test','--test-concurrency=1','test/pagos/convivencia.test.cjs'],{cwd:backend});
  }
}
console.log('Referencia histórica fijada a '+base+'; configuración separada de las aplicaciones actuales.');
