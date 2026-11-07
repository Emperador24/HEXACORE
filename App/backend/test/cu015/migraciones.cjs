// Solo proyecto CU-015: instalación vacía y actualización con filas anteriores.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const proyecto = 'hexacore-cu015-sebastian';
const raiz = resolve(__dirname, '../..');
const [contenedor] = JSON.parse(execFileSync('docker', ['inspect', proyecto + '-postgres-1'], { encoding: 'utf8' }));
assert.equal(contenedor.Config.Labels['com.docker.compose.project'], proyecto);
assert.equal(contenedor.Config.Labels['hexacore.uso'], 'cu015');
const puerto = contenedor.NetworkSettings.Ports['5432/tcp'][0];
assert.equal(puerto.HostIp, '127.0.0.1'); assert.equal(puerto.HostPort, '15459');
const configuracion = Object.fromEntries(contenedor.Config.Env.map(e => { const i = e.indexOf('='); return [e.slice(0,i),e.slice(i+1)]; }));
const opciones = { host: '127.0.0.1', port: 15459, user: configuracion.POSTGRES_USER, password: configuracion.POSTGRES_PASSWORD };
const prefijo = 'cu015_' + randomUUID().replaceAll('-', '').slice(0, 12);

function preparar(database, anterior = false) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test',
    POSTGRES_HOST: opciones.host, POSTGRES_PUERTO: String(opciones.port), POSTGRES_USUARIO: opciones.user,
    POSTGRES_CONTRASENA: opciones.password, POSTGRES_BD: database };
  const programa = `${anterior ? `const h=require(${JSON.stringify(resolve(raiz, 'dist/compartido/persistencia/historia'))});
    const g=h.GRUPOS_MIGRACIONES.find(g=>g.conexion==='alimentos');
    g.migraciones=g.migraciones.filter(m=>!['GestionEstablecimientosCu0151794300000000','MenuInventarioCu0121794400000000','PreparacionCu0131794500000000'].includes(m.name));` : ''}
    require(${JSON.stringify(resolve(raiz, 'dist/compartido/persistencia/preparar-base'))}).prepararBase().catch(e=>{console.error(e.message);process.exitCode=1;});`;
  const salida = execFileSync(process.execPath, ['-e', programa], { env, cwd: '/tmp', encoding: 'utf8' });
  return JSON.parse(salida.trim().split('\n').at(-1));
}

(async () => {
  const control = new Client({ ...opciones, database: 'hexacore_cu015' }); await control.connect();
  try {
    for (const tipo of ['vacia', 'actualizacion']) {
      const database = `${prefijo}_${tipo}`;
      await control.query(`CREATE DATABASE "${database}"`);
      const inicial = preparar(database, tipo === 'actualizacion');
      assert.equal(inicial.migraciones, tipo === 'vacia' ? 28 : 25);
      const c = new Client({ ...opciones, database }); await c.connect();
      try {
        if (tipo === 'actualizacion') {
          const evento = randomUUID(), local = randomUUID(), producto = randomUUID(), pedido = randomUUID();
          await c.query("INSERT INTO alimentos.eventos_referencia(evento_id,nombre,disponible) VALUES($1,'Referencia anterior',true)", [evento]);
          await c.query("INSERT INTO alimentos.establecimientos(id,evento_id,nombre,estado,punto_entrega) VALUES($1,$2,'Local conservado','CERRADO','Puerta anterior')", [local,evento]);
          await c.query("INSERT INTO alimentos.productos(id,establecimiento_id,nombre,precio,cantidad_inventario,activo) VALUES($1,$2,'Producto previo',1000,7,true)", [producto,local]);
          await c.query(`INSERT INTO alimentos.pedidos(id,cliente_id,establecimiento_id,estado,total,moneda,metodo_entrega,expira_en,codigo_qr,confirmado_en)
            VALUES($1,$2,$3,'CONFIRMADO',1000,'COP','RECOGER',now()+interval '10 minutes','QR conservado',now())`, [pedido,randomUUID(),local]);
          await c.query("INSERT INTO alimentos.detalles_pedido(pedido_id,producto_id,nombre_producto,precio_unitario,cantidad) VALUES($1,$2,'Snapshot previo',1000,1)", [pedido,producto]);
          const consultas = ['SELECT id,evento_id,nombre,estado,punto_entrega FROM alimentos.establecimientos',
            'SELECT * FROM alimentos.pedidos', 'SELECT * FROM alimentos.productos', 'SELECT * FROM alimentos.detalles_pedido'];
          const antes = [];
          for (const q of consultas) antes.push((await c.query(q)).rows);
          const actualizacion = preparar(database);
          assert.deepEqual(actualizacion.esquemas.alimentos.aplicadas, ['GestionEstablecimientosCu0151794300000000','MenuInventarioCu0121794400000000','PreparacionCu0131794500000000']);
          for (let i = 0; i < consultas.length; i++) { const nuevas=(await c.query(consultas[i])).rows.map(r=>Object.fromEntries(Object.keys(antes[i][0]).map(k=>[k,r[k]]))); assert.deepEqual(nuevas, antes[i]); }
          const fila = (await c.query('SELECT contacto,hora_apertura::text,hora_cierre::text,zona_horaria FROM alimentos.establecimientos')).rows[0];
          assert.deepEqual(fila, { contacto: 'Pendiente de actualizar', hora_apertura: '00:00:00', hora_cierre: '00:00:00', zona_horaria: 'America/Bogota' });
        }
        const repetida = preparar(database);
        assert.ok(Object.values(repetida.esquemas).every(g => g.aplicadas.length === 0));
        assert.equal((await c.query('SELECT count(*)::int n FROM migracion_control.procedencia')).rows[0].n, 18);
        assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
        console.log(`${tipo}: ${database}, 28 migraciones, repetición sin DDL y 18 procedencias conservadas; ${tipo === 'actualizacion' ? 'establecimiento/pedido/producto/detalle idénticos' : 'instalación sin semillas'}.`);
      } finally { await c.end(); }
    }
  } finally { await control.end(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
