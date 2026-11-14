// Reproducción previa a la corrección, sin QR ni identificadores en salida pública.
const { randomUUID } = require('node:crypto');
const c = require('./parqueaderos-comun.cjs'), p = require('./preparar-parqueaderos.cjs');
async function main() {
  c.guarda(); const db = await c.conexion(), evidencia = [];
  try {
    for (const servidor of [c.base, 'http://127.0.0.1:13149']) {
      const org = await p.iniciarSesion('organizador', servidor), op = await p.iniciarSesion('personal', servidor);
      const a = await p.evento(org.token, servidor), b = await p.evento(org.token, servidor);
      async function req(e, ruta, cuerpo) {
        const r = await c.peticion('/api/v1/parqueaderos/eventos/' + e + ruta, { servidor, metodo: 'POST', token: ruta === '/zonas' ? org.token : op.token, cuerpo });
        c.assert.equal(r.estado, 201); return r.datos;
      }
      const za = await req(a, '/zonas', { nombre: 'A', capacidad: 10, prefijo: 'A' });
      const zb = await req(b, '/zonas', { nombre: 'B', capacidad: 10, prefijo: 'B' });
      const placa = () => 'P' + randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase();
      const pa = placa(), pb = placa(), ingreso = randomUUID(), salida = randomUUID();
      const hace = min => new Date(Date.now() - min * 60000).toISOString();
      const lote = [{ id: ingreso, tipo: 'INGRESO', placa: pa, zonaId: za.id, ocurridoEn: hace(2) }, { id: salida, tipo: 'SALIDA', placa: pa, ocurridoEn: hace(1) }];
      c.assert.equal((await req(a, '/sincronizacion', { registros: lote })).aplicados, 2);
      const control = await req(b, '/sincronizacion', { registros: [{ id: randomUUID(), tipo: 'INGRESO', placa: pb, zonaId: zb.id, ocurridoEn: hace(2) }] });
      c.assert.equal(control.aplicados, 1);
      const antes = await db.ds.query('SELECT * FROM estancias WHERE evento_id=ANY($1) ORDER BY id', [[a, b]]);
      const cruzados = await req(b, '/sincronizacion', { registros: lote.map(r => ({ ...r, placa: pb, ...(r.tipo === 'INGRESO' ? { zonaId: zb.id } : {}) })) });
      const despues = await db.ds.query('SELECT * FROM estancias WHERE evento_id=ANY($1) ORDER BY id', [[a, b]]);
      c.assert.deepEqual(despues, antes); c.assert.equal(cruzados.repetidos, 2);
      c.assert(cruzados.resultados.every(r => !control.resultados.some(x => x.estanciaId === r.estanciaId)));
      evidencia.push({ canal: servidor === c.base ? 'gateway' : 'nucleo', a, b, lote, control, cruzados, antes, despues,
        demostracion: { controlesAplicados: 3, repeticionesDeEventoAjeno: 2, estanciasConservadas: true } });
    }
    c.guardar('brecha-antes.json', evidencia);
    console.log(JSON.stringify(evidencia.map(e => ({ canal: e.canal, ...e.demostracion }))));
  } finally { await db.cerrar(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
