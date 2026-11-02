const {proyecto}=require('./conexiones.cjs');
const {resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
function argumentos(imagenes=false){return ['compose','-p',proyecto,'-f',resolve(__dirname,'../docker-compose.e2e.yml'),...(imagenes?['-f',resolve(__dirname,'../docker-compose.imagen.yml')]:[])];}
if(require.main===module){const [modo,...args]=process.argv.slice(2);const r=spawnSync('docker',[...argumentos(modo==='imagenes'),...args],{stdio:'inherit'});if(r.error)throw r.error;process.exitCode=r.status??1;}
module.exports={argumentos};
