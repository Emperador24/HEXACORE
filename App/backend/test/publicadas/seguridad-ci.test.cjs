const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const{spawnSync}=require('node:child_process');const{validar,nombres}=require('./manifiesto.cjs');
const sha='a'.repeat(40),digest='sha256:'+'b'.repeat(64);
function temporal(f){const d=fs.mkdtempSync(path.join(os.tmpdir(),'hexacore-seguridad-ci-'));try{return f(d);}finally{fs.rmSync(d,{recursive:true,force:true});}}
function manifestar(d){for(const nombre of nombres)fs.writeFileSync(path.join(d,nombre+'.json'),JSON.stringify({nombre,imagen:'ghcr.io/emperador24/hexacore-'+nombre,revision:sha,digest}));}
test('ocho digests de la misma revisión se aceptan sin usar etiquetas mutables',()=>temporal(d=>{manifestar(d);const m=validar(d,sha);assert.equal(m.length,8);assert.ok(m.every(i=>i.ref.endsWith('@'+digest)));}));
test('publicación parcial y mezcla de revisiones se rechazan',()=>temporal(d=>{manifestar(d);fs.unlinkSync(path.join(d,'correo.json'));assert.throws(()=>validar(d,sha));manifestar(d);const f=path.join(d,'correo.json'),m=JSON.parse(fs.readFileSync(f));m.revision='c'.repeat(40);fs.writeFileSync(f,JSON.stringify(m));assert.throws(()=>validar(d,sha));}));
test('registro ajeno, digest inválido y campos privados se rechazan',()=>temporal(d=>{for(const cambio of [{imagen:'example.test/otro'},{digest:'latest'},{token:'PRIVADO'}]){manifestar(d);const f=path.join(d,'nucleo.json');fs.writeFileSync(f,JSON.stringify({...JSON.parse(fs.readFileSync(f)),...cambio}));assert.throws(()=>validar(d,sha));}}));
function resumen(d,total=2,pendientes=0){fs.mkdirSync(path.join(d,'.evidencia-e2e'),{recursive:true});fs.writeFileSync(path.join(d,'.evidencia-e2e/unitarias.json'),JSON.stringify({numTotalTests:total,numPassedTests:total-pendientes,numFailedTests:0,numPendingTests:pendientes,numTotalTestSuites:1,testResults:[{token:'PRIVADO',correo:'secreto@example.test'}]}));for(const f of ['respaldo.dump','redis.rdb','correo.json'])fs.writeFileSync(path.join(d,'.evidencia-e2e',f),'PRIVADO');return spawnSync('python3',[path.resolve(__dirname,'../resumen-ci.py')],{cwd:d,env:{...process.env,GITHUB_SHA:sha,GITHUB_RUN_ID:'42',PASOS_JSON:'{"unitarias":"success"}'},encoding:'utf8'});}
test('resumen publicado excluye logs, tokens, correos, dumps y RDB aunque existan',()=>temporal(d=>{const r=resumen(d);assert.equal(r.status,0,r.stderr);const p=path.join(d,'.informe-ci/backend.json'),texto=fs.readFileSync(p,'utf8');assert.doesNotMatch(texto,/PRIVADO|correo|token|dump|rdb|testResults/);assert.equal(JSON.parse(texto).unitarias.numTotalTests,2);assert.deepEqual(fs.readdirSync(path.join(d,'.informe-ci')),['backend.json']);}));
test('cero pruebas u omisiones no se publican como suite aprobada',()=>temporal(d=>{assert.notEqual(resumen(d,0).status,0);assert.notEqual(resumen(d,2,1).status,0);}));
test('los workflows solo permiten artefactos explícitos y no el directorio privado',()=>{const yaml=require('js-yaml');for(const nombre of ['ci','cd']){const c=yaml.load(fs.readFileSync(path.resolve(__dirname,'../../../../.github/workflows/'+nombre+'.yml'),'utf8'));if(nombre==='cd')assert.equal(c.env.DOCKER_BUILD_RECORD_UPLOAD,'false');const permitidos=nombre==='ci'?['App/backend/.informe-ci/backend.json']:['.informe-ci/${{ matrix.nombre }}.json'];let n=0;for(const j of Object.values(c.jobs))for(const paso of j.steps||[])if(paso.uses?.startsWith('actions/upload-artifact@')){n++;assert.ok(permitidos.includes(paso.with.path));assert.equal(paso.with['if-no-files-found'],'error');}assert.ok(n>0);}});
test('unir plataformas exige revisión y arquitectura correctas; arquitectura no publica etiquetas protegidas',()=>{
  const script=`import copy,runpy,sys
m=runpy.run_path(sys.argv[1]);sha='a'*40
d={'manifest':{'digest':'sha256:'+'b'*64,'manifests':[{'platform':{'os':'linux','architecture':'arm64'}}]},'image':{'linux/arm64':{'architecture':'arm64','os':'linux','config':{'Labels':{'org.opencontainers.image.revision':sha}}}}}
assert m['validar_plataforma'](d,'arm64',sha)=='sha256:'+'b'*64
for cambio in ('revision','arquitectura','digest'):
 c=copy.deepcopy(d)
 if cambio=='revision':c['image']['linux/arm64']['config']['Labels']['org.opencontainers.image.revision']='c'*40
 if cambio=='arquitectura':c['manifest']['manifests'][0]['platform']['architecture']='amd64'
 if cambio=='digest':c['manifest']['digest']='latest'
 try:m['validar_plataforma'](c,'arm64',sha)
 except AssertionError:pass
 else:raise AssertionError('Se aceptó '+cambio)
assert m['etiquetas'](sha,'feature/sebastian-arquitectura')==['arquitectura-'+sha,'sha-'+sha]
assert m['etiquetas'](sha,'main')==['main','sha-'+sha,'latest']
assert m['etiquetas'](sha,'develop')==['develop','sha-'+sha]
`;
  const r=spawnSync('python3',['-c',script,path.resolve(__dirname,'unir-plataformas.py')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const c=require('js-yaml').load(fs.readFileSync(path.resolve(__dirname,'../../../../.github/workflows/cd.yml'),'utf8'));
  assert.deepEqual(c.jobs.compilacion.strategy.matrix.arquitectura,['amd64','arm64']);
  assert.match(c.jobs.compilacion['runs-on'],/ubuntu-24\.04-arm/);
  assert.ok(c.jobs.compilacion.steps.some(s=>s.name==='Exigir arquitectura nativa'));
  assert.ok(c.jobs.compilacion.steps.every(s=>!s.uses?.includes('setup-qemu')));
});
