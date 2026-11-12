const {cargar,backend,path,assert}=require('./comun.cjs');
async function inspeccionar(consulta){
 const {GRUPOS_MIGRACIONES}=cargar(path.join(backend,'dist/compartido/persistencia/historia'));
 const grupos=GRUPOS_MIGRACIONES.filter(g=>['alimentos','finanzas-pagos','entradas-ventas','entradas-postventa','parqueaderos'].includes(g.conexion));assert.equal(grupos.length,5);
 const esquemas=grupos.map(g=>g.esquema);
 const tablas=await consulta("SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema=ANY($1) ORDER BY 1,2",[esquemas]);
 assert.equal(new Set(tablas.map(t=>t.table_schema)).size,5,'Un esquema esperado está ausente');
 const porEsquema={};let coincidencias=0,filas=0;
 for(const t of tablas){assert(/^[a-z_]+$/.test(t.table_schema)&&/^[a-z_]+$/.test(t.table_name));
  const [r]=await consulta(`SELECT count(*)::int AS filas,count(*) FILTER(WHERE row_to_json(t)::text LIKE $1)::int AS canario FROM "${t.table_schema}"."${t.table_name}" t`,['%4111111111111111%']);
  const p=porEsquema[t.table_schema]??={tablas:0,filas:0,canario:0};p.tablas++;p.filas+=r.filas;p.canario+=r.canario;coincidencias+=r.canario;filas+=r.filas;
 }
 return {esquemas,propietarios:grupos.map(g=>({conexion:g.conexion,esquema:g.esquema,historial:g.historial})),tablas:tablas.length,filas,canarioPAN:coincidencias,porEsquema,limite:'Búsqueda del canario sintético; no detector exhaustivo de tarjetas'};
}
module.exports={inspeccionar};
