const { execFileSync } = require('node:child_process');
const c = require('./operacion-comun.cjs'), entorno = require('./parqueaderos-entorno.cjs');
const docker = args => execFileSync('docker', args, { encoding: 'utf8' });
async function main() {
  const nombre = process.argv[2]; c.assert(/^(desarrollo(?:-\d+)?|(?:(?:normalizada|compacta|cierre)-)?final-[123])$/.test(nombre));
  const archivo = 'operacion-sse-' + nombre + '.json'; c.assert(!c.fs.existsSync(c.path.join(c.privado(), archivo)));
  const m = c.guarda(), db = await c.conexion(), fixture = c.leer('fixture-operacion.json');
  const r = { nombre, imagen: m.imagen, inicioUTC: new Date().toISOString(), casos: [], shutdown: {}, regresionParqueaderos: [], estado: 'EN_CURSO' };
  const abiertosFinales = [];
  async function terminal(f, codigo, desde) {
    await f.hastaCierre(); const fin = f.frames.at(-1);
    c.assert.equal(fin?.tipo, 'sesion_finalizada'); c.assert.equal(fin.datos.codigo, codigo);
    c.assert.equal(f.frames.filter(x => x.tipo === 'sesion_finalizada').length, 1); c.assert(f.fin !== undefined);
    c.assert.deepEqual(Object.keys(fin.datos).sort(), ['codigo','mensaje']);
    c.assert(f.frames.filter(x => x.tipo !== 'sesion_finalizada').every(x => x.ms <= desde), 'Sin datos posteriores a invalidación');
    const cierreMs = f.fin - desde; c.assert(cierreMs <= 6000, 'Mismo presupuesto máximo de detección que Parqueaderos');
    return { codigo, cierreMs, datosPosteriores: 0, eof: true, frames: f.frames };
  }
  async function sinTransacciones() {
    const limite = performance.now() + 3000;
    for (;;) {
      const [{ n }] = await db.ds.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND application_name='nucleo-operacion' AND state='idle in transaction'");
      if (n === 0) return; c.assert(performance.now() < limite, 'Sin transacciones SSE retenidas'); await c.esperar(25);
    }
  }
  try {
    for (const [canal, servidor] of [['gateway', c.base], ['nucleo', 'http://127.0.0.1:13149']]) {
      const org = await c.sesion('organizador', servidor), admin = await c.sesion('admin', servidor), cliente = await c.sesion('cliente', servidor), personal = await c.sesion('personal', servidor);
      const e = await c.escenario(servidor, org.token), propuesta = await c.proponer(servidor, org.token, e);
      for (const [tipo, ruta, ciclo, modulo] of [
        ['evacuacion', '/emergencias/evacuaciones/' + propuesta.evacuacion.id + '/flujo', 2000, 'emergencias'],
        ['panel', '/monitoreo/eventos/' + e.evento.id + '/flujo', 3000, 'reportes'],
      ]) {
        const caso = { canal, tipo, cicloMs: ciclo, iniciales: [] }; r.casos.push(caso);
        for (const [actor, token, esperado] of [['sin', undefined, 401], ['invalido', 'no.es.valido', 401], ['cliente', cliente.token, 403], ['personal', personal.token, 403]]) {
          const f = await c.abrir(servidor, ruta, token); c.assert.equal(f.estado, esperado); await f.cerrar(); caso.iniciales.push({ actor, estado: esperado });
        }
        let f = await c.abrir(servidor, ruta, org.token);
        try {
          c.assert.equal(f.estado, 200); const a = await f.siguiente(), b = await f.siguiente();
          c.assert.equal(a.tipo, tipo); c.assert.equal(b.tipo, tipo); c.assert(b.datos.actualizadoEn > a.datos.actualizadoEn);
          c.assert(tipo === 'panel' ? b.datos.evento.id === e.evento.id : b.datos.evacuacion.id === propuesta.evacuacion.id && b.datos.evacuacion.eventoId === e.evento.id);
          caso.valida = { datos: 2, recursoCorrecto: true, intervaloMs: b.ms - a.ms };
        } finally { await f.cerrar(); }
        await sinTransacciones(); caso.desconexion = { lectorCancelado: true, transaccionesRetenidas: 0 };
        const rev = await c.sesion('organizador', servidor); f = await c.abrir(servidor, ruta, rev.token);
        try {
          await f.siguiente(); c.assert.equal((await c.peticion('/api/v1/sesiones/actual', { servidor, metodo: 'DELETE', token: rev.token })).estado, 200);
          caso.revocacion = await terminal(f, 'SIN_AUTENTICAR', performance.now() - f.inicio);
          const nueva = await c.abrir(servidor, ruta, rev.token); c.assert.equal(nueva.estado, 401); await nueva.cerrar(); caso.revocacion.inicialPosterior = 401;
        } finally { await f.cerrar(); }
        const corta = c.tokenCorto((await c.sesion('organizador', servidor)).token, m); f = await c.abrir(servidor, ruta, corta.token);
        try {
          c.assert.equal(f.estado, 200); await f.hastaCierre(); c.assert.equal(f.frames.at(-1)?.datos.codigo, 'SIN_AUTENTICAR'); c.assert(f.fin !== undefined);
          c.assert(f.frames.filter(x => x.tipo === tipo).every(x => Date.parse(x.recibidoUTC) < corta.exp));
          const ms = Date.now() - corta.exp; c.assert(ms <= 6000);
          caso.caducidad = { fixtureJwtCorta: true, ttlProductivoIntacto: true, relojIntacto: true, cierreTrasExpMs: ms, datosPosteriores: 0, eof: true, frames: f.frames };
        } finally { await f.cerrar(); }
        // CU-028 ya integrado: retirar por su API un permiso propio con sesión abierta.
        const lector = await c.sesion('lector', servidor), rolId = fixture.roles.leer.id, otroModulo = modulo === 'reportes' ? 'emergencias' : 'reportes';
        f = await c.abrir(servidor, ruta, lector.token); let modificado = false;
        try {
          c.assert.equal(f.estado, 200); await f.siguiente();
          const actual = await c.http(servidor, 'GET', '/admin/roles/' + rolId, admin.token); c.assert.equal(actual.estado, 200);
          const cambio = await c.http(servidor, 'PUT', '/admin/roles/' + rolId, admin.token, { version: actual.datos.version, permisos: [{ modulo: otroModulo, accion: 'leer' }] }); c.assert.equal(cambio.estado, 200); modificado = true;
          caso.permisoRetirado = await terminal(f, 'ROL_INSUFICIENTE', performance.now() - f.inicio);
          const nueva = await c.abrir(servidor, ruta, lector.token); c.assert.equal(nueva.estado, 403); await nueva.cerrar(); caso.permisoRetirado.inicialPosterior = 403;
        } finally {
          await f.cerrar();
          if (modificado) {
            const actual = await c.http(servidor, 'GET', '/admin/roles/' + rolId, admin.token); c.assert.equal(actual.estado, 200);
            c.assert.equal((await c.http(servidor, 'PUT', '/admin/roles/' + rolId, admin.token, { version: actual.datos.version, permisos: ['emergencias','reportes'].map(modulo => ({ modulo, accion: 'leer' })) })).estado, 200);
          }
        }
        // Bloqueo SQL solo en la base nueva. La interfaz de cobertura queda
        // pendiente y el monitor de seguridad debe seguir activo, sin emitir tarde.
        const concurrente = await c.sesion('organizador', servidor); f = await c.abrir(servidor, ruta, concurrente.token); const lock = db.ds.createQueryRunner();
        try {
          await f.siguiente(); await lock.connect(); await lock.startTransaction(); await lock.query('LOCK TABLE personal_logistica.zonas_evento IN ACCESS EXCLUSIVE MODE');
          const limite = performance.now() + 4500; let bloqueada = false;
          do { bloqueada = (await db.ds.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%zonas_evento%') existe"))[0].existe;
            if (bloqueada) break; await c.esperar(25); } while (performance.now() < limite);
          c.assert(bloqueada, 'Consulta realmente pendiente');
          c.assert.equal((await c.peticion('/api/v1/sesiones/actual', { servidor, metodo: 'DELETE', token: concurrente.token })).estado, 200);
          caso.consultaPendiente = { sqlBloqueada: true, ...await terminal(f, 'SIN_AUTENTICAR', performance.now() - f.inicio) };
          await lock.rollbackTransaction(); await sinTransacciones(); caso.consultaPendiente.transaccionesRetenidas = 0;
        } finally { if (lock.isTransactionActive) await lock.rollbackTransaction(); await lock.release(); await f.cerrar(); }
        const fallo = await c.sesion('organizador', servidor); f = await c.abrir(servidor, ruta, fallo.token); let pausado;
        try {
          await f.siguiente(); const redis = entorno.inspect(m.redis); c.assert.equal(redis.Id, m.redisId); c.assert.equal(redis.Config.Labels['com.docker.compose.project'], entorno.proyecto);
          c.assert.equal(docker(['exec', m.redis, 'redis-cli', 'CLIENT', 'PAUSE', '6500', 'ALL']).trim(), 'OK'); pausado = performance.now(); const desde = pausado - f.inicio;
          const antes = performance.now(), nueva = await c.abrir(servidor, ruta, fallo.token); c.assert.equal(nueva.estado, 503); await nueva.cerrar();
          caso.redis = { inicialPosterior: 503, inicialMs: performance.now() - antes, pausaMs: 6500, ...await terminal(f, 'SESIONES_NO_DISPONIBLES', desde) };
          c.assert(caso.redis.inicialMs <= 3500);
        } finally { await f.cerrar(); if (pausado) await c.esperar(Math.max(0, 6500 - (performance.now() - pausado)) + 100); }
        const sana = await c.abrir(servidor, ruta, org.token); try { c.assert.equal(sana.estado, 200); c.assert.equal((await sana.siguiente()).tipo, tipo); caso.redis.controlPosterior = 200; } finally { await sana.cerrar(); }
        abiertosFinales.push({ servidor, ruta, token: org.token });
        console.log(nombre, canal, tipo, 'continuidad/revocación/exp/permiso/SQL/Redis/desconexión aprobados');
      }
      // Regresión HTTP acotada del SSE anterior, sin repetir los 300 controles.
      const propia = await c.sesion('organizador', servidor), ruta = '/parqueaderos/eventos/' + e.evento.id + '/ocupacion/flujo';
      const anterior = await c.abrir(servidor, ruta, propia.token);
      try { c.assert.equal((await anterior.siguiente()).tipo, 'ocupacion');
        c.assert.equal((await c.peticion('/api/v1/sesiones/actual', { servidor, metodo: 'DELETE', token: propia.token })).estado, 200);
        r.regresionParqueaderos.push({ canal, ...await terminal(anterior, 'SIN_AUTENTICAR', performance.now() - anterior.inicio) });
      } finally { await anterior.cerrar(); }
    }
    const abiertos = [];
    try {
      for (const x of abiertosFinales) { const f = await c.abrir(x.servidor, x.ruta, x.token); c.assert.equal(f.estado, 200); await f.siguiente(); abiertos.push(f); }
      const inicio = performance.now(); docker(['kill','--signal=SIGTERM',m.core]); await Promise.all(abiertos.map(f => f.hastaCierre()));
      let estado; const limite = inicio + 5000;
      do { estado = entorno.inspect(m.core); if (!estado.State.Running) break; await c.esperar(25); } while (performance.now() < limite);
      c.assert(!estado.State.Running && [0,143].includes(estado.State.ExitCode) && !estado.State.OOMKilled && performance.now() - inicio <= 5000);
      r.shutdown = { conexiones: 4, eof: true, ms: performance.now() - inicio, codigo: estado.State.ExitCode, oom: estado.State.OOMKilled, limiteMs: 5000 };
      docker(['start',m.core]); const inicioSalud = performance.now(); let listo = false;
      do { try { listo = (await fetch('http://127.0.0.1:13149/api/v1/salud', { signal: AbortSignal.timeout(1000) })).status === 200; } catch {} if (listo) break; await c.esperar(100); } while (performance.now() - inicioSalud < 10000);
      c.assert(listo, 'Reanudación prevista del mismo contenedor después del caso SIGTERM');
    } finally { await Promise.all(abiertos.map(f => f.cerrar())); }
    r.estado = 'APROBADO';
  } catch (e) { r.estado = 'FALLIDO'; r.error = e.message; process.exitCode = 1; }
  finally { r.finUTC = new Date().toISOString(); try { c.guardar(archivo, r); } finally { await db.cerrar(); }
    console.log(JSON.stringify({ nombre, estado: r.estado, casos: r.casos.length, shutdown: r.shutdown, error: r.error })); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
