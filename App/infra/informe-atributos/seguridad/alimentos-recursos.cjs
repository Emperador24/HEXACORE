// Autorización HTTP real, serial, sin reintentos. Toda evidencia cruda es privada.
const { randomUUID, createHash } = require('node:crypto');
const c = require('./comun.cjs');
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function main() {
  c.guarda(); const fase = process.argv[2];
  c.assert(/^(control|final-[123])$/.test(fase));
  const nombre = 'alimentos-' + fase;
  c.assert(!c.fs.existsSync(c.path.join(c.privado(), nombre + '-intencion.json')), 'No repetir una medición iniciada');
  const f = c.leer('fixture.json'); c.assert.equal(f.alimentos.estado, 'COMPLETA');
  const inv = await require('./inventario.cjs').inventario();
  const rutas = inv.rutas.filter(r => r.fuente?.startsWith('modulos/alimentos/') && r.clase === 'protegida');
  c.assert.equal(rutas.length, 30, 'Revisar el denominador antes de mutar');
  // La ruta literal cuentas-personal debe preceder a :id, igual que el contrato HTTP.
  const patrones = rutas.map(r => ({ ...r, patron: new RegExp('^' + r.ruta.replace(/:[^/]+/g, '[^/]+') + '$') }))
    .sort((a, b) => (a.ruta.match(/:/g)?.length ?? 0) - (b.ruta.match(/:/g)?.length ?? 0));
  const controles = [], precondiciones = [], recursos = [], capturas = [];
  const inicio = new Date().toISOString(), tokens = {};
  c.guardar(nombre + '-intencion.json', { inicio, fase });
  for (const [a, u] of Object.entries(f.actores)) {
    const r = await c.peticion('/api/v1/sesiones', { metodo: 'POST', cuerpo: { email: u.email, contrasena: f.clave } });
    c.assert.equal(r.estado, 200, 'Login exclusivo ' + a); tokens[a] = r.datos.token;
  }
  const db = await c.conexion(); let canal, servidor, locales = [], clavesIntentadas = [];
  const checkpoint = () => c.guardar(nombre + '-parcial.json', { inicio, controles, precondiciones, recursos });
  function identificar(ruta, metodo) {
    const r = patrones.find(r => r.metodo === metodo && r.patron.test('/api/v1' + ruta.split('?')[0]));
    c.assert(r, 'Operación fuera de Alimentos'); return metodo + ' ' + r.ruta;
  }
  async function pedir(ruta, actor, metodo = 'GET', cuerpo, clave) {
    return c.peticion('/api/v1' + ruta, { servidor, token: tokens[actor], metodo, cuerpo,
      cabeceras: { 'X-Usuario-Id': f.actores.otroPersonal.id, 'X-Usuario-Roles': 'Administrador',
        ...(clave ? { 'Idempotency-Key': clave } : {}) } });
  }
  async function comprobar(etiqueta, ruta, actor, metodo = 'GET', cuerpo, esperado = 200, verificar = () => true, clave, tipo = 'autorizacion') {
    const r = await pedir(ruta, actor, metodo, cuerpo, clave);
    let evidencia = false; try { evidencia = !!verificar(r.datos); } catch {}
    const v = { canal, etiqueta, operacion: identificar(ruta, metodo), actor, tipo, estado: r.estado, esperado,
      ok: r.estado === esperado && evidencia };
    controles.push(v); checkpoint();
    c.assert(v.ok, `${canal}: ${etiqueta}: ${v.operacion}: HTTP ${r.estado}, esperado ${esperado}; evidencia=${evidencia}`);
    return r.datos;
  }
  async function previo(ruta, actor, metodo = 'GET', cuerpo, esperado = 200, clave) {
    const r = await pedir(ruta, actor, metodo, cuerpo, clave);
    precondiciones.push({ canal, operacion: identificar(ruta, metodo), estado: r.estado, esperado }); checkpoint();
    c.assert.equal(r.estado, esperado, 'Precondición: ' + identificar(ruta, metodo)); return r.datos;
  }
  async function filas(tabla, condicion, valores) {
    return db.ds.query(`SELECT to_jsonb(t) AS fila FROM ${tabla} t WHERE ${condicion} ORDER BY to_jsonb(t)::text`, valores);
  }
  // Solo el evento exclusivo y los dos locales de este canal; no lee claves/sesiones Redis.
  async function capturar() {
    const sql = {};
    sql.establecimientos = await filas('alimentos.establecimientos', 'evento_id=$1', [f.evento]);
    for (const tabla of ['personal_establecimiento', 'productos', 'pedidos', 'operaciones_inventario', 'cancelaciones_pedido', 'entregas_pedido']) {
      sql[tabla] = await filas('alimentos.' + tabla, 'establecimiento_id=ANY($1::uuid[])', [locales]);
    }
    const pedidos = sql.pedidos.map(x => x.fila.id);
    for (const tabla of ['detalles_pedido', 'transacciones_pedido', 'reservas_inventario', 'preparaciones_pedido', 'historial_preparacion', 'incidencias_preparacion']) {
      sql[tabla] = await filas('alimentos.' + tabla, 'pedido_id=ANY($1::uuid[])', [pedidos]);
    }
    const financieras = [...sql.transacciones_pedido.map(x => x.fila.id), ...sql.cancelaciones_pedido.map(x => x.fila.reembolso_id), ...clavesIntentadas];
    sql.finanzas = await filas('finanzas_pagos.transacciones_pago', 'clave_idempotencia=ANY($1::text[])', [financieras]);
    const keys = [...locales.flatMap(id => [db.clavesReserva(id, '')[0], db.clavesReserva(id, '')[3]]),
      ...pedidos.map(id => db.clavesReserva('', id)[1]),
      ...[...sql.operaciones_inventario.map(x => x.fila.id), ...clavesIntentadas].map(id => 'pedidos:inv:{inventario}:ajuste:' + id)];
    const redis = {};
    for (const key of [...new Set(keys)].sort()) {
      const d = await db.redis.dumpBuffer(key); redis[key] = d?.toString('base64') ?? null;
    }
    redis.vencimientos = [];
    for (const id of pedidos) redis.vencimientos.push([id, await db.redis.zscore(db.clavesReserva('', '')[2], id)]);
    return { sql, redis };
  }
  async function rechazar(etiqueta, ruta, actor, metodo = 'GET', cuerpo, esperado = 403, clave, tipo = 'autorizacion') {
    if (clave) clavesIntentadas.push(clave);
    const antes = await capturar();
    const referencia = capturas.length;
    capturas.push({ canal, etiqueta, antes, despues: null }); c.guardar(nombre + '-capturas.json', capturas);
    let fallo;
    try { await comprobar(etiqueta, ruta, actor, metodo, cuerpo, esperado, () => true, clave, tipo); }
    catch (e) { fallo = e; }
    const despues = await capturar();
    capturas[referencia].despues = despues; c.guardar(nombre + '-capturas.json', capturas);
    const v = controles.at(-1); v.sinCambiosSQL = hash(antes.sql) === hash(despues.sql);
    v.sinCambiosRedis = hash(antes.redis) === hash(despues.redis); v.captura = referencia;
    v.ok &&= v.sinCambiosSQL && v.sinCambiosRedis; checkpoint();
    if (fallo) throw fallo;
    c.assert(v.ok, 'El rechazo cambió SQL/Redis: ' + etiqueta);
  }
  const localDto = nombre => ({ eventoId: f.evento, nombre, contacto: 'Ensayo exclusivo', puntoEntrega: nombre,
    horaApertura: '00:00', horaCierre: '00:00', zonaHoraria: 'America/Bogota', estado: 'DISPONIBLE' });
  const productoDto = nombre => ({ nombre, descripcion: 'Snapshot exclusivo', precio: '1000.25', restriccionesAlimentarias: [], activo: true });
  const loc = id => '/pedidos/establecimientos/' + id;
  const admin = id => '/pedidos/admin/establecimientos' + (id ? '/' + id : '');
  async function comprar(local, producto, actor, pagar = true) {
    const dto = { eventoId: f.evento, establecimientoId: local, metodoEntrega: 'RECOGER', productos: [{ productoId: producto, cantidad: 1 }] };
    const p = await comprobar('checkout-identidad-de-sesion', '/pedidos/checkout', actor, 'POST', dto, 201, d => !!d.id);
    recursos.push({ canal, tipo: 'pedido', id: p.id }); checkpoint();
    const [fila] = await db.ds.query('SELECT cliente_id FROM alimentos.pedidos WHERE id=$1', [p.id]);
    c.assert.equal(fila.cliente_id, f.actores[actor].id, 'El comprador sale de la sesión');
    if (!pagar) return p;
    const clave = randomUUID();
    const pago = await comprobar('cobro-propio-inicial', '/pedidos/' + p.id + '/pagos', actor, 'POST', { tokenPago: 'tok_ok_seguridad' }, 200, d => d.compraConfirmada === true, clave);
    c.assert(pago.codigoQr); return { ...p, qr: pago.codigoQr, claveCobro: clave };
  }
  // Captura cerrada y persistida ANTES de la primera cancelación; ningún modo de reconstrucción.
  async function original(pedido) {
    const [p] = await db.ds.query('SELECT to_jsonb(p) AS fila FROM alimentos.pedidos p WHERE id=$1', [pedido]);
    c.assert(p?.fila.estado === 'CONFIRMADO');
    const cobros = await filas('alimentos.transacciones_pedido', 'pedido_id=$1', [pedido]);
    c.assert.equal(cobros.length, 1); c.assert.equal(cobros[0].fila.estado, 'APROBADA');
    const libro = await filas('finanzas_pagos.transacciones_pago', 'clave_idempotencia=$1', [cobros[0].fila.id]);
    c.assert.equal(libro.length, 1); c.assert.equal(libro[0].fila.resultado, 'APROBADO');
    const detalles = await filas('alimentos.detalles_pedido', 'pedido_id=$1', [pedido]); c.assert(detalles.length);
    const { estado, motivo_cancelacion, cancelado_en, actualizado_en, ...inmutables } = p.fila;
    const valor = { inmutables, cobros, libro, detalles };
    return { valor, hash: hash(valor), camposMutables: ['estado', 'motivo_cancelacion', 'cancelado_en', 'actualizado_en'] };
  }
  try {
    for (canal of ['gateway', 'directo']) {
      servidor = canal === 'gateway' ? 'http://127.0.0.1:18100' : 'http://127.0.0.1:13149';
      locales = []; clavesIntentadas = [];
      // Salidas distintas pueden compartir cuentas, pero nunca nombres de negocio.
      const prefijo = `${f.codigo}-${randomUUID().slice(0, 8)}-${fase}-${canal}`;
      // Recursos nuevos en cada canal/pasada. No se acredita una mutación por replay.
      const a = await previo(admin(), 'organizador', 'POST', localDto(prefijo + '-A'), 201); locales.push(a.id);
      const b = await previo(admin(), 'organizadorB', 'POST', localDto(prefijo + '-B'), 201); locales.push(b.id);
      recursos.push({ canal, tipo: 'locales', ids: locales }); checkpoint();
      await previo(admin(a.id) + '/personal/' + f.actores.personal.id, 'organizador', 'PUT');
      await previo(admin(b.id) + '/personal/' + f.actores.otroPersonal.id, 'organizadorB', 'PUT');
      for (const [actor, propio, ajeno] of [['personal', a.id, b.id], ['otroPersonal', b.id, a.id]]) {
        await comprobar('solo-establecimientos-asignados', '/pedidos/mis-establecimientos?usuarioId=' + f.actores.otroPersonal.id, actor, 'GET', undefined, 200, d => d.some(x => x.id === propio) && !d.some(x => x.id === ajeno));
      }
      const registro = { ...productoDto(prefijo + '-producto-A'), cantidadInicial: 1000 }, keyAlta = randomUUID();
      for (const actor of ['otroPersonal', 'cliente', 'organizador', 'admin']) await rechazar('alta-sin-vinculo-o-rol', loc(a.id) + '/productos', actor, 'POST', registro, 403, keyAlta);
      const altaA = await comprobar('alta-propia-inicial', loc(a.id) + '/productos', 'personal', 'POST', registro, 201, d => d.producto?.id && d.operacion.estado === 'APLICADA', keyAlta);
      const altaB = await previo(loc(b.id) + '/productos', 'otroPersonal', 'POST', { ...productoDto(prefijo + '-producto-B'), cantidadInicial: 1000 }, 201, randomUUID());
      const pa = altaA.producto.id, pb = altaB.producto.id;
      await comprobar('producto-B-existe', loc(b.id) + '/menu', 'otroPersonal', 'GET', undefined, 200, d => d.some(x => x.id === pb));
      for (const [metodo, cuerpo] of [['PUT', productoDto(prefijo + '-editado')], ['PATCH', { activo: false }]]) {
        const ruta = loc(a.id) + '/productos/' + pa;
        await rechazar('producto-ajeno-vinculo', ruta, 'otroPersonal', metodo, cuerpo);
        await rechazar('producto-cruzado-local-propio', loc(a.id) + '/productos/' + pb, 'personal', metodo, cuerpo, 404);
        await comprobar('producto-propio-cambia', ruta, 'personal', metodo, cuerpo, 200, d => d.id === pa && (metodo === 'PATCH' ? d.activo === false : d.nombre === cuerpo.nombre));
      }
      await previo(loc(a.id) + '/productos/' + pa, 'personal', 'PATCH', { activo: true });
      const ajuste = { delta: 2, motivo: 'Autorización de inventario' }, keyAjuste = randomUUID();
      await rechazar('ajuste-ajeno', loc(a.id) + '/productos/' + pa + '/ajustes', 'otroPersonal', 'POST', ajuste, 403, keyAjuste);
      await rechazar('ajuste-producto-cruzado', loc(a.id) + '/productos/' + pb + '/ajustes', 'personal', 'POST', ajuste, 404, keyAjuste);
      const op = await comprobar('ajuste-propio-inicial', loc(a.id) + '/productos/' + pa + '/ajustes', 'personal', 'POST', ajuste, 200, d => d.estado === 'APLICADA' && d.productoId === pa, keyAjuste);
      for (const sufijo of ['/operaciones/' + op.id, '/ajustes', '/menu']) {
        await comprobar('lectura-inventario-propia', loc(a.id) + sufijo, 'personal');
        await rechazar('lectura-inventario-ajena', loc(a.id) + sufijo, 'otroPersonal');
      }
      await rechazar('operacion-cruzada', loc(b.id) + '/operaciones/' + op.id, 'otroPersonal', 'GET', undefined, 404);
      // Catálogos compartidos: ambos clientes pueden consultar ambos locales.
      for (const actor of ['cliente', 'ajeno']) {
        await comprobar('catalogo-evento-compartido', '/pedidos/eventos/' + f.evento + '/establecimientos', actor, 'GET', undefined, 200, d => d.some(x => x.id === a.id) && d.some(x => x.id === b.id));
        for (const [local, producto] of [[a.id, pa], [b.id, pb]]) await comprobar('catalogo-local-compartido', loc(local) + '/productos', actor, 'GET', undefined, 200, d => d.some(x => x.id === producto));
      }
      const checkout = { eventoId: f.evento, establecimientoId: a.id, metodoEntrega: 'RECOGER', productos: [{ productoId: pa, cantidad: 1 }] };
      await rechazar('checkout-rol-no-cliente', '/pedidos/checkout', 'personal', 'POST', checkout);
      await rechazar('checkout-producto-de-otro-local', '/pedidos/checkout', 'cliente', 'POST', { ...checkout, productos: [{ productoId: pb, cantidad: 1 }] }, 422);
      // Validación separada: un 400 nunca suma autorización de recurso.
      await rechazar('checkout-no-acepta-comprador-en-body', '/pedidos/checkout', 'cliente', 'POST', { ...checkout, clienteId: f.actores.ajeno.id }, 400, undefined, 'validacion');
      const pendiente = await comprar(a.id, pa, 'cliente', false), clavePago = randomUUID();
      await previo('/pedidos/mis-pedidos/' + pendiente.id, 'cliente');
      await rechazar('pago-ajeno-antes-del-primer-cobro', '/pedidos/' + pendiente.id + '/pagos', 'ajeno', 'POST', { tokenPago: 'tok_ok_seguridad' }, 404, clavePago);
      await comprobar('pago-propio-inicial-tras-rechazo', '/pedidos/' + pendiente.id + '/pagos', 'cliente', 'POST', { tokenPago: 'tok_ok_seguridad' }, 200, d => d.compraConfirmada === true, clavePago);
      const pA = await comprar(a.id, pa, 'cliente'), pB = await comprar(b.id, pb, 'ajeno');
      for (const [actor, propio, ajeno] of [['cliente', pA.id, pB.id], ['ajeno', pB.id, pA.id]]) {
        await comprobar('lista-solo-compras-propias', '/pedidos/mis-pedidos?clienteId=' + f.actores.ajeno.id, actor, 'GET', undefined, 200, d => d.some(x => x.id === propio) && !d.some(x => x.id === ajeno));
        await comprobar('detalle-pedido-propio', '/pedidos/mis-pedidos/' + propio, actor, 'GET', undefined, 200, d => d.id === propio);
        await rechazar('detalle-pedido-existente-ajeno', '/pedidos/mis-pedidos/' + ajeno, actor, 'GET', undefined, 404);
      }
      for (const [local, pedido, actor, otro] of [[a.id, pA.id, 'personal', 'otroPersonal'], [b.id, pB.id, 'otroPersonal', 'personal']]) {
        for (const sufijo of ['/pedidos', '/pedidos/' + pedido]) {
          await comprobar('recepcion-propia', loc(local) + sufijo, actor);
          await rechazar('recepcion-ajena', loc(local) + sufijo, otro);
        }
      }
      await rechazar('detalle-pedido-cruzado', loc(a.id) + '/pedidos/' + pB.id, 'personal', 'GET', undefined, 404);
      const prep = { accion: 'INICIAR', minutos: 10, version: 0 }, keyPrep = randomUUID();
      await rechazar('preparacion-ajena-inicial', loc(a.id) + '/pedidos/' + pA.id + '/preparacion', 'otroPersonal', 'POST', prep, 403, keyPrep);
      await rechazar('preparacion-pedido-cruzado', loc(a.id) + '/pedidos/' + pB.id + '/preparacion', 'personal', 'POST', prep, 404, keyPrep);
      await comprobar('preparacion-propia-inicial', loc(a.id) + '/pedidos/' + pA.id + '/preparacion', 'personal', 'POST', prep, 200, d => d.preparacion.estado === 'EN_PREPARACION', keyPrep);
      const rutaPrepA = loc(a.id) + '/pedidos/' + pA.id + '/preparacion', rutaPrepB = loc(b.id) + '/pedidos/' + pB.id + '/preparacion';
      await previo(rutaPrepB, 'otroPersonal', 'POST', prep, 200, randomUUID());
      const incidenciaB = randomUUID(), incidenciaA = randomUUID();
      await previo(rutaPrepB, 'otroPersonal', 'POST', { accion: 'INCIDENCIA', version: 1, productoId: pb, motivo: 'Incidencia exclusiva B' }, 200, incidenciaB);
      await comprobar('incidencia-B-existe', loc(b.id) + '/pedidos/' + pB.id, 'otroPersonal', 'GET', undefined, 200, d => d.incidencias.some(x => x.id === incidenciaB));
      await rechazar('incidencia-producto-cruzado', rutaPrepA, 'personal', 'POST', { accion: 'INCIDENCIA', version: 1, productoId: pb, motivo: 'Producto ajeno al pedido' }, 400, incidenciaA, 'relacion');
      await comprobar('incidencia-producto-propio', rutaPrepA, 'personal', 'POST', { accion: 'INCIDENCIA', version: 1, productoId: pa, motivo: 'Incidencia exclusiva A' }, 200, d => d.preparacion.incidenciasAbiertas === 1, incidenciaA);
      const resolver = { accion: 'RESOLVER_INCIDENCIA', version: 2, motivo: 'Resolución del ensayo', incidenciaId: incidenciaB }, keyResolver = randomUUID();
      await rechazar('resolver-incidencia-existente-ajena', rutaPrepA, 'personal', 'POST', resolver, 409, keyResolver);
      await comprobar('resolver-incidencia-propia', rutaPrepA, 'personal', 'POST', { ...resolver, incidenciaId: incidenciaA }, 200, d => d.preparacion.incidenciasAbiertas === 0, keyResolver);
      await previo(rutaPrepB, 'otroPersonal', 'POST', resolver, 200, randomUUID());
      for (const [ruta, actor] of [[rutaPrepA, 'personal'], [rutaPrepB, 'otroPersonal']]) await previo(ruta, actor, 'POST', { accion: 'LISTO', version: 3 }, 200, randomUUID());
      const [historial] = await db.ds.query('SELECT actor_id FROM alimentos.historial_preparacion WHERE id=$1', [keyPrep]);
      c.assert.equal(historial.actor_id, f.actores.personal.id);
      const entregaA = await comprobar('qr-propio-listo', loc(a.id) + '/entregas/prevalidar', 'personal', 'POST', { codigoQr: pA.qr }, 200, d => d.pedidoId === pA.id);
      const entregaB = await previo(loc(b.id) + '/entregas/prevalidar', 'otroPersonal', 'POST', { codigoQr: pB.qr });
      await rechazar('prevalidacion-personal-ajeno', loc(a.id) + '/entregas/prevalidar', 'otroPersonal', 'POST', { codigoQr: pA.qr });
      await rechazar('prevalidacion-qr-cruzado', loc(a.id) + '/entregas/prevalidar', 'personal', 'POST', { codigoQr: pB.qr }, 404);
      const entregar = { pedidoId: pA.id, version: entregaA.version, puntoRevision: entregaA.puntoRevision, codigoQr: pA.qr }, keyEntrega = randomUUID();
      await rechazar('entrega-ajena-antes-de-entregar', loc(a.id) + '/entregas/confirmar', 'otroPersonal', 'POST', entregar, 403, keyEntrega);
      await rechazar('entrega-pedido-y-qr-cruzados', loc(a.id) + '/entregas/confirmar', 'personal', 'POST', { pedidoId: pB.id, version: entregaB.version, puntoRevision: entregaB.puntoRevision, codigoQr: pB.qr }, 404, keyEntrega);
      await rechazar('entrega-solo-qr-cruzado', loc(a.id) + '/entregas/confirmar', 'personal', 'POST', { ...entregar, codigoQr: pB.qr }, 404, keyEntrega);
      await comprobar('entrega-propia-inicial', loc(a.id) + '/entregas/confirmar', 'personal', 'POST', entregar, 200, d => d.estadoOperativo === 'ENTREGADO', keyEntrega);
      const entregas = await db.ds.query('SELECT actor_id,operacion_id FROM alimentos.entregas_pedido WHERE pedido_id=$1', [pA.id]);
      c.assert.equal(entregas.length, 1); c.assert.equal(entregas[0].actor_id, f.actores.personal.id); c.assert.equal(entregas[0].operacion_id, keyEntrega);
      // Pedido exclusivo sin preparación para cancelar, diferente del de entrega.
      const cancelable = await comprar(a.id, pa, 'cliente'), rutaCancelacion = loc(a.id) + '/pedidos/' + cancelable.id + '/cancelacion';
      await previo(loc(a.id) + '/pedidos/' + cancelable.id, 'personal');
      const cancelar = { version: 0, motivo: 'Ensayo autorización y conservación', confirmar: true }, keyCancelar = randomUUID();
      await rechazar('cancelacion-ajena-inicial', rutaCancelacion, 'otroPersonal', 'POST', cancelar, 403, keyCancelar);
      await rechazar('cancelacion-pedido-cruzado', loc(b.id) + '/pedidos/' + cancelable.id + '/cancelacion', 'otroPersonal', 'POST', cancelar, 404, keyCancelar);
      const antes = await original(cancelable.id);
      const capturaNombre = nombre + '-original-' + canal + '.json'; c.guardar(capturaNombre, { capturadoEn: new Date().toISOString(), pedido: cancelable.id, ...antes });
      c.assert.equal(c.leer(capturaNombre).hash, hash(antes.valor), 'Si falla persistencia, no cancelar');
      await comprobar('cancelacion-propia-inicial', rutaCancelacion, 'personal', 'POST', cancelar, 200, d => d.pedidoId === cancelable.id, keyCancelar);
      // Convergencia de operación asíncrona dentro de 10 s; no reenvía cancelación/cobro.
      let cancelacion; const limite = Date.now() + 10000;
      do {
        cancelacion = await previo(rutaCancelacion, 'personal');
        if (cancelacion.reembolso.estado === 'APROBADO' && cancelacion.inventario === 'RESTITUIDO') break;
        await new Promise(r => setTimeout(r, 100));
      } while (Date.now() < limite);
      c.assert.equal(cancelacion.reembolso.estado, 'APROBADO'); c.assert.equal(cancelacion.inventario, 'RESTITUIDO');
      const [p] = await db.ds.query('SELECT to_jsonb(p) AS fila FROM alimentos.pedidos p WHERE id=$1', [cancelable.id]);
      c.assert.equal(p.fila.estado, 'CANCELADO'); c.assert.equal(p.fila.motivo_cancelacion, cancelar.motivo); c.assert(p.fila.cancelado_en);
      const { estado, motivo_cancelacion, cancelado_en, actualizado_en, ...inmutables } = p.fila;
      const despues = { inmutables,
        cobros: await filas('alimentos.transacciones_pedido', 'pedido_id=$1', [cancelable.id]),
        libro: await filas('finanzas_pagos.transacciones_pago', 'clave_idempotencia=$1', [antes.valor.cobros[0].fila.id]),
        detalles: await filas('alimentos.detalles_pedido', 'pedido_id=$1', [cancelable.id]) };
      c.assert.equal(hash(despues), antes.hash, 'Conservar cobro original y snapshots tras primera cancelación');
      const financiero = await db.ds.query('SELECT c.*,t.resultado,t.intentos FROM alimentos.cancelaciones_pedido c JOIN finanzas_pagos.transacciones_pago t ON t.clave_idempotencia=c.reembolso_id::text WHERE c.pedido_id=$1', [cancelable.id]);
      c.assert.equal(financiero.length, 1); c.assert.equal(financiero[0].resultado, 'APROBADO'); c.assert.equal(financiero[0].intentos, 1);
      c.assert.equal(financiero[0].actor_id, f.actores.personal.id);
      c.guardar(nombre + '-conservacion-' + canal + '.json', { hashAntes: antes.hash, hashDespues: hash(despues), camposMutables: antes.camposMutables, cobroYSnapshotsConservados: true, unReembolsoUnIntento: true });
      await comprobar('consulta-cancelacion-propia-existente', rutaCancelacion, 'personal', 'GET', undefined, 200, d => d.pedidoId === cancelable.id);
      await rechazar('consulta-cancelacion-ajena', rutaCancelacion, 'otroPersonal');
      await rechazar('consulta-cancelacion-cruzada', loc(b.id) + '/pedidos/' + cancelable.id + '/cancelacion', 'otroPersonal', 'GET', undefined, 404);
      // Administración GLOBAL: Organizador B puede administrar A y Organizador puede B.
      for (const actor of ['organizador', 'organizadorB', 'admin']) {
        await comprobar('admin-lista-evento-global', admin() + '?eventoId=' + f.evento, actor, 'GET', undefined, 200, d => d.some(x => x.id === a.id) && d.some(x => x.id === b.id));
        await comprobar('admin-cuentas-personal', admin() + '/cuentas-personal?busqueda=' + f.codigo, actor, 'GET', undefined, 200, d => d.some(x => x.id === f.actores.personal.id));
        await comprobar('admin-detalle-global', admin(b.id), actor, 'GET', undefined, 200, d => d.id === b.id);
        await comprobar('admin-personal-global', admin(a.id) + '/personal', actor, 'GET', undefined, 200, d => d.some(x => x.usuarioId === f.actores.personal.id));
      }
      for (const ruta of [admin() + '?eventoId=' + f.evento, admin() + '/cuentas-personal?busqueda=' + f.codigo, admin(a.id), admin(a.id) + '/personal']) {
        for (const actor of ['personal', 'cliente']) await rechazar('administracion-deniega-rol', ruta, actor);
      }
      for (const actor of ['organizador', 'organizadorB', 'admin']) {
        const dto = localDto(prefijo + '-nuevo-' + actor);
        for (const no of ['personal', 'cliente']) await rechazar('crear-local-deniega-rol', admin(), no, 'POST', dto);
        await comprobar('crear-local-global', admin(), actor, 'POST', dto, 201, d => d.nombre === dto.nombre);
        const editar = { ...localDto(prefijo + '-A'), contacto: 'Editado por ' + actor };
        await rechazar('editar-local-deniega-rol', admin(a.id), 'personal', 'PUT', editar);
        await comprobar('editar-local-global', admin(a.id), actor, 'PUT', editar, 200, d => d.contacto === editar.contacto);
        await rechazar('estado-local-deniega-rol', admin(a.id) + '/estado', 'personal', 'PATCH', { estado: 'CERRADO' });
        await comprobar('estado-local-global', admin(a.id) + '/estado', actor, 'PATCH', { estado: 'CERRADO' }, 200, d => d.estado === 'CERRADO');
        await previo(admin(a.id) + '/estado', actor, 'PATCH', { estado: 'DISPONIBLE' });
        const vinculo = admin(a.id) + '/personal/' + f.actores.otroPersonal.id;
        for (const no of ['personal', 'cliente']) await rechazar('asignar-deniega-rol', vinculo, no, 'PUT');
        await comprobar('asignar-global-inicial', vinculo, actor, 'PUT', undefined, 200, d => d.usuarioId === f.actores.otroPersonal.id);
        const [v] = await db.ds.query('SELECT asignado_por FROM alimentos.personal_establecimiento WHERE establecimiento_id=$1 AND usuario_id=$2', [a.id, f.actores.otroPersonal.id]);
        c.assert.equal(v.asignado_por, f.actores[actor].id, 'Auditoría deriva de sesión');
        for (const no of ['personal', 'cliente']) await rechazar('desvincular-deniega-rol-recurso-existente', vinculo, no, 'DELETE');
        await comprobar('desvincular-global-inicial', vinculo, actor, 'DELETE', undefined, 204);
        const [resto] = await db.ds.query('SELECT count(*)::int AS n FROM alimentos.personal_establecimiento WHERE establecimiento_id=$1 AND usuario_id=$2', [a.id, f.actores.otroPersonal.id]); c.assert.equal(resto.n, 0);
      }
      // La revocación es efectiva para el siguiente acceso, conservando el recurso.
      await previo(admin(a.id) + '/personal/' + f.actores.personal.id, 'admin', 'DELETE', undefined, 204);
      await rechazar('personal-desvinculado-no-opera', loc(a.id) + '/menu', 'personal');
      await previo(admin(a.id) + '/personal/' + f.actores.personal.id, 'admin', 'PUT');
      await comprobar('personal-reasignado-accede', loc(a.id) + '/menu', 'personal');
      const cubiertas = new Set(controles.filter(x => x.canal === canal && x.tipo === 'autorizacion' && x.estado < 300).map(x => x.operacion));
      c.assert.equal(cubiertas.size, 30, 'Faltan controles positivos de operaciones');
    }
    const d = { inicio, fin: new Date().toISOString(), fase, denominadorAlimentos: 30, denominadorGlobal: inv.clases.protegida,
      controles, precondiciones, fallidos: controles.filter(x => !x.ok).length };
    c.guardar(nombre + '.json', d);
    console.log(JSON.stringify({ fase, controles: controles.length, autorizacion: controles.filter(x => x.tipo === 'autorizacion').length,
      validacionSeparada: controles.filter(x => x.tipo === 'validacion').length, capturasSinCambios: controles.filter(x => x.sinCambiosSQL && x.sinCambiosRedis).length,
      fallidos: d.fallidos, operacionesPorCanal: 30, duracionMs: Date.parse(d.fin) - Date.parse(inicio) }));
  } finally { await db.cerrar(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
