// Compara solo DTO de la referencia publicada y el compilado actual, sin BD/red.
const {execFileSync}=require('node:child_process'),Module=require('node:module');
const {backend,cargar,raiz,path,guardar}=require('./comun.cjs');
const ts=cargar('typescript'),{validateSync}=cargar('class-validator');cargar('reflect-metadata');
const casos=[
 ['modulos/finanzas/pagos/dto/pagos.dto.ts','CobrarDto','token',{claveIdempotencia:'seguridad-fixture',solicitante:'alimentos',monto:1000,moneda:'COP',descripcion:'Fixture'}],
 ['modulos/alimentos/pagos/dto/crear-pago.dto.ts','CrearPagoDto','tokenPago',{}],
 ['modulos/entradas/ventas/venta/dto/pagar.dto.ts','PagarDto','token',{metodoPago:'TARJETA'}],
 ['modulos/entradas/postventa/postventa/dto/pagar.dto.ts','PagarDto','token',{metodoPago:'TARJETA'}],
 ['modulos/parqueaderos/dto/parqueaderos.dto.ts','PagarReservaDto','token',{}],
];
const resultado=[];
for(const [archivo,nombre,campo,resto]of casos){
 const fuente=execFileSync('git',['show','82bac77:App/backend/'+archivo],{cwd:raiz,encoding:'utf8'});
 const filename=path.join(backend,'dist',archivo.replace(/\.ts$/,'.js'));
 const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 m._compile(ts.transpileModule(fuente,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,filename);
 const actual=cargar(filename)[nombre],anterior=m.exports[nombre];
 const acepta=C=>validateSync(Object.assign(new C(),resto,{[campo]:'4111111111111111'}),{whitelist:true,forbidNonWhitelisted:true}).length===0;
 resultado.push({archivo,antesAceptabaPAN:acepta(anterior),ahoraAceptaPAN:acepta(actual)});
}
guardar('pan-dto-antes-despues.json',resultado);console.log(JSON.stringify(resultado));
if(resultado.some(r=>!r.antesAceptabaPAN||r.ahoraAceptaPAN))process.exitCode=1;
