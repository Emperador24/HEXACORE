// Diagnóstico acotado y de solo lectura durante la regresión existente.
// Credenciales y trazas quedan únicamente en .evidencia (ignorada por Git).
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const ejecutar = promisify(require('node:child_process').execFile);
const { mkdirSync, appendFileSync, writeFileSync, existsSync, cpSync } = require('node:fs');
const { resolve } = require('node:path');
const { Client } = require('pg');
const raiz = resolve(__dirname, '../../../..');
const sello = new Date().toISOString().replace(/[:.]/g, '-');
const implementados = process.argv.includes('--implementados');
const visible = process.argv.includes('--visible');
const salida = resolve(raiz, 'App/e2e/.evidencia', `${implementados ? 'conjunto-observado' : 'cu013-referencia'}-${sello}`);
const escribir = (tipo, datos) => appendFileSync(resolve(salida, `${tipo}.jsonl`), JSON.stringify({ instante: new Date().toISOString(), ...datos }) + '\n');
const pausa = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  assert.ok(process.env.CU015_CLAVE_DEMO, 'Define CU015_CLAVE_DEMO localmente.');
  const configuracion = JSON.parse(execFileSync('python3', [resolve(raiz, 'App/infra/revision/revision.py'), '--perfil', 'cu015', 'config'], { encoding: 'utf8' }));
  assert.equal(configuracion.name, 'hexacore-cu015-sebastian');
  const [pg] = JSON.parse(execFileSync('docker', ['inspect', 'hexacore-cu015-sebastian-postgres-1'], { encoding: 'utf8' }));
  assert.equal(pg.Config.Labels['hexacore.uso'], 'cu015');
  assert.equal(pg.NetworkSettings.Ports['5432/tcp'][0].HostPort, '15459');
  const env = configuracion.services.nucleo.environment;
  assert.equal(env.POSTGRES_BD, 'hexacore_cu015');
  mkdirSync(salida, { recursive: true });
  console.log(`Evidencia privada: ${salida}`);
  const cu028 = implementados ? require(resolve(raiz, 'App/e2e/cu028-estado.cjs')).estadoCu028() : null;
  if (cu028) {
    writeFileSync(resolve(salida, 'cu028.json'), JSON.stringify(cu028, null, 2));
    console.log(`CU-028 ${cu028.estado}: no se acredita el caso completo.`);
  }
  const cliente = new Client({ host: '127.0.0.1', port: 15459, database: env.POSTGRES_BD,
    user: env.POSTGRES_USUARIO, password: env.POSTGRES_CONTRASENA,
    application_name: 'cu013-observador', connectionTimeoutMillis: 3000, query_timeout: 3000, statement_timeout: 3000 });
  cliente.on('error', e => escribir('errores-observador', { error: e.code ?? e.message }));
  await cliente.connect();
  const antes = new Date().toISOString();
  const original = resolve(raiz, 'App/e2e/.evidencia/resultados');
  if (existsSync(original)) cpSync(original, resolve(salida, 'resultados-anteriores'), { recursive: true });
  let activo = true;
  // Mantener la referencia histórica de seis casos aunque crezca test:alimentos.
  const guion = implementados ? 'test:implementados' : process.argv.includes('--todos') ? 'test:preparacion' : 'test:referencia';
  const hijo = spawn('npm', ['--prefix', resolve(raiz, 'App/e2e'), 'run', guion, '--', ...(visible ? ['--headed'] : []), `--output=${resolve(salida, 'resultados')}`], {
    cwd: raiz, env: { ...process.env, PLAYWRIGHT_HTML_OUTPUT_DIR: resolve(salida, 'informe') }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const canal of [hijo.stdout, hijo.stderr]) canal.on('data', d => appendFileSync(resolve(salida, 'playwright.log'), d));
  const terminado = new Promise(ok => { hijo.once('exit', codigo => { activo = false; ok(codigo); }); hijo.once('error', e => { activo = false; escribir('errores-observador', { error: e.message }); ok(1); }); });
  const sistema = async () => {
    const lecturas = await Promise.allSettled([
      ejecutar('docker', ['exec', 'hexacore-cu015-sebastian-postgres-1', 'cat', '/proc/pressure/memory', '/proc/pressure/cpu', '/proc/pressure/io']),
      ejecutar('docker', ['stats', '--no-stream', '--format', '{{json .}}']),
      ejecutar('vm_stat'),
      // Contadores del cgroup propio: distinguir reclaim/fallos de página de CPU limitada.
      // /proc/*/stat contiene nombres/PID/contadores, nunca argumentos o cuerpos HTTP.
      ejecutar('docker', ['exec', 'hexacore-cu015-sebastian-nucleo-1', 'sh', '-c',
        'cat /sys/fs/cgroup/memory.stat /sys/fs/cgroup/memory.events /sys/fs/cgroup/memory.pressure /sys/fs/cgroup/cpu.stat /proc/[0-9]*/stat']),
    ]);
    lecturas.forEach((r, i) => escribir(['presion-vm', 'docker', 'memoria-host', 'recursos-nucleo'][i], r.status === 'fulfilled' ? { salida: r.value.stdout } : { error: r.reason.message }));
  };
  let siguienteSistema = 0;
  while (activo) {
    const inicio = performance.now();
    try {
      const { rows } = await cliente.query(`SELECT pid,application_name,state,wait_event_type,wait_event,
        extract(epoch FROM clock_timestamp()-query_start)*1000 AS consulta_ms,
        extract(epoch FROM clock_timestamp()-xact_start)*1000 AS transaccion_ms,
        pg_blocking_pids(pid) AS bloqueantes,split_part(ltrim(query),' ',1) AS comando,
        md5(query) AS huella_consulta
        FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()`);
      escribir('postgres', { idaVueltaMs: performance.now() - inicio, conexiones: rows });
    } catch (e) { escribir('errores-observador', { idaVueltaMs: performance.now() - inicio, error: e.code ?? e.message }); }
    if (Date.now() >= siguienteSistema) {
      siguienteSistema = Date.now() + 5000;
      const consulta = performance.now();
      try {
        const r = await cliente.query(`EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) SELECT id FROM alimentos.operaciones_inventario WHERE estado='PENDIENTE' ORDER BY secuencia LIMIT 50`);
        const plan = r.rows[0]['QUERY PLAN'][0];
        escribir('plan-sondeo', { idaVueltaMs: performance.now() - consulta, plan });
      } catch (e) { escribir('errores-observador', { idaVueltaMs: performance.now() - consulta, error: e.code ?? e.message }); }
      // Conservar recursos también si PostgreSQL acaba de fallar.
      await sistema();
    }
    if (activo) await pausa(1000);
  }
  const codigo = await terminado;
  await cliente.end();
  for (const servicio of ['postgres', 'nucleo', 'api-gateway']) {
    const r = await ejecutar('docker', ['logs', '--since', antes, `hexacore-cu015-sebastian-${servicio}-1`]);
    writeFileSync(resolve(salida, `${servicio}.log`), r.stdout + r.stderr);
  }
  const codigoCompleto = codigo === 0 && cu028 ? 2 : codigo;
  escribir('resultado', { codigo: codigoCompleto, playwright: codigo, visible, cu028: cu028?.estado, completo: cu028 ? false : undefined, inicio: antes, fin: new Date().toISOString(), poolConfigurado: { max: env.POSTGRES_MAX_CONEXIONES ?? 10, esperaMs: env.POSTGRES_ESPERA_MAXIMA_MS ?? 3000 },
    limite: 'pg_stat_activity muestra conexiones en el servidor; no permite medir waitingCount del pool dentro de Núcleo.' });
  console.log(`Playwright terminó con ${codigo}. No se modificaron timeouts, reintentos ni servicios.`);
  if (cu028) console.log('El conjunto completo conserva el bloqueo explícito de CU-028.');
  process.exitCode = codigoCompleto ?? 1;
})().catch(e => { console.error(e.message); process.exitCode = 1; });
