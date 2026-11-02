const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
for(const nombre of ['ventas','catalogo','cola-virtual','postventa','acceso-qr']) {
 const r=spawnSync('npm',['run','build'],{cwd:resolve(__dirname,'../../../services',nombre),stdio:'inherit'});
 if(r.status!==0)process.exit(r.status??1);
}
