// Metadatos de los módulos/controladores compilados; no instancia Nest ni abre bases.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const raiz=path.resolve(__dirname,'../../../..'),backend=path.join(raiz,'App/backend');
const cargar=createRequire(path.join(backend,'package.json'));
cargar('reflect-metadata');
const {RequestMethod}=cargar('@nestjs/common');
const {PATH_METADATA,METHOD_METADATA,GUARDS_METADATA,MODULE_METADATA}=cargar('@nestjs/common/constants');
const gateway=fs.readFileSync(path.join(raiz,'App/gateway/nginx.conf'),'utf8');
function bloques(){
 const texto=gateway.replace(/#[^\n]*/g,'');const salida=[];const re=/location\s+(=\s+)?([^\s{]+)\s*\{/g;let m;
 while((m=re.exec(texto))){let fin=re.lastIndex,prof=1;for(;fin<texto.length&&prof;fin++){if(texto[fin]==='{')prof++;if(texto[fin]==='}')prof--;}
  const cuerpo=texto.slice(re.lastIndex,fin-1);salida.push({exacta:!!m[1],ruta:m[2],protegida:cuerpo.includes('autenticar.conf'),interna:/\binternal\s*;/.test(cuerpo),upstream:cuerpo.match(/proxy_pass\s+http:\/\/(\w+)/)?.[1]??null,roles:cuerpo.match(/roles_requeridos\s+"([^"]+)"/)?.[1]?.split(',')??[],solo:cuerpo.match(/limit_except\s+(\w+)/)?.[1]??null});re.lastIndex=fin;
 }
 return salida;
}
const locations=bloques();
function borde(ruta){return locations.find(b=>b.exacta&&b.ruta===ruta)??locations.filter(b=>!b.exacta&&ruta.startsWith(b.ruta)&&!b.ruta.startsWith('@')).sort((a,b)=>b.ruta.length-a.ruta.length)[0]??null;}
function lista(v){return Array.isArray(v)?v:[v??''];}
function fuente(C){for(const [f,m]of Object.entries(require.cache))if(f.startsWith(path.join(backend,'dist'))&&m.exports&&Object.values(m.exports).includes(C))return path.relative(backend,f).replace(/^dist\//,'').replace(/\.js$/,'.ts');return null;}
async function inventario(){
 const rutas=[],pendientes=[];
 for(const [programa,archivo,nombre]of [['nucleo','apps/nucleo/nucleo.module','NucleoModule'],['boleteria','apps/boleteria/boleteria.module','BoleteriaModule']]){
  process.env.PROGRAMA_BACKEND=programa;
  const raizModulo=cargar(path.join(backend,'dist',archivo))[nombre],vistos=new Set();
  async function visitar(entrada){
   if(entrada?.then) entrada=await entrada;
   if(entrada?.forwardRef)return visitar(entrada.forwardRef());
   const M=entrada?.module??entrada;if(!M||vistos.has(M))return;vistos.add(M);
   for(const C of [...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS,M)??[]),...(entrada.controllers??[])]){
    for(const metodo of Object.getOwnPropertyNames(C.prototype)){
     const fn=C.prototype[metodo],verbo=Reflect.getMetadata(METHOD_METADATA,fn);if(verbo===undefined)continue;
     for(const base of lista(Reflect.getMetadata(PATH_METADATA,C)))for(const sub of lista(Reflect.getMetadata(PATH_METADATA,fn))){
      const ruta='/api/v1/'+[base,sub].filter(Boolean).join('/').replace(/^\/+|\/+$/g,'');
      const guards=[...(Reflect.getMetadata(GUARDS_METADATA,C)??[]),...(Reflect.getMetadata(GUARDS_METADATA,fn)??[])].map(g=>g.name??g.constructor.name);
      const roles=Reflect.getMetadata('roles-permitidos',fn)??Reflect.getMetadata('roles-permitidos',C)??[];
      const rolAdmin=guards.some(g=>/Administrador|AdminRequerido/.test(g));
      const loc=borde(ruta);let clase=guards.length?'protegida':'sin-clasificar';let razon=null;
      if(ruta.includes('/interno/')){clase='interna';razon='Contrato entre componentes; no se enruta públicamente';}
      else if(ruta.startsWith('/api/v1/pagos/webhook')){clase='webhook';razon='Firma propia del proveedor, no sesión de usuario';}
      else if(ruta==='/api/v1/salud'){clase='operacional';razon='Salud sin datos de usuario';}
      else if((programa==='boleteria'&&ruta.startsWith('/api/v1/cartelera'))||ruta==='/api/v1/pagos/configuracion'){
       clase='publica';razon=ruta.includes('cartelera')?'Cartelera pública CU-005':'Selección pública del proveedor, sin clave privada';
      }else if(!guards.length&&(['/api/v1/sesiones','/api/v1/sesiones/renovar','/api/v1/cuentas/registro','/api/v1/cuentas/verificar','/api/v1/cuentas/recuperacion','/api/v1/cuentas/restablecer'].includes(ruta))){clase='publica';razon='Emisión/recuperación de identidad; requiere su credencial específica';}
      const metodoHttp=RequestMethod[verbo];
      rutas.push({programa,metodo:metodoHttp,ruta,controlador:C.name,accion:metodo,fuente:fuente(C),guards,roles:rolAdmin?['Administrador']:roles,clase,razon,gateway:loc?{location:loc.ruta,exacta:loc.exacta,protegida:loc.protegida,roles:loc.roles,upstream:loc.upstream,solo:loc.solo}:null});
     }
    }
   }
   for(const I of [...(Reflect.getMetadata(MODULE_METADATA.IMPORTS,M)??[]),...(entrada.imports??[])])await visitar(I);
  }
  await visitar(raizModulo);
 }
 rutas.sort((a,b)=>(a.programa+a.ruta+a.metodo).localeCompare(b.programa+b.ruta+b.metodo));
 const claves=rutas.map(r=>r.programa+' '+r.metodo+' '+r.ruta);if(new Set(claves).size!==claves.length)throw new Error('Rutas duplicadas: revisar el denominador');
 const clases={};for(const r of rutas)clases[r.clase]=(clases[r.clase]??0)+1;
 return {version:1,denominador:'Operaciones declaradas método HTTP + ruta + programa; HEAD implícito se comprueba aparte, no duplica GET',total:rutas.length,clases,pendientes,rutas,locations,adicionales:[{ruta:'/salud',clase:'operacional',programa:'gateway'},{ruta:'/_auth',clase:'interna',programa:'gateway'},{ruta:'/api/v1/docs*',clase:'diagnostico-interno',razon:'Swagger solo en entorno no productivo; no lo enruta gateway'}]};
}
module.exports={inventario};
if(require.main===module){const salida=process.argv[2];if(!salida)throw new Error('Indica el archivo de inventario');inventario().then(d=>{fs.writeFileSync(salida,JSON.stringify(d,null,2)+'\n');console.log(JSON.stringify({total:d.total,clases:d.clases,pendientes:d.pendientes}));}).catch(e=>{console.error(e);process.exitCode=1;});}
