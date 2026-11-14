// Infraestructura descartable propia: base vacía, Redis y vhost nuevos. No modifica configuración previa.
const { execFileSync, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const c = require('./comun.cjs');
const proyecto = 'hexacore-seguridad-parqueaderos-sebastian';
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const inspect = nombre => JSON.parse(docker(['inspect', nombre]))[0];
const archivo = 'entorno-parqueaderos.json';
function baseGuarda() {
  c.assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'feature/sebastian');
  c.assert.equal(docker(['ps', '-q', '--filter', 'label=com.docker.compose.project=redash']).trim(), '');
}
function configuracion() { return JSON.parse(execFileSync('python3', [c.path.join(c.raiz, 'App/infra/revision/revision.py'), '--perfil', 'cu015', 'config'], { encoding: 'utf8' })); }
function crearCore(m, imagen) {
  const args = ['create', '--name', m.core, '--network', m.red, '--network-alias', 'nucleo', '--env-file', c.path.join(c.privado(), 'nucleo-descartable.env'),
    '--label', 'com.docker.compose.project=' + proyecto, '--label', 'com.docker.compose.service=nucleo', '--label', 'hexacore.uso=seguridad-parqueaderos',
    '--label', 'hexacore.checkout=' + c.raiz, '-p', '127.0.0.1:13149:3002'];
  for (const b of m.montajes) args.push('--mount', `type=bind,source=${b.Source},target=${b.Destination},readonly`);
  args.push(imagen); docker(args); docker(['start', m.core]); m.coreId = inspect(m.core).Id; m.imagen = inspect(m.core).Image; c.guardar(archivo, m);
}
async function main() {
  baseGuarda(); const accion = process.argv[2];
  if (accion === 'iniciar') {
    c.assert(!c.fs.existsSync(c.path.join(c.privado(), archivo)), 'Conservar preparación parcial, no duplicar');
    const config = configuracion(); const n = inspect(c.proyecto + '-nucleo-1'); const pg = inspect(c.proyecto + '-postgres-1'); const gw = inspect(c.proyecto + '-api-gateway-1');
    c.assert(!n.State.Running); c.assert.equal(pg.Config.Labels['hexacore.uso'], 'cu015'); c.assert(pg.State.Running);
    const redes = Object.keys(n.NetworkSettings.Networks).filter(x => pg.NetworkSettings.Networks[x] && gw.NetworkSettings.Networks[x]); c.assert.equal(redes.length, 1);
    const e = { ...config.services.nucleo.environment }, sufijo = randomUUID().replaceAll('-', '').slice(0, 8);
    c.assert.equal(new URL(e.PAGOS_PROVEEDOR_URL).hostname, 'pasarela'); c.assert.equal(new URL(e.CORREO_PROVEEDOR_URL).hostname, 'correo');
    const m = { estado: 'EN_CURSO', proyecto, red: redes[0], base: 'hexacore_seg_parq_' + sufijo, core: 'hexacore-seg-parq-' + sufijo + '-nucleo',
      redis: 'hexacore-seg-parq-' + sufijo + '-redis', vhost: 'seguridad_parq_' + sufijo,
      montajes: n.Mounts.map(b => { c.assert.equal(b.Type, 'bind'); c.assert.equal(b.RW, false); return { Source: b.Source, Destination: b.Destination }; }),
      imagenAnterior: n.Image, postgresId: pg.Id, gatewayId: gw.Id, baseAnterior: e.POSTGRES_BD };
    c.assert(/^hexacore_seg_parq_[a-f0-9]{8}$/.test(m.base)); c.guardar(archivo, m);
    const { Client } = c.cargar('pg'); const admin = new Client({ host: '127.0.0.1', port: 15459, user: e.POSTGRES_USUARIO, password: e.POSTGRES_CONTRASENA, database: m.baseAnterior, statement_timeout: 3000 });
    await admin.connect();
    try {
      c.assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [m.base])).rowCount, 0);
      await admin.query(`CREATE DATABASE "${m.base}"`); m.baseCreadaVacia = true; c.guardar(archivo, m);
    } finally { await admin.end(); }
    const migracionEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DB_') && !k.startsWith('POSTGRES_')));
    Object.assign(migracionEnv, e, { POSTGRES_HOST: '127.0.0.1', POSTGRES_PUERTO: '15459', POSTGRES_BD: m.base });
    const r = spawnSync(process.execPath, [c.path.join(c.backend, 'dist/compartido/persistencia/preparar-base.js')], { env: migracionEnv, encoding: 'utf8', cwd: c.backend });
    c.fs.writeFileSync(c.path.join(c.privado(), 'preparacion-base-descartable.log'), r.stdout + r.stderr, { mode: 0o600 }); c.assert.equal(r.status, 0); m.migracionesPreparadas = true; c.guardar(archivo, m);
    const amqp = new URL(e.RABBITMQ_URL), usuario = decodeURIComponent(amqp.username); amqp.pathname = '/' + m.vhost;
    docker(['exec', c.proyecto + '-rabbitmq-1', 'rabbitmqctl', 'add_vhost', m.vhost]);
    docker(['exec', c.proyecto + '-rabbitmq-1', 'rabbitmqctl', 'set_permissions', '-p', m.vhost, usuario, '.*', '.*', '.*']); m.vhostCreado = true; c.guardar(archivo, m);
    docker(['create', '--name', m.redis, '--network', m.red, '--network-alias', m.redis,
      '--label', 'com.docker.compose.project=' + proyecto, '--label', 'com.docker.compose.service=redis', '--label', 'hexacore.uso=seguridad-parqueaderos',
      '-p', '127.0.0.1::6379', '--mount', 'type=volume,source=' + m.redis + '-datos,target=/data', 'redis:7-alpine', 'redis-server', '--appendonly', 'yes']);
    docker(['start', m.redis]); const redis = inspect(m.redis); m.redisId = redis.Id; m.redisPuerto = Number(redis.NetworkSettings.Ports['6379/tcp'][0].HostPort); c.guardar(archivo, m);
    Object.assign(e, { POSTGRES_BD: m.base, REDIS_HOST: m.redis, RABBITMQ_URL: amqp.toString() });
    c.assert(Object.values(e).every(v => !String(v).includes('\n')));
    c.fs.writeFileSync(c.path.join(c.privado(), 'nucleo-descartable.env'), Object.entries(e).map(([k, v]) => k + '=' + v).join('\n') + '\n', { mode: 0o600 });
    crearCore(m, n.Image); m.estado = 'CREADO'; c.guardar(archivo, m);
    docker(['start', c.proyecto + '-api-gateway-1']); console.log('Base vacía/migraciones, Redis y vhost exclusivos creados; Núcleo aislado usa gateway conservado.');
  } else if (accion === 'cambiar-imagen') {
    const m = c.leer(archivo); const imagen = process.argv[3]; c.assert(imagen?.startsWith('hexacore-seg-parq-nucleo:')); const actual = inspect(m.core); c.assert.equal(actual.Id, m.coreId);
    docker(['stop', '--time', '30', m.core]); const parado = inspect(m.core); c.assert([0, 143].includes(parado.State.ExitCode) && !parado.State.OOMKilled);
    m.coreAntes = { nombre: m.core + '-antes', id: actual.Id, imagen: actual.Image, cierre: parado.State.ExitCode }; docker(['rename', m.core, m.coreAntes.nombre]); c.guardar(archivo, m);
    crearCore(m, imagen); console.log('Solo Núcleo descartable actualizado; instancia anterior detenida y conservada.');
  } else if (accion === 'parar') {
    const m = c.leer(archivo);
    for (const nombre of [m.core, m.redis]) {
      const actual = inspect(nombre); c.assert.equal(actual.Config.Labels['com.docker.compose.project'], proyecto);
      if (actual.State.Running) docker(['stop', '--time', '30', nombre]);
      const parado = inspect(nombre); c.assert([0, 143].includes(parado.State.ExitCode) && !parado.State.OOMKilled);
    }
    console.log('Núcleo/Redis descartables detenidos; base, datos, vhost, volúmenes y evidencia conservados.');
  } else throw Error('Usa iniciar, cambiar-imagen o parar');
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { configuracion, inspect, proyecto, baseGuarda };
