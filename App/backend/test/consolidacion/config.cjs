// Destinos deliberadamente fijos. No admite DATABASE_URL, .env ni nombres arbitrarios.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const fs = require('node:fs');
const { Client } = require('pg');
const raiz = resolve(__dirname, '../..');
const proyectoOrigen = 'hexacore-backend-e2e', proyectoDestino = 'hexacore-consolidacion-e2e';
const mapa = [
  ['identidad', 'identidad_cu011_e2e', 'identidad', 'modulos/identidad', 3],
  ['alimentos', 'alimentos_cu011_e2e', 'alimentos', 'modulos/alimentos', 2],
  ['personal-logistica', 'eventos_emergencias_nucleo_e2e', 'personal_logistica', 'modulos/personal-logistica', 2],
  ['entradas-ventas', 'entradas_e2e', 'entradas_ventas', 'modulos/entradas/ventas', 5],
  ['entradas-catalogo', 'catalogo_boleteria_e2e', 'entradas_catalogo', 'modulos/entradas/catalogo', 1],
  ['entradas-postventa', 'postventa_boleteria_e2e', 'entradas_postventa', 'modulos/entradas/postventa', 1],
  ['entradas-acceso-qr', 'acceso_qr_boleteria_e2e', 'entradas_acceso_qr', 'modulos/entradas/acceso-qr', 3],
  ['finanzas-pagos', 'pagos_e2e', 'finanzas_pagos', 'modulos/finanzas/pagos', 1],
].map(([conexion, base, esquema, modulo, cantidad]) => ({ conexion, base, esquema, modulo, cantidad,
  historial: conexion === 'entradas-postventa' ? 'migrations' : 'migraciones' }));
const q = s => '"' + s.replaceAll('"', '""') + '"';
const lit = s => "'" + s.replaceAll("'", "''") + "'";
const docker = (args, opciones = {}) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opciones });
const composeOrigen = ['compose', '-p', proyectoOrigen, '-f', join(raiz, 'test/consolidacion/historico/docker-compose.e2e.yml'), '-f', join(raiz, 'test/consolidacion/historico/docker-compose.imagen.yml')];
const composeDestino = ['compose', '-p', proyectoDestino, '-f', join(__dirname, 'docker-compose.yml')];
function validarInspeccion(c, proyecto, puerto) {
  assert.equal(c.Config.Labels['com.docker.compose.project'], proyecto, 'Proyecto no autorizado');
  assert.equal(c.Config.Labels['com.docker.compose.service'], 'postgres');
  assert.equal(c.State.Running, true);
  assert.deepEqual(c.NetworkSettings.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(puerto) }]);
  const env = Object.fromEntries(c.Config.Env.map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
  assert.equal(env.POSTGRES_USER, 'cu011_e2e');
  assert.equal(env.POSTGRES_PASSWORD, 'cu011_e2e');
  if (proyecto === proyectoDestino) assert.equal(c.Config.Labels['hexacore.uso'], 'ensayo-consolidacion');
}
function comprobar(contenedor, proyecto, puerto) {
  const c = JSON.parse(docker(['inspect', contenedor]))[0];
  validarInspeccion(c, proyecto, puerto);
  return c.Id;
}
function guardas() {
  assert.equal(process.version, 'v22.22.3', 'Selecciona Node con .nvmrc');
  return {
    origen: comprobar(`${proyectoOrigen}-postgres-1`, proyectoOrigen, 15435),
    destino: comprobar(`${proyectoDestino}-postgres-1`, proyectoDestino, 15437),
  };
}
async function cliente(lado, base) {
  assert.ok(['origen','destino'].includes(lado), 'Lado no autorizado');
  const permitidas = lado === 'origen' ? ['postgres', ...mapa.map(m => m.base)] :
    ['postgres', 'hexacore', 'verificacion_hexacore', ...mapa.flatMap(m => ['restauracion_' + m.esquema, 'preparacion_' + m.esquema])];
  assert.ok(permitidas.includes(base), `Base no autorizada: ${base}`);
  const c = new Client({ host: '127.0.0.1', port: lado === 'origen' ? 15435 : 15437,
    user: 'cu011_e2e', password: 'cu011_e2e', database: base, application_name: 'ensayo-consolidacion',
    options: '-c timezone=UTC -c datestyle=ISO,YMD' });
  await c.connect();
  assert.equal((await c.query('SELECT current_database() AS db')).rows[0].db, base);
  return c;
}
function directorio(valor) {
  assert.ok(valor, 'Indica --salida=/private/tmp/hexacore-consolidacion/<nombre-nuevo>');
  const temporal = fs.realpathSync('/tmp');
  const absoluta = resolve(valor);
  const ruta = absoluta.startsWith('/tmp/') ? join(temporal,absoluta.slice(5)) : absoluta;
  // Rechaza repositorio, enlaces y directorios ajenos; nunca sigue un backup suministrado desde otra ubicación.
  assert.ok(ruta.startsWith(join(temporal,'hexacore-consolidacion')+'/'));
  fs.mkdirSync(ruta, { recursive: true, mode: 0o700 });
  assert.equal(fs.realpathSync(ruta), ruta);
  fs.chmodSync(ruta, 0o700);
  return ruta;
}
module.exports = { raiz, mapa, q, lit, docker, guardas, validarInspeccion, cliente, directorio, composeOrigen, composeDestino, proyectoOrigen, proyectoDestino };
