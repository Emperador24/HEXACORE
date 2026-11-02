const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Client } = require('pg');
const Redis = require('ioredis');
const { JwtService } = require('@nestjs/jwt');
const gateway = 'http://127.0.0.1:18081/api/v1',
  directo = 'http://127.0.0.1:13097/api/v1';
const bases = {
  ventas: 'entradas_e2e',
  catalogo: 'catalogo_boleteria_e2e',
  postventa: 'postventa_boleteria_e2e',
  acceso: 'acceso_qr_boleteria_e2e',
};
const claves = readFileSync(
  resolve(__dirname, '../claves/jwt-privada.pem'),
  'utf8',
);
const usuario = randomUUID(),
  personal = randomUUID(),
  jti = randomUUID(),
  evento = randomUUID(),
  localidad = randomUUID();
const jwt = new JwtService();
const token = (sub, roles, jti_) =>
  jwt.sign(
    { sub, roles, jti: jti_ },
    {
      algorithm: 'RS256',
      issuer: 'hexacore-administracion',
      expiresIn: '10m',
      privateKey: claves,
    },
  );
const cliente = token(usuario, ['Cliente'], jti),
  portero = token(personal, ['Personal'], randomUUID());
const db = {},
  redis = new Redis({ host: '127.0.0.1', port: 16383 });
async function pedir(metodo, ruta, auth, cuerpo, extra = {}, base = gateway) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
      ...extra,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  });
  const texto = await r.text();
  return {
    status: r.status,
    body: texto ? JSON.parse(texto) : null,
    upstream: r.headers.get('X-Servidor'),
  };
}
async function main() {
  for (const [n, database] of Object.entries(bases)) {
    db[n] = new Client({
      host: '127.0.0.1',
      port: 15436,
      user: 'boleteria_e2e',
      password: 'boleteria_e2e',
      database,
    });
    await db[n].connect();
  }
  const salud = await pedir('GET', '/salud', null, undefined, {}, directo);
  assert.equal(salud.status, 200);
  assert.equal(salud.body.servicio, 'boleteria');
  assert.equal(
    JSON.stringify(salud.body.trabajos.cron),
    JSON.stringify(['expirar-publicaciones', 'venta-expirar-reservas']),
  );
  for (const n of Object.keys(db)) {
    const extra =
      n === 'postventa'
        ? ',permite_reventa'
        : `,estado${n === 'acceso' ? ',aforo_maximo' : ',categoria'}`;
    const valor =
      n === 'postventa'
        ? ',true'
        : `,'PUBLICADO'${n === 'acceso' ? ',100' : ",'Conciertos'"}`;
    await db[n].query(
      `INSERT INTO eventos_referencia(evento_id,nombre,fecha_inicio,lugar,ciudad${extra}) VALUES($1,'Smoke Boletería',now()+interval '30 days','Recinto smoke','Bogotá'${valor})`,
      [evento],
    );
    if (['ventas', 'catalogo'].includes(n))
      await db[n].query(
        "INSERT INTO localidades_evento(localidad_id,evento_id,nombre,precio,aforo) VALUES($1,$2,'Smoke',100000,5)",
        [localidad, evento],
      );
  }
  const upstreams = [];
  let r = await pedir('GET', `/cartelera/${evento}`);
  assert.equal(r.status, 200);
  upstreams.push(r.upstream);
  r = await pedir('POST', `/cola/eventos/${evento}/turnos`, cliente);
  assert.equal(r.status, 201);
  const turno = r.body.token;
  upstreams.push(r.upstream);
  const crear = { localidadId: localidad, cantidad: 1 };
  r = await pedir('POST', '/compras', cliente, crear);
  assert.equal(r.status, 428);
  assert.equal(r.body.codigo, 'TURNO_REQUERIDO');
  r = await pedir('POST', '/compras', cliente, crear, {
    'X-Turno-Cola': turno,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const compra = r.body;
  upstreams.push(r.upstream);
  r = await pedir('POST', '/compras', cliente, crear, {
    'X-Turno-Cola': turno,
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.codigo, 'TURNO_INVALIDO');
  r = await pedir('POST', `/compras/${compra.id}/pagar`, cliente, {
    metodoPago: 'TARJETA',
    token: 'tok_ok_smoke_boleteria',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const entrada = r.body.entradas[0];
  r = await pedir('GET', '/reventa/mis-entradas', cliente);
  assert.equal(r.status, 200);
  upstreams.push(r.upstream);
  const fin = Date.now() + 10000;
  while (
    !(
      await db.acceso.query('SELECT 1 FROM qr_entradas WHERE entrada_id=$1', [
        entrada.id,
      ])
    ).rowCount
  ) {
    if (Date.now() > fin) throw Error('Proyección QR no convergió');
    await new Promise((r) => setTimeout(r, 25));
  }
  r = await pedir('POST', '/ingresos', portero, {
    eventoId: evento,
    codigoQr: entrada.codigoQr,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.autorizado, true);
  upstreams.push(r.upstream);
  r = await pedir('POST', '/ingresos', portero, {
    eventoId: evento,
    codigoQr: entrada.codigoQr,
  });
  assert.equal(r.status, 409);
  assert.ok(
    upstreams.every((x) => x && x.endsWith(':3001')),
    JSON.stringify(upstreams),
  );
  assert.equal(new Set(upstreams).size, 1);
  r = await pedir('GET', `/interno/entradas/de/${usuario}`, cliente);
  assert.equal(r.status, 404);
  r = await pedir(
    'GET',
    `/interno/entradas/de/${usuario}`,
    null,
    undefined,
    {},
    directo,
  );
  assert.equal(r.status, 401);
  r = await pedir(
    'GET',
    `/interno/entradas/de/${usuario}`,
    null,
    undefined,
    { 'X-Token-Servicio': 'incorrecto' },
    directo,
  );
  assert.equal(r.status, 401);
  await redis.set('sesion-revocada:' + jti, '1', 'EX', 300);
  r = await pedir('GET', '/compras', cliente);
  assert.equal(r.status, 401);
  console.log(
    'Imagen/gateway Boletería: cinco familias mismo upstream :3001, turno único, compra/pago/QR, doble ingreso, restricciones internas y revocación aprobados.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.del('sesion-revocada:' + jti);
    redis.disconnect();
    for (const c of Object.values(db)) await c.end();
  });
