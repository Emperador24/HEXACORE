const { execFileSync } = require('node:child_process');
const { createSign } = require('node:crypto');
const c = require('./sse-comun.cjs'), p = require('./preparar-parqueaderos.cjs'), entorno = require('./parqueaderos-entorno.cjs');
const esperar = ms => new Promise(r => setTimeout(r, ms));
const docker = args => execFileSync('docker', args, { encoding: 'utf8' });
async function main() {
  const nombre = process.argv[2]; c.assert(/^(desarrollo(?:-\d+)?|final-[123])$/.test(nombre));
  const archivo = 'sse-' + nombre + '.json'; c.assert(!c.fs.existsSync(c.path.join(c.privado(), archivo)));
  const m = c.guarda(), db = await c.conexion();
  const r = { nombre, inicioUTC: new Date().toISOString(), imagen: m.imagen, canales: [], shutdown: {}, estado: 'EN_CURSO' };
  function comprobar(ok, mensaje) { c.assert(ok, mensaje); }
  async function cerrarTerminal(f, codigo, desde) {
    await f.hastaCierre(); comprobar(f.frames.at(-1)?.tipo === 'sesion_finalizada', 'Evento terminal definido');
    comprobar(f.frames.at(-1).datos.codigo === codigo, 'Código terminal saneado ' + codigo);
    comprobar(f.frames.filter(x => x.tipo === 'sesion_finalizada').length === 1, 'Un cierre terminal');
    comprobar(f.fin !== undefined, 'EOF observado, sin esperar flujo infinito');
    comprobar(f.frames.filter(x => x.tipo === 'ocupacion').every(x => x.ms <= desde), 'Sin datos nuevos después de invalidar');
    comprobar(Object.keys(f.frames.at(-1).datos).sort().join(',') === 'codigo,mensaje', 'Sin errores internos ni credenciales');
    return { cierreMs: f.fin - desde, datosPosteriores: 0, codigo, eof: true, frames: f.frames };
  }
  const sesiones = [], eventos = [];
  try {
    for (const [canal, servidor] of [['gateway', c.base], ['nucleo', 'http://127.0.0.1:13149']]) {
      const org = await p.iniciarSesion('organizador', servidor), cliente = await p.iniciarSesion('cliente', servidor), personal = await p.iniciarSesion('personal', servidor);
      const evento = await p.evento(org.token, servidor); sesiones.push(org.token); eventos.push(evento);
      const prueba = { canal, evento, rechazosIniciales: [] }; r.canales.push(prueba);
      for (const [tipo, token, estado] of [['sin', undefined, 401], ['invalido', 'no.es.valido', 401], ['cliente', cliente.token, 403], ['personal', personal.token, 403]]) {
        const x = await c.abrir(servidor, evento, token); comprobar(x.estado === estado, 'Rechazo inicial ' + tipo); await x.cerrar(); prueba.rechazosIniciales.push({ tipo, estado });
      }
      let f = await c.abrir(servidor, evento, org.token);
      try {
        comprobar(f.estado === 200, 'Conexión válida'); const a = await f.siguiente(), b = await f.siguiente();
        comprobar(a.tipo === 'ocupacion' && b.tipo === 'ocupacion' && b.datos.evento.id === evento && b.datos.actualizadoEn > a.datos.actualizadoEn, 'Sesión válida recibe panel nuevo');
        prueba.valida = { eventos: 2, intervaloMs: b.ms - a.ms, estado: 200 };
      } finally { await f.cerrar(); }
      const [{ n }] = await db.ds.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND application_name='nucleo-parqueaderos' AND state='idle in transaction'");
      comprobar(n === 0, 'Desconexión del cliente sin transacciones retenidas'); prueba.desconexion = { transaccionesRetenidas: n, readerCancelado: true };
      const rev = await p.iniciarSesion('organizador', servidor); f = await c.abrir(servidor, evento, rev.token);
      try {
        await f.siguiente(); const x = await c.peticion('/api/v1/sesiones/actual', { servidor, metodo: 'DELETE', token: rev.token }); comprobar(x.estado === 200, 'Revocación real');
        const desde = performance.now() - f.inicio; prueba.revocacion = await cerrarTerminal(f, 'SIN_AUTENTICAR', desde);
        comprobar(prueba.revocacion.cierreMs <= 6000, 'Revocación detectada dentro del presupuesto');
        const nueva = await c.abrir(servidor, evento, rev.token); comprobar(nueva.estado === 401, 'Nueva conexión revocada 401'); await nueva.cerrar(); prueba.revocacion.nuevaConexion = 401;
      } finally { await f.cerrar(); }
      // Fixture firmada de vida corta para una sesión propia real. No cambia reloj, TTL de producto ni fila de sesión.
      const corta = await p.iniciarSesion('organizador', servidor), partes = corta.token.split('.'), payload = JSON.parse(Buffer.from(partes[1], 'base64url'));
      payload.exp = Math.floor(Date.now() / 1000) + 5;
      const texto = partes[0] + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
      const clave = c.fs.readFileSync(m.montajes.find(x => x.Destination === '/claves/jwt-privada.pem').Source);
      const tokenCorto = texto + '.' + createSign('RSA-SHA256').update(texto).sign(clave, 'base64url');
      f = await c.abrir(servidor, evento, tokenCorto);
      try {
        comprobar(f.estado === 200, 'JWT corto válido al conectar'); await f.hastaCierre();
        comprobar(f.frames.at(-1)?.datos.codigo === 'SIN_AUTENTICAR' && f.fin !== undefined, 'JWT caducado cierra');
        const datos = f.frames.filter(x => x.tipo === 'ocupacion'); comprobar(datos.length >= 1 && datos.every(x => Date.parse(x.recibidoUTC) < payload.exp * 1000), 'Sin ocupación entregada después de exp');
        prueba.caducidad = { fixtureJwtCorta: true, relojSinCambios: true, ttlProductivoSinCambios: true, expUTC: new Date(payload.exp * 1000).toISOString(),
          cierreTrasExpMs: Date.now() - payload.exp * 1000, datosPosteriores: 0, eof: true, frames: f.frames };
        comprobar(prueba.caducidad.cierreTrasExpMs <= 6000, 'Caducidad detectada dentro del presupuesto');
        const nueva = await c.abrir(servidor, evento, tokenCorto); comprobar(nueva.estado === 401, 'JWT caducado inicial 401'); await nueva.cerrar();
      } finally { await f.cerrar(); }
      // Espera real de SQL en la base exclusiva: revocar mientras el panel está consultando.
      const concurrente = await p.iniciarSesion('organizador', servidor); f = await c.abrir(servidor, evento, concurrente.token);
      const lock = db.ds.createQueryRunner();
      try {
        await f.siguiente(); await lock.connect(); await lock.startTransaction(); await lock.query('LOCK TABLE zonas_parqueadero IN ACCESS EXCLUSIVE MODE');
        const limite = performance.now() + 4500; let bloqueada = false;
        do {
          bloqueada = (await db.ds.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='nucleo-parqueaderos' AND wait_event_type='Lock') AS existe"))[0].existe;
          if (bloqueada) break; await esperar(25);
        } while (performance.now() < limite);
        comprobar(bloqueada, 'Panel realmente en consulta SQL');
        const x = await c.peticion('/api/v1/sesiones/actual', { servidor, metodo: 'DELETE', token: concurrente.token }); comprobar(x.estado === 200, 'Revocar durante SQL');
        const desde = performance.now() - f.inicio; await lock.rollbackTransaction();
        prueba.consultaEnCurso = { bloqueadaRealmente: true, liberadaTrasRevocar: true, ...await cerrarTerminal(f, 'SIN_AUTENTICAR', desde) };
      } finally { if (lock.isTransactionActive) await lock.rollbackTransaction(); await lock.release(); await f.cerrar(); }
      // Redis dedicado: pausa de comandos finita, sin detener Redis de ningún otro ámbito.
      const fallo = await p.iniciarSesion('organizador', servidor); f = await c.abrir(servidor, evento, fallo.token);
      let pausado;
      try {
        await f.siguiente(); const redis = entorno.inspect(m.redis); comprobar(redis.Id === m.redisId && redis.Config.Labels['com.docker.compose.project'] === entorno.proyecto, 'Redis exclusivo comprobado');
        comprobar(docker(['exec', m.redis, 'redis-cli', 'CLIENT', 'PAUSE', '6500', 'ALL']).trim() === 'OK', 'Fallo Redis finito'); pausado = performance.now();
        const desde = pausado - f.inicio, antes = performance.now(); const nueva = await c.abrir(servidor, evento, fallo.token);
        comprobar(nueva.estado === 503, 'Redis no comprobable inicial 503'); await nueva.cerrar();
        prueba.redis = { nuevaConexion: 503, inicialMs: performance.now() - antes, ...await cerrarTerminal(f, 'SESIONES_NO_DISPONIBLES', desde), pausaMs: 6500 };
        comprobar(prueba.redis.inicialMs <= 3500 && prueba.redis.cierreMs <= 6000, 'Fallo Redis acotado y restrictivo');
      } finally { await f.cerrar(); if (pausado) await esperar(Math.max(0, 6500 - (performance.now() - pausado)) + 100); }
      const recuperada = await c.abrir(servidor, evento, org.token);
      try { comprobar(recuperada.estado === 200 && (await recuperada.siguiente()).tipo === 'ocupacion', 'Control posterior a fin programado del fallo'); prueba.redis.controlPosterior = 200; }
      finally { await recuperada.cerrar(); }
      console.log(nombre, canal, 'válida/revocación/caducidad/SQL/Redis/desconexión aprobados');
    }
    const abiertos = [];
    try {
      for (const [i, servidor] of [c.base, 'http://127.0.0.1:13149'].entries()) { const f = await c.abrir(servidor, eventos[i], sesiones[i]); comprobar(f.estado === 200, 'Conexión para SIGTERM'); await f.siguiente(); abiertos.push(f); }
      const inicio = performance.now(); docker(['kill', '--signal=SIGTERM', m.core]); await Promise.all(abiertos.map(f => f.hastaCierre()));
      let estado; const limite = inicio + 5000;
      do { estado = entorno.inspect(m.core); if (!estado.State.Running) break; await esperar(25); } while (performance.now() < limite);
      comprobar(!estado.State.Running && [0, 143].includes(estado.State.ExitCode) && !estado.State.OOMKilled && performance.now() - inicio <= 5000, 'SIGTERM conserva límite de 5 s');
      r.shutdown = { conexiones: 2, eof: true, ms: performance.now() - inicio, codigo: estado.State.ExitCode, oom: estado.State.OOMKilled, limiteMs: 5000 };
      docker(['start', m.core]); const listoAntes = performance.now(); let listo = false;
      do { try { listo = (await fetch('http://127.0.0.1:13149/api/v1/salud', { signal: AbortSignal.timeout(1000) })).status === 200; } catch {} if (listo) break; await esperar(100); } while (performance.now() - listoAntes < 10000);
      comprobar(listo, 'Mismo contenedor reanudado tras el caso de cierre');
    } finally { await Promise.all(abiertos.map(f => f.cerrar())); }
    r.estado = 'APROBADO';
  } catch (e) { r.estado = 'FALLIDO'; r.error = e.message; process.exitCode = 1; }
  finally { r.finUTC = new Date().toISOString(); c.guardar(archivo, r); await db.cerrar(); console.log(JSON.stringify({ nombre, estado: r.estado, canales: r.canales.length, shutdown: r.shutdown, error: r.error })); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
