import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { cargarDestinoPostgres } from '../config/postgres';
import { migracionesEnEsquema, opcionesEsquema, opcionesSesion } from './esquemas';
import { GRUPOS_MIGRACIONES, PROCEDENCIA_ORIGINAL } from './historia';

/** Tarea de despliegue: nunca se invoca desde el bootstrap de las aplicaciones. */
export async function prepararBase() {
  const p = cargarDestinoPostgres();
  const comunes = { type: 'postgres' as const, host: p.host, port: p.puerto,
    username: p.usuario, password: p.contrasena, database: p.base,
    synchronize: false, migrationsRun: false, installExtensions: false };
  const control = new DataSource({ ...comunes, extra: { application_name: 'hexacore-preparacion' } });
  await control.initialize();
  const bloqueo = control.createQueryRunner();
  await bloqueo.connect();
  try {
    // Bloqueo de sesión sobre la misma base, también entre dos tareas simultáneas.
    await bloqueo.query("SELECT pg_advisory_lock(hashtextextended('hexacore:preparar-base',0))");
    const publicas = await bloqueo.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    if (publicas.length) throw new Error('Hay tablas en public: no preparar una instalación anterior sin transferencia autorizada');
    await bloqueo.startTransaction();
    try {
      await bloqueo.query('CREATE SCHEMA IF NOT EXISTS extensiones AUTHORIZATION pg_database_owner');
      for (const [extension, version] of [['uuid-ossp','1.1'],['pgcrypto','1.3']]) {
        await bloqueo.query(`CREATE EXTENSION IF NOT EXISTS "${extension}" WITH SCHEMA extensiones VERSION '${version}'`);
        const [e] = await bloqueo.query('SELECT n.nspname esquema,e.extversion version FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE extname=$1',[extension]);
        if (e.esquema !== 'extensiones' || e.version !== version) throw new Error(`Extensión ${extension} fuera de extensiones o versión incompatible`);
      }
      for (const g of GRUPOS_MIGRACIONES) {
        await bloqueo.query(`CREATE SCHEMA IF NOT EXISTS "${g.esquema}" AUTHORIZATION pg_database_owner`);
        await bloqueo.query(`GRANT USAGE ON SCHEMA "${g.esquema}" TO PUBLIC`);
      }
      await bloqueo.commitTransaction();
    } catch(e) { await bloqueo.rollbackTransaction(); throw e; }
    const resultado: Record<string, { aplicadas: string[]; historial: string }> = {};
    for (const g of GRUPOS_MIGRACIONES) {
      const fuente = new DataSource({ ...comunes, ...opcionesEsquema(g.conexion),
        migrationsTableName: g.historial, migrations: migracionesEnEsquema(g.migraciones,g.conexion),
        extra: { ...opcionesSesion(g.conexion), application_name: 'hexacore-migracion:'+g.conexion } });
      await fuente.initialize();
      try {
        const aplicadas = await fuente.runMigrations({ transaction: 'all' });
        const historia = await fuente.query(`SELECT name FROM "${g.esquema}"."${g.historial}" ORDER BY name`);
        const esperadas = g.migraciones.map(M=>new M().name || M.name).sort();
        if (JSON.stringify(historia.map((h:{name:string})=>h.name)) !== JSON.stringify(esperadas)) throw new Error(`Historial inesperado: ${g.conexion}`);
        resultado[g.conexion] = { aplicadas: aplicadas.map(m=>m.name), historial: g.historial };
      } finally { await fuente.destroy(); }
    }
    await bloqueo.startTransaction();
    try {
      await bloqueo.query('CREATE SCHEMA IF NOT EXISTS migracion_control AUTHORIZATION pg_database_owner');
      await bloqueo.query(`CREATE TABLE IF NOT EXISTS migracion_control.procedencia(conexion text NOT NULL,origen text NOT NULL,esquema text NOT NULL,historial text NOT NULL,nombre text NOT NULL,ruta text NOT NULL,sha256 text NOT NULL,PRIMARY KEY(conexion,nombre))`);
      for (const h of PROCEDENCIA_ORIGINAL) {
        const g = GRUPOS_MIGRACIONES.find(g=>g.conexion===h.conexion)!;
        const previa = await bloqueo.query('SELECT ruta,sha256 FROM migracion_control.procedencia WHERE conexion=$1 AND nombre=$2',[h.conexion,h.nombre]);
        if (previa.length && (previa[0].sha256 !== h.sha256 || previa[0].ruta !== h.ruta)) throw new Error('Procedencia histórica incompatible: '+h.nombre);
        if (!previa.length) await bloqueo.query(`INSERT INTO migracion_control.procedencia VALUES($1,$2,$3,$4,$5,$6,$7)`,[h.conexion,'instalacion-vacia',g.esquema,g.historial,h.nombre,h.ruta,h.sha256]);
      }
      await bloqueo.commitTransaction();
    } catch(e) { await bloqueo.rollbackTransaction(); throw e; }
    console.log(JSON.stringify({ base:p.base, esquemas:resultado, migraciones:GRUPOS_MIGRACIONES.reduce((n,g)=>n+g.migraciones.length,0) }));
    return resultado;
  } finally {
    await bloqueo.query("SELECT pg_advisory_unlock(hashtextextended('hexacore:preparar-base',0))");
    await bloqueo.release(); await control.destroy();
  }
}
if (require.main===module) { cargarEnv(); prepararBase().catch(e=>{console.error(e);process.exitCode=1;}); }
