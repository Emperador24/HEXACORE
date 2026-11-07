const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const raiz = resolve(__dirname, '../../../..');
const backend = resolve(__dirname, '../..');
const proyecto = 'hexacore-cu015-regresion';
const checkout = createHash('sha256').update(raiz).digest('hex').slice(0,16);
const env = Object.fromEntries(['PATH','HOME','TMPDIR','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env, { CU015_CHECKOUT: checkout, POSTGRES_BD_PRUEBAS: 'hexacore_vacia_e2e', COMPOSE_PARALLEL_LIMIT: '1', COMPOSE_BAKE: 'false' });
function ejecutar(cmd, args, capturar = false) {
  const r = spawnSync(cmd,args,{env,cwd:backend,encoding:'utf8',stdio:capturar?'pipe':'inherit'});
  if(r.error) throw r.error;
  if(r.status!==0) throw new Error(`${cmd} terminó con código ${r.status}${capturar ? ': '+r.stderr : ''}`);
  return r.stdout;
}
const argumentos = ['compose','--project-name',proyecto,'--env-file','/dev/null','-f',resolve(backend,'test/docker-compose.e2e.yml'),'-f',resolve(__dirname,'docker-compose.regresion.yml')];
const compose = (...args) => ejecutar('docker',[...argumentos,...args]);
function propio(c) {
  assert.equal(c.Config.Labels['hexacore.checkout'],checkout,'Contenedor de otro checkout');
  assert.equal(c.Config.Labels['hexacore.uso'],'cu015-regresion','Contenedor ajeno');
}
try {
  const config=JSON.parse(ejecutar('docker',[...argumentos,'config','--format','json'],true));
  assert.equal(config.name,proyecto);
  const ids=ejecutar('docker',['ps','-aq','--filter',`label=com.docker.compose.project=${proyecto}`],true).trim().split(/\s+/).filter(Boolean);
  const contenedores=ids.length?JSON.parse(ejecutar('docker',['inspect',...ids],true)):[];
  contenedores.forEach(propio);
  for(const tipo of ['volume','network']) {
    for(const recurso of Object.values(config[tipo+'s'])) {
      assert.ok(!recurso.external && recurso.name.startsWith(proyecto+'_'));
      const existentes=ejecutar('docker',[tipo,'ls','--format','{{.Name}}'],true).split('\n');
      if(existentes.includes(recurso.name)) {
        const [r]=JSON.parse(ejecutar('docker',[tipo,'inspect',recurso.name],true));
        assert.equal(r.Labels['hexacore.checkout'],checkout);
      }
    }
  }
  const puertos=[];
  for(const s of Object.values(config.services)) {
    assert.equal(s.labels['hexacore.checkout'],checkout);
    for(const p of s.ports??[]) { assert.equal(p.host_ip,'127.0.0.1'); puertos.push(Number(p.published)); }
  }
  assert.deepEqual(puertos.sort((a,b)=>a-b),[13105,13106,15439,15679,16384,16779]);
  assert.equal(config.services.postgres.environment.POSTGRES_DB,'hexacore_vacia_e2e');
  assert.equal(config.services['preparacion-base'].environment.POSTGRES_HOST,'postgres');
  // No arrancar si estos puertos están ocupados fuera de los contenedores propios.
  const propios=new Set(contenedores.filter(c=>c.State.Running).flatMap(c=>Object.values(c.NetworkSettings.Ports??{}).flatMap(ps=>(ps??[]).map(p=>Number(p.HostPort)))));
  for(const p of [...puertos,13087].filter(p=>!propios.has(p))) {
    ejecutar('python3',['-c','import socket,sys; s=socket.socket(); s.bind(("127.0.0.1",int(sys.argv[1]))); s.close()',String(p)],true);
  }
  compose('up','-d','--wait','postgres','redis','rabbitmq','pasarela','correo');
  compose('up','--no-deps','--exit-code-from','preparacion-base','preparacion-base');
  ejecutar(process.execPath,['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config','test/jest-e2e.json','--runInBand','--testPathPatterns=cu011.e2e-spec']);
} catch(e) { console.error(e.message); process.exitCode=1; }
finally {
  // Solo stop; se retienen todos los recursos para inspección/repetición.
  const ids=ejecutar('docker',['ps','-aq','--filter',`label=com.docker.compose.project=${proyecto}`],true).trim().split(/\s+/).filter(Boolean);
  if(ids.length) {
    JSON.parse(ejecutar('docker',['inspect',...ids],true)).forEach(propio);
    compose('stop','--timeout','30');
  }
}
