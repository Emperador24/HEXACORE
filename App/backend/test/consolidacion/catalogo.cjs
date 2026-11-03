const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { q } = require('./config.cjs');
const sha = dato => createHash('sha256').update(dato).digest('hex');
// Solo normaliza DDL del catálogo para comparar nombres de espacio. Nunca toca filas ni dumps.
const normalizar = (s, esquema) => s.replaceAll(`"${esquema}".`, 'MODULO.').replaceAll(`${esquema}.`, 'MODULO.');
function normalizarCheck(s) {
  // pg_dump/parse de PG16 distribuye varchar[]::text[] en casts por literal.
  // Se equipara SOLO ese caso (literales de texto), conservando el resto de la expresión.
  return s.replace(/ARRAY\[((?:'(?:[^']|'')*'::character varying(?:, )?)+)\]::text\[\]/g,
    (_, valores) => 'ARRAY[' + valores.replaceAll('::character varying','::text') + ']')
    .replace(/('(?:[^']|'')*')::character varying::text/g,'$1::text');
}
async function inventario(c, esquema) {
  await c.query(`SET search_path TO ${q(esquema)}, extensiones, pg_catalog`);
  const consultar = async sql => (await c.query(sql, [esquema])).rows;
  const objetos = await consultar(`SELECT c.relname nombre,c.relkind tipo,pg_get_userbyid(c.relowner) propietario,
    c.relrowsecurity rls,c.relforcerowsecurity rls_forzado,c.relacl::text permisos,
    obj_description(c.oid,'pg_class') comentario FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 ORDER BY c.relname`);
  assert.ok(objetos.every(o => ['r','S','i','v','m'].includes(o.tipo)), 'Objeto no contemplado: ampliar ensayo antes de migrarlo');
  const columnas = await consultar(`SELECT c.relname tabla,a.attname nombre,a.attnum posicion,
    format_type(a.atttypid,a.atttypmod) tipo,a.attnotnull no_nulo,a.attidentity identidad,a.attgenerated generado,
    pg_get_expr(d.adbin,d.adrelid) defecto, co.collname colacion
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation
    WHERE n.nspname=$1 AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','v','m') ORDER BY c.relname,a.attnum`);
  const homonimos = await consultar(`SELECT p.proname FROM pg_attrdef a JOIN pg_class c ON c.oid=a.adrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_depend d ON d.classid='pg_attrdef'::regclass AND d.objid=a.oid
    JOIN pg_proc p ON d.refclassid='pg_proc'::regclass AND d.refobjid=p.oid
    WHERE n.nspname=$1 AND p.proname='gen_random_uuid' AND p.pronamespace<>'pg_catalog'::regnamespace`);
  assert.deepEqual(homonimos,[],'DEFAULT gen_random_uuid de extensión: revisar antes de normalizar su nombre');
  const restricciones = await consultar(`SELECT c.relname tabla,co.conname nombre,co.contype tipo,co.convalidated validada,
    pg_get_constraintdef(co.oid,true) definicion FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname,co.conname`);
  const indices = await consultar(`SELECT c.relname tabla,i.relname nombre,pg_get_indexdef(x.indexrelid) definicion,
    x.indisvalid valido,x.indisready listo FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname,i.relname`);
  const funciones = await consultar(`SELECT p.proname nombre,pg_get_function_identity_arguments(p.oid) argumentos,
    pg_get_functiondef(p.oid) definicion,pg_get_userbyid(p.proowner) propietario,p.proacl::text permisos
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
    ORDER BY p.proname,argumentos`);
  const triggers = await consultar(`SELECT c.relname tabla,t.tgname nombre,pg_get_triggerdef(t.oid,true) definicion,t.tgenabled habilitado
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`);
  const vistas = await consultar(`SELECT c.relname nombre,pg_get_viewdef(c.oid,true) definicion FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('v','m') ORDER BY c.relname`);
  const tipos = await consultar(`SELECT t.typname nombre,t.typtype tipo,pg_get_userbyid(t.typowner) propietario,
    (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) valores
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 AND t.typtype IN ('e','d') ORDER BY t.typname`);
  const extensiones = (await c.query(`SELECT e.extname nombre,e.extversion version,e.extrelocatable trasladable,
    pg_get_userbyid(e.extowner) propietario,n.nspname esquema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY e.extname`)).rows;
  const secuencias = [];
  for (const o of objetos.filter(o => o.tipo === 'S')) {
    const definicion = (await c.query(`SELECT seqstart::text inicio,seqincrement::text incremento,seqmax::text maximo,
      seqmin::text minimo,seqcache::text cache,seqcycle ciclo FROM pg_sequence WHERE seqrelid=$1::regclass`, [`${q(esquema)}.${q(o.nombre)}`])).rows[0];
    const estado = (await c.query(`SELECT last_value::text ultimo,is_called usado FROM ${q(esquema)}.${q(o.nombre)}`)).rows[0];
    const vinculo = (await c.query(`SELECT t.relname tabla,a.attname columna FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
      WHERE d.classid='pg_class'::regclass AND d.objid=$1::regclass AND d.deptype IN ('a','i')`, [`${q(esquema)}.${q(o.nombre)}`])).rows;
    secuencias.push({ nombre: o.nombre, ...definicion, ...estado, vinculo });
  }
  const filas = {};
  for (const t of objetos.filter(o => ['r','m'].includes(o.tipo))) {
    // Texto generado en PostgreSQL: no redondea numeric/int8 ni convierte fechas/hashes en JS.
    // Orden C y filas completas (también tablas sin PK); duplicados cuentan con su multiplicidad.
    const r = await c.query(`SELECT row_to_json(t)::text fila FROM ${q(esquema)}.${q(t.nombre)} t ORDER BY row_to_json(t)::text COLLATE "C"`);
    const h = createHash('sha256');
    for (const f of r.rows) h.update(f.fila + '\n');
    filas[t.nombre] = { cantidad: r.rowCount, sha256: h.digest('hex') };
  }
  return JSON.parse(normalizar(JSON.stringify({ objetos, columnas, restricciones, indices, funciones, triggers, vistas, tipos, secuencias, filas, extensiones }), esquema));
}
function comparar(a, b, contexto, { extensionesCompartidas = false } = {}) {
  const limpiar = x => {
    const copia = structuredClone(x);
    // La extensión tiene un único propietario compartido; su espacio está documentado explícitamente.
    copia.extensiones = copia.extensiones.map(({ esquema, ...e }) => e);
    copia.restricciones = copia.restricciones.map(r=>({...r,definicion:r.tipo==='c'?normalizarCheck(r.definicion):r.definicion}));
    // Al compartir pgcrypto, su homónimo obliga al deparser a cualificar la función nativa.
    // Se conserva la llamada nativa del dump, no se cambia ningún DEFAULT al trasladar.
    copia.columnas = copia.columnas.map(c=>({...c,defecto:c.defecto==='pg_catalog.gen_random_uuid()'?'gen_random_uuid()':c.defecto}));
    if (extensionesCompartidas) delete copia.extensiones;
    return copia;
  };
  assert.deepEqual(limpiar(b), limpiar(a), `Conciliación distinta: ${contexto}`);
}
module.exports = { sha, normalizar, normalizarCheck, inventario, comparar };
