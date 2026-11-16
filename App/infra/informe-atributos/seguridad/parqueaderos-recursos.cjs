// Autorización semántica real. Datos crudos solo en SEGURIDAD_SALIDA ignorada.
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const c = require('./parqueaderos-comun.cjs'), p = require('./preparar-parqueaderos.cjs');
const P = '/api/v1/parqueaderos';
const placa = () => 'P' + randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase();
const hace = min => new Date(Date.now() - min * 60000).toISOString();
async function main() {
  const nombre = process.argv[2]; c.assert(/^(desarrollo(?:-\d+)?|final-[123])$/.test(nombre));
  c.assert(!c.fs.existsSync(c.path.join(c.privado(), nombre + '.json')), 'Sin sobrescribir evidencia ni reintentar');
  const m = c.guarda(), f = c.leer('fixture-parqueaderos.json'), db = await c.conexion();
  const resultado = { nombre, inicio: new Date().toISOString(), sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    coreId: m.coreId, imagen: m.imagen, observaciones: [], canales: [], estado: 'EN_CURSO' };
  const obs = resultado.observaciones;
  function verificar(canal, caso, condicion, categoria = 'semantica') {
    obs.push({ canal, caso, categoria, ok: !!condicion }); c.assert(condicion, caso);
  }
  try {
    for (const [canal, servidor] of [['gateway', c.base], ['nucleo', 'http://127.0.0.1:13149']]) {
      const tokens = {};
      for (const actor of Object.keys(f.actores)) tokens[actor] = (await p.iniciarSesion(actor, servidor)).token;
      const a = await p.evento(tokens.organizador, servidor), b = await p.evento(tokens.otroOrganizador, servidor), eventos = [a, b];
      const E = id => '/eventos/' + id;
      const falsos = { 'X-Usuario-Id': f.actores.ajeno.id, 'X-Cliente-Id': f.actores.ajeno.id, 'X-Rol': 'Administrador', 'X-Roles': 'Administrador', 'X-Evento-Id': b };
      const operaciones = new Set(); let conservaciones = 0;
      async function snapshot() {
        const s = {};
        for (const tabla of ['zonas_parqueadero', 'reservas', 'estancias', 'asignaciones_espacio', 'redirecciones'])
          s[tabla] = await db.ds.query(`SELECT * FROM ${tabla} WHERE evento_id=ANY($1) ORDER BY id`, [eventos]);
        s.espacios = await db.ds.query('SELECT s.* FROM espacios s JOIN zonas_parqueadero z ON z.id=s.zona_id WHERE z.evento_id=ANY($1) ORDER BY s.id', [eventos]);
        s.tarifas = await db.ds.query('SELECT * FROM tarifas ORDER BY id');
        // Timestamps/intentos de entrega son asíncronos; contenido/propiedad de la notificación sí se conserva.
        s.avisos = await db.ds.query('SELECT n.id,n.reserva_id,n.cliente_id,n.mensaje,n.creada_en FROM notificaciones_reserva n JOIN reservas r ON r.id=n.reserva_id WHERE r.evento_id=ANY($1) ORDER BY n.id', [eventos]);
        s.finanzas = await db.ds.query("SELECT * FROM finanzas_pagos.transacciones_pago WHERE EXISTS(SELECT 1 FROM reservas r WHERE r.evento_id=ANY($1) AND clave_idempotencia LIKE 'parqueadero-'||r.id::text||'-%') ORDER BY clave_idempotencia", [eventos]);
        s.bloqueos = [];
        for (const e of s.espacios) { const k = 'parqueaderos:bloqueo:' + e.id; s.bloqueos.push([e.id, await db.redis.get(k), await db.redis.call('PEXPIRETIME', k)]); }
        return JSON.parse(JSON.stringify(s));
      }
      async function req(caso, metodo, ruta, actor, cuerpo, esperado, { conservar = false, codigo, categoria = 'semantica', cabeceras = {}, operacion } = {}) {
        const antes = conservar ? await snapshot() : null;
        const r = await c.peticion(P + ruta, { servidor, metodo, token: tokens[actor], cuerpo, cabeceras });
        obs.push({ canal, caso, categoria, metodo, ruta, estado: r.estado, esperado, codigo: r.datos?.codigo, datos: r.datos,
          ok: r.estado === esperado && (!codigo || r.datos?.codigo === codigo) });
        c.assert(obs.at(-1).ok, caso + ': HTTP ' + r.estado + ' / ' + (r.datos?.codigo || ''));
        if (conservar) {
          const despues = await snapshot(); obs.at(-1).antes = antes; obs.at(-1).despues = despues;
          c.assert.deepEqual(despues, antes, caso + ': SQL, QR, historial, finanzas y Redis inalterados'); obs.at(-1).conservado = true; conservaciones++;
        }
        if (operacion) operaciones.add(metodo + ' ' + operacion);
        return r.datos;
      }
      const ok = (caso, metodo, ruta, actor, cuerpo, esperado = metodo === 'POST' ? 201 : 200, operacion = ruta) =>
        req(caso, metodo, ruta, actor, cuerpo, esperado, { operacion });
      const negar = (caso, metodo, ruta, actor, cuerpo, estado = 403, codigo) => req(caso, metodo, ruta, actor, cuerpo, estado, { conservar: true, codigo });
      const v = (caso, condicion) => verificar(canal, caso, condicion);
      // Escritura global positiva únicamente en base nueva, no en la conservada.
      for (const actor of ['cliente', 'personal', 'organizador']) await negar('tarifa deniega ' + actor, 'PUT', '/tarifa', actor, { valorHora: 6000 });
      const t = await ok('tarifa administrador', 'PUT', '/tarifa', 'admin', { valorHora: 5000, motivo: 'Ámbito descartable de seguridad' });
      v('auditoría tarifa de sesión', t.vigente.definidaPor === f.actores.admin.id);
      await negar('lectura tarifa cliente', 'GET', '/tarifa', 'cliente');
      await ok('lectura tarifa personal', 'GET', '/tarifa', 'personal');
      const za = await ok('alta zona A', 'POST', E(a) + '/zonas', 'organizador', { nombre: 'Zona A', capacidad: 40, prefijo: 'A' }, 201, '/eventos/:eventoId/zonas');
      const zb = await ok('alta zona B por organizador global', 'POST', E(b) + '/zonas', 'organizador', { nombre: 'Zona B', capacidad: 40, prefijo: 'B' }, 201, '/eventos/:eventoId/zonas');
      const zc = await ok('alta zona alternativa A', 'POST', E(a) + '/zonas', 'admin', { nombre: 'Zona C', capacidad: 5, prefijo: 'C' }, 201, '/eventos/:eventoId/zonas');
      const zd = await ok('zona sin historial para borrar', 'POST', E(a) + '/zonas', 'organizador', { nombre: 'Zona D', capacidad: 2, prefijo: 'D' }, 201, '/eventos/:eventoId/zonas');
      const ma = await ok('mapa A', 'GET', E(a) + '/espacios', 'personal', undefined, 200, '/eventos/:eventoId/espacios');
      const mb = await ok('mapa B por personal global', 'GET', E(b) + '/espacios', 'personal', undefined, 200, '/eventos/:eventoId/espacios');
      const sa = ma.find(e => e.zonaId === za.id), sb = mb[0];
      v('mapas no mezclan espacios', !ma.some(e => e.id === sb.id) && mb.every(e => e.zonaId === zb.id));
      for (const [metodo, ruta, cuerpo] of [
        ['POST', E(a) + '/zonas', { nombre: 'Rechazada', capacidad: 2 }],
        ['PATCH', E(a) + '/zonas/' + za.id, { nombre: 'Rechazada' }],
        ['DELETE', E(a) + '/zonas/' + zd.id],
        ['PATCH', E(a) + '/espacios/' + sa.id, { prioridad: 20 }],
      ]) for (const actor of ['cliente', 'personal']) await negar('administración deniega ' + actor + ' ' + metodo + ruta.split('/').at(-2), metodo, ruta, actor, cuerpo);
      await negar('zona B no actualizable como A', 'PATCH', E(a) + '/zonas/' + zb.id, 'organizador', { nombre: 'Cruce' }, 404, 'ZONA_NO_ENCONTRADA');
      await negar('zona B no borrable como A', 'DELETE', E(a) + '/zonas/' + zb.id, 'organizador', undefined, 404, 'ZONA_NO_ENCONTRADA');
      await negar('espacio B no actualizable como A', 'PATCH', E(a) + '/espacios/' + sb.id, 'organizador', { prioridad: 20 }, 404, 'ESPACIO_NO_ENCONTRADO');
      await ok('actualiza zona vinculada', 'PATCH', E(a) + '/zonas/' + za.id, 'otroOrganizador', { orden: 1 }, 200, '/eventos/:eventoId/zonas/:zonaId');
      await ok('borra zona nueva sin historial', 'DELETE', E(a) + '/zonas/' + zd.id, 'organizador', undefined, 200, '/eventos/:eventoId/zonas/:zonaId');
      await ok('actualiza espacio vinculado', 'PATCH', E(a) + '/espacios/' + sa.id, 'organizador', { prioridad: 20 }, 200, '/eventos/:eventoId/espacios/:espacioId');
      const filtrados = await ok('filtro zona ajena vacío', 'GET', E(a) + '/espacios?zonaId=' + zb.id, 'personal', undefined, 200, '/eventos/:eventoId/espacios');
      v('query zona B no filtra datos a A', filtrados.length === 0);
      v('query zona B tiene control positivo', (await ok('filtro propio B', 'GET', E(b) + '/espacios?zonaId=' + zb.id, 'personal', undefined, 200, '/eventos/:eventoId/espacios')).length === 40);
      // Reservas: propiedad de sesión, antes del primer pago aprobado.
      const datos = { zonaId: za.id, placa: placa() };
      await negar('personal no reserva', 'POST', E(a) + '/reservas', 'personal', datos);
      await negar('zona de otro evento no reserva', 'POST', E(a) + '/reservas', 'cliente', { ...datos, zonaId: zb.id }, 404, 'ZONA_NO_ENCONTRADA');
      await req('clienteId en cuerpo se valida aparte', 'POST', E(a) + '/reservas', 'cliente', { ...datos, clienteId: f.actores.ajeno.id }, 400, { conservar: true, categoria: 'dto' });
      const ra = await req('reserva propia ignora cabeceras y query de propietario', 'POST', E(a) + '/reservas?clienteId=' + f.actores.ajeno.id, 'cliente', datos, 201,
        { cabeceras: falsos, operacion: '/eventos/:eventoId/reservas' });
      const rb = await ok('reserva real del otro cliente/evento', 'POST', E(b) + '/reservas', 'ajeno', { zonaId: zb.id, placa: placa() }, 201, '/eventos/:eventoId/reservas');
      const [fila] = await db.ds.query('SELECT cliente_id,evento_id,zona_id,espacio_id FROM reservas WHERE id=$1', [ra.id]);
      v('propietario y asociaciones por sesión', fila.cliente_id === f.actores.cliente.id && fila.evento_id === a && fila.zona_id === za.id && fila.espacio_id === ra.espacioId);
      v('bloqueo propio activo', await db.redis.get('parqueaderos:bloqueo:' + ra.espacioId) === ra.id);
      for (const [metodo, ruta, cuerpo] of [['GET', '/reservas/' + ra.id], ['POST', '/reservas/' + ra.id + '/pagar', { token: 'tok_ok_seguridad' }]]) {
        await req('reserva ajena con suplantación no accesible ' + metodo, metodo, ruta + '?clienteId=' + f.actores.cliente.id, 'ajeno', cuerpo, 404,
          { conservar: true, codigo: 'RESERVA_NO_ENCONTRADA', cabeceras: { 'X-Usuario-Id': f.actores.cliente.id, 'X-Cliente-Id': f.actores.cliente.id } });
        await negar('rol operativo no accede reserva ' + metodo, metodo, ruta, 'personal', cuerpo);
      }
      const propias = await ok('listado propio con query falsificada', 'GET', '/reservas?clienteId=' + f.actores.ajeno.id, 'cliente', undefined, 200, '/reservas');
      v('listado propio contiene A y excluye B', propias.some(r => r.id === ra.id) && !propias.some(r => r.id === rb.id));
      await negar('personal no lista reservas cliente', 'GET', '/reservas', 'personal');
      await ok('detalle propietario válido', 'GET', '/reservas/' + ra.id, 'cliente', undefined, 200, '/reservas/:id');
      const pagada = await ok('primer pago propietario', 'POST', '/reservas/' + ra.id + '/pagar', 'cliente', { token: 'tok_ok_seguridad' }, 201, '/reservas/:id/pagar');
      const pagadaB = await ok('primer pago otro propietario', 'POST', '/reservas/' + rb.id + '/pagar', 'ajeno', { token: 'tok_ok_seguridad' }, 201, '/reservas/:id/pagar');
      v('QR y pago emitidos una vez', pagada.estado === 'CONFIRMADA' && /^HXP-[A-Z0-9]{16}$/.test(pagada.codigoQr) && !!pagada.referenciaPago && pagada.codigoQr !== pagadaB.codigoQr);
      await negar('pago ajeno confirmado conserva QR y finanzas', 'POST', '/reservas/' + ra.id + '/pagar', 'ajeno', { token: 'tok_ok_seguridad' }, 404, 'RESERVA_NO_ENCONTRADA');
      await negar('detalle confirmado ajeno no expone QR', 'GET', '/reservas/' + ra.id, 'ajeno', undefined, 404, 'RESERVA_NO_ENCONTRADA');
      const rp = await req('pago propio repetido idempotente', 'POST', '/reservas/' + ra.id + '/pagar', 'cliente', { token: 'tok_ok_seguridad' }, 201, { conservar: true });
      v('pago repetido conserva referencia', rp.referenciaPago === pagada.referenciaPago);
      const finanzas = await db.ds.query("SELECT * FROM finanzas_pagos.transacciones_pago WHERE clave_idempotencia LIKE $1", ['parqueadero-' + ra.id + '-%']);
      v('único cobro de reserva', finanzas.length === 1 && finanzas[0].resultado === 'APROBADO');
      // Lecturas operativas globales, siempre limitadas al evento solicitado.
      const lecturas = [['/zonas', 'personal'], ['/espacios', 'personal'], ['/asignaciones', 'organizador'], ['/vehiculos', 'personal'], ['/cache', 'personal'], ['/recomendacion', 'personal'], ['/ocupacion', 'organizador'], ['/reservas', 'organizador']];
      for (const [ruta, actor] of lecturas) {
        await negar('cliente denegado ' + ruta, 'GET', E(a) + ruta, 'cliente');
        const lectura = await ok('lectura operativa ' + ruta, 'GET', E(a) + ruta, actor, undefined, 200, '/eventos/:eventoId' + ruta);
        v('lectura ' + ruta + ' sin QR ni reserva/zonas de B', !JSON.stringify(lectura).includes(pagada.codigoQr) && !JSON.stringify(lectura).includes(pagadaB.codigoQr) && !JSON.stringify(lectura).includes(zb.id) && !JSON.stringify(lectura).includes(rb.id));
        if (ruta === '/cache') v('caché contiene hash QR propio', lectura.reservas.some(r => r.hashQr === createHash('sha256').update(pagada.codigoQr).digest('hex')));
      }
      for (const actor of ['cliente', 'personal', 'organizador', 'admin']) {
        const disp = await ok('disponibilidad compartida ' + actor, 'GET', E(a) + '/disponibilidad', actor, undefined, 200, '/eventos/:eventoId/disponibilidad');
        v('disponibilidad tiene zona propia ' + actor, disp.zonas.some(z => z.id === za.id) && !disp.zonas.some(z => z.id === zb.id));
      }
      await negar('disponibilidad exige sesión', 'GET', E(a) + '/disponibilidad', 'sin', undefined, 401);
      // QR existente de B no ingresa ni sale en A; controles antes de su primer uso.
      for (const ruta of ['/ingresos', '/salidas']) {
        await negar('cliente no opera ' + ruta, 'POST', E(b) + ruta, 'cliente', { codigoQr: pagadaB.codigoQr });
        await negar('QR B no se asocia a A ' + ruta, 'POST', E(a) + ruta, 'personal', { codigoQr: pagadaB.codigoQr }, 422, 'QR_INVALIDO');
      }
      await negar('QR propio con placa distinta', 'POST', E(a) + '/ingresos', 'personal', { codigoQr: pagada.codigoQr, placa: rb.placa }, 409, 'PLACA_NO_COINCIDE');
      const ingreso = await req('ingreso QR A por sesión personal', 'POST', E(a) + '/ingresos', 'personal', { codigoQr: pagada.codigoQr }, 201, { cabeceras: falsos, operacion: '/eventos/:eventoId/ingresos' });
      v('QR resuelve reserva/espacio/evento correctos', ingreso.estancia.eventoId === a && ingreso.estancia.reservaId === ra.id && ingreso.estancia.espacioId === ra.espacioId && ingreso.estancia.prepagada);
      await ok('ingreso QR B por otro personal global', 'POST', E(b) + '/ingresos', 'otroPersonal', { codigoQr: pagadaB.codigoQr }, 201, '/eventos/:eventoId/ingresos');
      const libroAntesSalidas = await db.ds.query('SELECT * FROM finanzas_pagos.transacciones_pago ORDER BY clave_idempotencia');
      const cierre = await ok('salida prepagada QR', 'POST', E(a) + '/salidas', 'otroPersonal', { codigoQr: pagada.codigoQr }, 201, '/eventos/:eventoId/salidas');
      v('salida conserva liquidación prepagada', cierre.cobro.prepagada && cierre.cobro.monto === null);
      await negar('zona B no admite ingreso bajo A', 'POST', E(a) + '/ingresos', 'personal', { placa: placa(), zonaId: zb.id }, 404, 'ZONA_NO_ENCONTRADA');
      await negar('código de espacio B no pertenece a zona A', 'POST', E(a) + '/ingresos', 'personal', { placa: placa(), zonaId: za.id, espacio: sb.codigo }, 404, 'ESPACIO_NO_ENCONTRADO');
      const libre = placa();
      await ok('ingreso sin reserva', 'POST', E(a) + '/ingresos', 'personal', { placa: libre, zonaId: za.id }, 201, '/eventos/:eventoId/ingresos');
      await negar('placa en A no cierra estancia en B', 'POST', E(b) + '/salidas', 'personal', { placa: libre }, 404, 'VEHICULO_NO_EN_LOTE');
      const efectivo = await ok('salida sin reserva liquidada', 'POST', E(a) + '/salidas', 'personal', { placa: libre }, 201, '/eventos/:eventoId/salidas');
      v('salida calcula cobro actual sin pasarela', !efectivo.cobro.prepagada && efectivo.cobro.monto === 5000 && efectivo.cobro.horas === 1);
      v('salidas no crean cobros electrónicos', (await db.ds.query("SELECT count(*)::int n FROM finanzas_pagos.transacciones_pago WHERE clave_idempotencia LIKE $1", ['parqueadero-' + ra.id + '-%']))[0].n === 1);
      v('libro financiero íntegro tras salidas', JSON.stringify(await db.ds.query('SELECT * FROM finanzas_pagos.transacciones_pago ORDER BY clave_idempotencia')) === JSON.stringify(libroAntesSalidas));
      const vistos = await ok('vehículos con historial', 'GET', E(a) + '/vehiculos?enLote=false', 'personal', undefined, 200, '/eventos/:eventoId/vehiculos');
      v('vehículos solo de A con cierres', vistos.length >= 2 && vistos.every(e => e.eventoId === a) && vistos.some(e => e.id === ingreso.estancia.id && e.salidaEn));
      // Offline: guard, asociación de IDs, temporalidad e idempotencia por registro.
      const po = placa(), ids = [randomUUID(), randomUUID()];
      const lote = [{ id: ids[1], tipo: 'SALIDA', placa: po, ocurridoEn: hace(1) }, { id: ids[0], tipo: 'INGRESO', placa: po, zonaId: za.id, ocurridoEn: hace(2) }];
      await negar('cliente no aplica lote válido ni consume IDs', 'POST', E(a) + '/sincronizacion', 'cliente', { registros: lote });
      const sync = (caso, e, registros, conservar = false) => req(caso, 'POST', E(e) + '/sincronizacion', 'personal', { registros }, 201, { conservar, operacion: '/eventos/:eventoId/sincronizacion' });
      v('lote rechazado al cliente aplica luego con personal', (await sync('offline cronológico válido', a, lote)).aplicados === 2);
      v('reenvío mismo evento idempotente', (await sync('offline repetido A', a, lote, true)).repetidos === 2);
      const pc = placa();
      await ok('control B para ID de salida', 'POST', E(b) + '/ingresos', 'personal', { placa: pc, zonaId: zb.id }, 201, '/eventos/:eventoId/ingresos');
      const cruce = await sync('offline IDs A no aplican a B', b, lote.map(r => ({ ...r, placa: pc, ...(r.tipo === 'INGRESO' ? { zonaId: zb.id } : {}) })), true);
      v('dos rechazos semánticos sin estancia ajena', cruce.rechazados === 2 && cruce.repetidos === 0 && cruce.resultados.every(r => r.codigo === 'REGISTRO_LOCAL_INCOMPATIBLE' && !r.estanciaId));
      v('IDs originales siguen idempotentes', (await sync('offline A tras rechazo B', a, lote, true)).repetidos === 2);
      v('salida B con clave nueva aplica', (await sync('offline salida propia B', b, [{ id: randomUUID(), tipo: 'SALIDA', placa: pc, ocurridoEn: hace(0) }])).aplicados === 1);
      const mal = { id: randomUUID(), tipo: 'INGRESO', placa: placa(), zonaId: zb.id, ocurridoEn: hace(1) };
      v('offline zona extranjera se rechaza', (await sync('offline zona B bajo A', a, [mal], true)).resultados[0].codigo === 'ZONA_NO_ENCONTRADA');
      v('rechazo no consume ID offline', (await sync('offline mismo ID con zona correcta', a, [{ ...mal, zonaId: za.id }])).aplicados === 1);
      const futuro = { id: randomUUID(), tipo: 'INGRESO', placa: placa(), zonaId: za.id, ocurridoEn: hace(-60) };
      verificar(canal, 'offline conserva límite temporal existente', (await sync('offline hora fuera de rango', a, [futuro], true)).resultados[0].codigo === 'HORA_FUERA_DE_RANGO', 'temporal');
      v('rechazo temporal no consume ID', (await sync('offline ID temporal corregido', a, [{ ...futuro, ocurridoEn: hace(1) }])).aplicados === 1);
      // Redirecciones y contexto de evento.
      const direccion = { zonaOrigenId: za.id, zonaDestinoId: zc.id, motivo: 'Ensayo propio' };
      for (const actor of ['cliente', 'personal']) await negar('redirigir deniega ' + actor, 'POST', E(a) + '/redirecciones', actor, direccion);
      await negar('destino B no se asocia a A', 'POST', E(a) + '/redirecciones', 'organizador', { ...direccion, zonaDestinoId: zb.id }, 404, 'ZONA_NO_ENCONTRADA');
      await negar('origen B no se asocia a A', 'POST', E(a) + '/redirecciones', 'organizador', { ...direccion, zonaOrigenId: zb.id }, 404, 'ZONA_NO_ENCONTRADA');
      const panel = await req('redirige como organizador de sesión', 'POST', E(a) + '/redirecciones', 'organizador', direccion, 201, { cabeceras: falsos, operacion: '/eventos/:eventoId/redirecciones' });
      const rid = panel.redirecciones[0].id;
      v('redirección y recomendación vinculadas', panel.redirecciones[0].realizadoPor === f.actores.organizador.id && panel.recomendacion.zona.id === zc.id);
      for (const actor of ['cliente', 'personal']) await negar('resultado deniega ' + actor, 'PATCH', E(a) + '/redirecciones/' + rid, actor, { resultado: 'Cerrada', terminar: true });
      await negar('redirección A no se actualiza como B', 'PATCH', E(b) + '/redirecciones/' + rid, 'organizador', { resultado: 'Cruce', terminar: true }, 404, 'REDIRECCION_NO_ENCONTRADA');
      await ok('resultado en evento correcto', 'PATCH', E(a) + '/redirecciones/' + rid, 'otroOrganizador', { resultado: 'Terminada', terminar: true }, 200, '/eventos/:eventoId/redirecciones/:redireccionId');
      // SSE: autorización al conectar; recibir eventos, nunca esperar EOF/networkidle.
      await negar('SSE deniega cliente', 'GET', E(a) + '/ocupacion/flujo', 'cliente');
      await negar('SSE deniega personal', 'GET', E(a) + '/ocupacion/flujo', 'personal');
      const sesionFlujo = await p.iniciarSesion('organizador', servidor), abortar = new AbortController();
      const temporizador = setTimeout(() => abortar.abort(), 10000); let lector; let buffer = '';
      try {
        const flujo = await fetch(servidor + P + E(a) + '/ocupacion/flujo', { headers: { Authorization: 'Bearer ' + sesionFlujo.token, Accept: 'text/event-stream' }, signal: abortar.signal });
        v('SSE conexión autorizada', flujo.status === 200 && flujo.headers.get('content-type').includes('text/event-stream'));
        lector = flujo.body.getReader(); const decoder = new TextDecoder();
        async function siguiente() {
          for (;;) {
            const indice = buffer.indexOf('\n\n');
            if (indice >= 0) {
              const frame = buffer.slice(0, indice); buffer = buffer.slice(indice + 2);
              if (!/^event: ocupacion$/m.test(frame)) continue;
              return JSON.parse(frame.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trim()).join('\n'));
            }
            const r = await lector.read(); c.assert(!r.done, 'SSE permanece abierto hasta cancelación explícita'); buffer += decoder.decode(r.value, { stream: true }).replaceAll('\r\n', '\n');
          }
        }
        v('SSE primer evento válido', (await siguiente()).evento.id === a); operaciones.add('GET /eventos/:eventoId/ocupacion/flujo');
        const cierreSesion = await c.peticion('/api/v1/sesiones/actual', { servidor, metodo: 'DELETE', token: sesionFlujo.token }); c.assert.equal(cierreSesion.estado, 200);
        // Observación del contrato vigente: los guards corren al conectar, no en cada emisión.
        const posterior = await siguiente(); verificar(canal, 'SSE abierto sigue emitiendo tras revocación', posterior.evento.id === a, 'observacion-sse');
        const revocado = await c.peticion(P + E(a) + '/ocupacion/flujo', { servidor, token: sesionFlujo.token });
        verificar(canal, 'SSE nueva conexión revocada denegada', revocado.estado === 401, 'observacion-sse');
      } finally {
        clearTimeout(temporizador); abortar.abort(); if (lector) { await lector.cancel().catch(() => {}); lector.releaseLock(); }
      }
      v('SSE recursos cliente cerrados', abortar.signal.aborted);
      const [audit] = await db.ds.query('SELECT ingreso_por,salida_por FROM estancias WHERE id=$1', [ingreso.estancia.id]);
      v('auditoría ingreso/salida usa actores de sesión', audit.ingreso_por === f.actores.personal.id && audit.salida_por === f.actores.otroPersonal.id);
      const [zonaActor] = await db.ds.query('SELECT creada_por FROM zonas_parqueadero WHERE id=$1', [za.id]);
      v('auditoría alta zona usa sesión', zonaActor.creada_por === f.actores.organizador.id);
      const auditReserva = await db.ds.query('SELECT realizado_por,origen FROM asignaciones_espacio WHERE reserva_id=$1 ORDER BY fecha', [ra.id]);
      v('historial conserva reserva ingreso y salida con sus actores', auditReserva.some(x => x.origen === 'RESERVA' && x.realizado_por === f.actores.cliente.id)
        && auditReserva.some(x => x.origen === 'INGRESO' && x.realizado_por === f.actores.personal.id)
        && auditReserva.some(x => x.origen === 'LIBERACION' && x.realizado_por === f.actores.otroPersonal.id));
      const normalizadas = [...operaciones].sort();
      v('25 operaciones con positivo válido', normalizadas.length === 25);
      resultado.canales.push({ canal, eventos, operaciones: normalizadas, conservaciones });
    }
    resultado.estado = 'APROBADO';
  } catch (e) { resultado.estado = 'FALLIDO'; resultado.error = e.message; process.exitCode = 1; }
  finally {
    resultado.fin = new Date().toISOString(); c.guardar(nombre + '.json', resultado); await db.cerrar();
    console.log(JSON.stringify({ nombre, estado: resultado.estado, observaciones: obs.length, aprobadas: obs.filter(x => x.ok).length,
      conservaciones: resultado.canales.map(x => x.conservaciones), operacionesPorCanal: resultado.canales.map(x => x.operaciones.length), error: resultado.error }));
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
