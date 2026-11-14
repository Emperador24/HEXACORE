const c = require('./comun.cjs');
const entorno = require('./parqueaderos-entorno.cjs');
function meta() { return c.leer('entorno-parqueaderos.json'); }
function guarda() {
  entorno.baseGuarda(); const m = meta(); c.assert(m.baseCreadaVacia && m.migracionesPreparadas && m.vhostCreado);
  c.assert(/^hexacore_seg_parq_[a-f0-9]{8}$/.test(m.base)); c.assert(!entorno.inspect(c.proyecto + '-nucleo-1').State.Running);
  const n = entorno.inspect(m.core), r = entorno.inspect(m.redis);
  c.assert(n.State.Running && r.State.Running); c.assert.equal(n.Id, m.coreId); c.assert.equal(r.Id, m.redisId); c.assert.equal(n.Image, m.imagen);
  c.assert.equal(n.Config.Labels['com.docker.compose.project'], entorno.proyecto);
  const e = Object.fromEntries(n.Config.Env.map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  c.assert.equal(e.POSTGRES_BD, m.base); c.assert.equal(e.REDIS_HOST, m.redis); c.assert.equal(decodeURIComponent(new URL(e.RABBITMQ_URL).pathname.slice(1)), m.vhost);
  return m;
}
async function conexion() {
  const m = guarda(), e = entorno.configuracion().services.nucleo.environment;
  const { DataSource } = c.cargar('typeorm'), Redis = c.cargar('ioredis');
  const ds = new DataSource({ type: 'postgres', host: '127.0.0.1', port: 15459, username: e.POSTGRES_USUARIO, password: e.POSTGRES_CONTRASENA,
    database: m.base, entities: [], synchronize: false, migrationsRun: false, installExtensions: false,
    extra: { options: '-c search_path=parqueaderos,pg_catalog,extensiones', max: 3, statement_timeout: 3000 } });
  await ds.initialize(); c.assert.equal((await ds.query('SELECT current_database() AS base'))[0].base, m.base);
  const redis = new Redis({ host: '127.0.0.1', port: m.redisPuerto, lazyConnect: true, retryStrategy: () => null, maxRetriesPerRequest: 0, commandTimeout: 2000 }); await redis.connect();
  return { ds, redis, cerrar: async () => { await redis.quit(); await ds.destroy(); } };
}
module.exports = { ...c, guarda, conexion, meta };
