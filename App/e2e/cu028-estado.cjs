const {execFileSync}=require('node:child_process');
const {resolve}=require('node:path');
const raiz=resolve(__dirname,'../..');
function git(...a){return execFileSync('git',a,{cwd:raiz,encoding:'utf8'}).trim();}
function estadoCu028(){
 const referencias={};
 for(const ref of ['HEAD','origin/feature/samuel','origin/develop']){
  try{
   const revision=git('rev-parse','--verify',ref);
   const rutas=git('show',`${ref}:App/frontend/portal-web-admin/src/app/app.routes.ts`);
   const rol=rutas.match(/path: 'roles',[\s\S]*?\n\s*\}/)?.[0]??'';
   referencias[ref]={revision,placeholder:rol.includes('placeholder/placeholder.component')};
  }catch{referencias[ref]={disponible:false,accion:'Obtener la referencia y revisar sus fuentes antes de acreditar CU-028.'};}
 }
 return {caso:'CU-028',estado:Object.values(referencias).every(r=>r.placeholder===true)?'BLOQUEADO':'REQUIERE_REVISION',referencias,
  faltantes:['CRUD de roles personalizados y matriz por módulo','propagación inmediata a sesiones activas','revocación/invalidez de permisos y auditoría de cambios','concurrencia entre administradores y reasignación antes de eliminar'],
  alcanceExistente:'Cuatro roles fijos, sesiones y guardas usadas por CU-027 y otros módulos. No equivalen al sistema global CU-028.',
  criterio:'Este diagnóstico local no actualiza las remotas: ejecutar git fetch origin feature/samuel develop antes de inspeccionar. Un placeholder no acredita la matriz; una ruta nueva requiere revisar la implementación completa.'};
}
module.exports={estadoCu028};
if(require.main===module){console.log(JSON.stringify(estadoCu028(),null,2));process.exitCode=2;}
