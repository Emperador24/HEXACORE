const { base: basePruebas, opcionesPg } = require('./base-unica/conexiones.cjs');
// Smoke de las imágenes reales, exclusivamente en hexacore-base-unica-e2e.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const Redis = require('ioredis');
const { cifrarContrasena } = require('../dist/modulos/identidad/comun/contrasenas');

async function comprobar() {
  const datos = new Client(opcionesPg('identidad'));
  const logistica = new Client(opcionesPg('logistica'));
  const empleadoId = randomUUID();
  let logisticaConectada = false;
  const redis = new Redis({ host: '127.0.0.1', port: 16384, lazyConnect: true, retryStrategy: () => null });
  const id = randomUUID(), email = `imagen-${id}@example.test`, contrasena = 'convivencia-imagen-nucleo';
  let token, conectado = false;
  const peticion = (ruta, method = 'GET', body) => fetch(`http://127.0.0.1:18082/api/v1/${ruta}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000),
  });
  try {
    const directa = await fetch('http://127.0.0.1:13109/api/v1/salud');
    assert.equal(directa.status, 200);
    assert.equal((await directa.json()).servicio, 'nucleo');
    const salud = await peticion('salud');
    assert.equal(salud.status, 200);
    assert.equal((await salud.json()).servicio, 'nucleo');
    await datos.connect(); conectado = true;
    assert.equal((await datos.query('SELECT current_database() AS base')).rows[0].base, basePruebas);
    await datos.query(`INSERT INTO usuarios (id,nombre,email,hash_contrasena,estado,verificado_en)
      VALUES ($1,'Imagen Núcleo',$2,$3,'ACTIVA',now())`, [id, email, await cifrarContrasena(contrasena)]);
    await datos.query(`INSERT INTO usuarios_roles (usuario_id,rol_id) SELECT $1,id FROM roles WHERE nombre=ANY($2)`, [id, ['Cliente', 'Personal']]);
    await logistica.connect(); logisticaConectada = true;
    assert.equal((await logistica.query('SELECT current_database() AS base')).rows[0].base, basePruebas);
    await logistica.query(`INSERT INTO empleados (id,"usuarioId",nombre,rol,credencial) VALUES ($1,$2,'Personal imagen','taquilla',$3)`,
      [empleadoId, id, `imagen-${empleadoId}`]);
    const login = await peticion('sesiones', 'POST', { email, contrasena });
    assert.equal(login.status, 200);
    token = (await login.json()).token;
    assert.equal(typeof token, 'string');
    const perfil = await peticion('cuentas/perfil');
    assert.equal(perfil.status, 200);
    assert.equal((await perfil.json()).id, id);
    const catalogo = await peticion(`pedidos/eventos/${randomUUID()}/establecimientos`);
    assert.equal(catalogo.status, 404);
    assert.equal((await catalogo.json()).message, 'No existe el evento');
    assert.equal(perfil.headers.get('x-servidor'), catalogo.headers.get('x-servidor'));
    const checkout = await peticion('pedidos/checkout', 'POST', {});
    assert.equal(checkout.status, 400);
    assert.equal(perfil.headers.get('x-servidor'), checkout.headers.get('x-servidor'));
    const ficha = await peticion('logistica/empleados/yo');
    assert.equal(ficha.status, 200);
    assert.equal((await ficha.json()).empleado.usuarioId, id);
    assert.equal(perfil.headers.get('x-servidor'), ficha.headers.get('x-servidor'));
    assert.match(perfil.headers.get('x-servidor'), /:3002$/);
    assert.equal((await peticion('sesiones/actual', 'DELETE')).status, 200);
    assert.equal((await peticion('cuentas/perfil')).status, 401);
    assert.equal((await peticion('pedidos/checkout', 'POST', {})).status, 401);
    assert.equal((await peticion('logistica/empleados/yo')).status, 401);
    console.log('Imagen Núcleo + gateway: Identidad, Alimentos y Personal/Logística, login y revocación aprobados; mismo upstream :3002.');
  } finally {
    if (token) {
      await redis.connect();
      const { jti } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      await redis.del(`sesion-revocada:${jti}`);
    }
    if (logisticaConectada) await logistica.query('DELETE FROM empleados WHERE id=$1', [empleadoId]);
    await logistica.end();
    try { if (conectado) await datos.query('DELETE FROM usuarios WHERE id=$1', [id]); }
    finally { await datos.end(); redis.disconnect(); }
  }
}

comprobar().catch((error) => { console.error(error); process.exitCode = 1; });
