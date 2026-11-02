const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const raiz=resolve(__dirname,'../../../..');
let fallos=0;
for(const [cwd,config] of [[resolve(raiz,'App/services/ventas'),'test/jest-e2e.json'],[resolve(raiz,'App/backend'),'test/boleteria/jest.json']]) {
 const r=spawnSync(process.execPath,['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config',config,'--runInBand'],{cwd,stdio:'inherit'});
 if(r.status!==0)fallos++;
}
process.exitCode=fallos?1:0;
