const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
let fallos=0;
for(const n of ['ventas','catalogo','cola-virtual','postventa','acceso-qr']) {
 for(const args of [['run','lint'],['test','--','--runInBand']]) {
  console.log(`\nComponente ${n}: npm ${args.join(' ')}`);
  const r=spawnSync('npm',args,{cwd:resolve(__dirname,'../../../services',n),env:{...process.env,REDIS_HOST:'127.0.0.1',REDIS_PUERTO:'16383'},stdio:'inherit'});
  if(r.status!==0)fallos++;
 }
}
process.exitCode=fallos?1:0;
