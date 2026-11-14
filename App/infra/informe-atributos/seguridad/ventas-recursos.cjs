// Compras/Reventa reales en ambos canales. Barrido positivo solo si TODO su ámbito es descartable propio.
const { randomUUID, createHash } = require('node:crypto');
const c = require('./comun.cjs');
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function main() {
  c.guarda(); const fase = process.argv[2]; c.assert(/^(control(?:-[a-z0-9]+)?|final-[123])$/.test(fase));
  const nombre = 'ventas-' + fase; c.assert(!c.fs.existsSync(c.path.join(c.privado(), nombre + '-intencion.json')), 'No sobrescribir un ensayo iniciado');
  const f = c.leer('fixture.json'); c.assert.equal(f.estado, 'COMPLETA');
  const inventario = await require('./inventario.cjs').inventario();
  const rutas = inventario.rutas.filter(r => /^(modulos\/entradas\/ventas\/venta\/compras|modulos\/entradas\/postventa\/postventa\/reventa)\.controller\.ts$/.test(r.fuente)); c.assert.equal(rutas.length, 19);
  const patrones = rutas.map(r => ({ ...r, re: new RegExp('^' + r.ruta.replace(/:[^/]+/g, '[^/]+') + '$') })).sort((a, b) => (a.ruta.match(/:/g)?.length ?? 0) - (b.ruta.match(/:/g)?.length ?? 0));
  const controles = [], precondiciones = [], capturas = [], tokens = {}, recursos = [], ambitos = [];
  const inicio = new Date().toISOString(); c.guardar(nombre + '-intencion.json', { inicio, fase });
  for (const [a, u] of Object.entries(f.actores)) {
    const r = await c.peticion('/api/v1/sesiones', { metodo: 'POST', cuerpo: { email: u.email, contrasena: f.clave } }); c.assert.equal(r.estado, 200); tokens[a] = r.datos.token;
  }
  const db = await c.conexion(); let canal, servidor;
  const checkpoint = () => c.guardar(nombre + '-parcial.json', { inicio, controles, precondiciones, recursos, ambitos });
  function identificar(ruta, metodo) {
    const r = patrones.find(r => r.metodo === metodo && r.re.test('/api/v1' + ruta.split('?')[0])); c.assert(r, 'Ruta fuera del alcance'); return metodo + ' ' + r.ruta;
  }
  async function pedir(ruta, actor, metodo = 'GET', cuerpo) {
    const cabeceras = { 'X-Usuario-Id': f.actores.tercero.id, 'X-Usuario-Roles': 'Administrador' };
    if (ruta === '/compras' && metodo === 'POST' && canal === 'gateway') {
      const turno = await c.peticion('/api/v1/cola/eventos/' + f.evento + '/turnos', { token: tokens[actor], metodo: 'POST', cuerpo: {} });
      c.assert.equal(turno.estado, 201, 'Turno real requerido por gateway'); c.assert(turno.datos.token); cabeceras['X-Turno-Cola'] = turno.datos.token;
      precondiciones.push({ canal, contrato: 'turno-real', estado: turno.estado });
    }
    return c.peticion('/api/v1' + ruta, { servidor, token: tokens[actor], metodo, cuerpo, cabeceras });
  }
  async function caso(etiqueta, ruta, actor, metodo = 'GET', cuerpo, esperado = 200, verificar = () => true, tipo = 'autorizacion') {
    let r, error;
    try { r = await pedir(ruta, actor, metodo, cuerpo); } catch (e) { error = e; r = { estado: 0, datos: null }; }
    let evidencia = false; try { evidencia = !!verificar(r.datos); } catch {}
    const v = { canal, etiqueta, operacion: identificar(ruta, metodo), actor, tipo, estado: r.estado, esperado, ok: r.estado === esperado && evidencia };
    controles.push(v); checkpoint(); c.assert(v.ok, `${canal}: ${etiqueta}: HTTP ${r.estado}, esperado ${esperado}; evidencia=${evidencia}${error ? '; error transporte' : ''}`); return r.datos;
  }
  async function previo(ruta, actor, metodo = 'GET', cuerpo, esperado = 200) {
    const r = await pedir(ruta, actor, metodo, cuerpo); precondiciones.push({ canal, operacion: identificar(ruta, metodo), estado: r.estado, esperado }); checkpoint(); c.assert.equal(r.estado, esperado, 'Precondición ' + identificar(ruta, metodo)); return r.datos;
  }
  async function filas(tabla, condicion, args) { return db.ds.query(`SELECT to_jsonb(t) AS fila FROM ${tabla} t WHERE ${condicion} ORDER BY to_jsonb(t)::text`, args); }
  async function ambitoDescartable() {
    const actores = Object.values(f.actores).map(a => a.id);
    const [r] = await db.ds.query(`SELECT count(*)::int AS total,count(*) FILTER (WHERE
      p.evento_id<>$1 OR NOT(p.vendedor_id=ANY($2::uuid[])) OR e.id IS NULL OR e.evento_id<>$1
      OR NOT(e.propietario_id=ANY($2::uuid[])))::int AS ajenas
      FROM entradas_postventa.publicaciones_reventa p LEFT JOIN entradas_ventas.entradas e ON e.id=p.entrada_id`, [f.evento, actores]);
    const [t] = await db.ds.query(`SELECT count(*) FILTER (WHERE p.id IS NULL OR p.evento_id<>$1
      OR NOT(t.comprador_id=ANY($2::uuid[])) OR NOT(t.vendedor_id=ANY($2::uuid[])))::int AS ajenas
      FROM entradas_postventa.transacciones_reventa t LEFT JOIN entradas_postventa.publicaciones_reventa p ON p.id=t.publicacion_id`, [f.evento, actores]);
    return { totalPublicaciones: r.total, publicacionesAjenas: r.ajenas, transaccionesAjenas: t.ajenas, descartable: r.ajenas === 0 && t.ajenas === 0 };
  }
  async function capturar(global = false) {
    const sql = {};
    for (const t of ['compras', 'localidades_evento', 'entradas', 'codigos_promocionales']) sql[t] = await filas('entradas_ventas.' + t, 'evento_id=$1', [f.evento]);
    const compras = sql.compras.map(x => x.fila.id), entradas = sql.entradas.map(x => x.fila.id);
    for (const t of ['usos_promocion', 'cancelaciones']) sql[t] = await filas('entradas_ventas.' + t, 'compra_id=ANY($1::uuid[])', [compras]);
    sql.historial = await filas('entradas_ventas.historial_propietarios', 'entrada_id=ANY($1::uuid[])', [entradas]);
    sql.publicaciones = await filas('entradas_postventa.publicaciones_reventa', 'evento_id=$1', [f.evento]);
    const publicaciones = sql.publicaciones.map(x => x.fila.id);
    sql.checkouts = await filas('entradas_postventa.transacciones_reventa', 'publicacion_id=ANY($1::uuid[])', [publicaciones]);
    const claves = [...sql.cancelaciones.map(x => x.fila.id), ...sql.checkouts.map(x => x.fila.id)];
    sql.finanzas = await filas('finanzas_pagos.transacciones_pago', 'clave_idempotencia=ANY($1::text[]) OR clave_idempotencia LIKE ANY($2::text[])', [claves, compras.map(id => id + ':%')]);
    if (global) sql.huellaPublicacionesGlobal = await db.ds.query("SELECT count(*)::int AS n,md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY id),'')) AS huella FROM entradas_postventa.publicaciones_reventa p");
    const redis = {};
    for (const id of publicaciones.sort()) {
      const k = 'reventa:bloqueo:publicacion:' + id;
      redis[k] = { valor: await db.redis.get(k), venceEn: await db.redis.call('PEXPIRETIME', k) };
    }
    return { sql, redis };
  }
  async function rechazar(etiqueta, ruta, actor, metodo, cuerpo, estado, codigo, tipo = 'autorizacion', global = false) {
    const antes = await capturar(global), indice = capturas.length;
    capturas.push({ canal, etiqueta, antes, despues: null }); c.guardar(nombre + '-capturas.json', capturas);
    let fallo;
    try { await caso(etiqueta, ruta, actor, metodo, cuerpo, estado, d => !codigo || d.codigo === codigo, tipo); } catch (e) { fallo = e; }
    const despues = await capturar(global); capturas[indice].despues = despues; c.guardar(nombre + '-capturas.json', capturas);
    const v = controles.at(-1); v.sinCambiosSQL = hash(antes.sql) === hash(despues.sql); v.sinCambiosRedis = hash(antes.redis) === hash(despues.redis); v.ok &&= v.sinCambiosSQL && v.sinCambiosRedis;
    // Acredita que el intento ajeno tampoco dejó bloqueos SQL sobre los recursos propios.
    await db.ds.transaction(async m => {
      await m.query('SELECT id FROM entradas_ventas.compras WHERE evento_id=$1 FOR UPDATE NOWAIT', [f.evento]);
      await m.query('SELECT id FROM entradas_postventa.publicaciones_reventa WHERE evento_id=$1 FOR UPDATE NOWAIT', [f.evento]);
    }); v.bloqueosSQLDisponibles = true; checkpoint();
    if (fallo) throw fallo; c.assert(v.ok, 'El rechazo cambió estado SQL/Redis: ' + etiqueta);
  }
  const pago = { metodoPago: 'TARJETA', token: 'tok_ok_seguridad' };
  const compra = id => '/compras/' + id, pub = id => '/reventa/publicaciones/' + id, check = id => '/reventa/checkout/' + id;
  const sinQR = d => !/"(?:codigoQr|codigo_qr|codigoQrNuevo)"/.test(JSON.stringify(d));
  async function comprar(actor, cantidad = 1) {
    const p = await caso('compra-creada-por-sesion', '/compras', actor, 'POST', { localidadId: f.localidad, cantidad }, 201, d => d.cantidad === cantidad && d.estado === 'PENDIENTE');
    const [r] = await db.ds.query('SELECT comprador_id FROM entradas_ventas.compras WHERE id=$1', [p.id]); c.assert.equal(r.comprador_id, f.actores[actor].id);
    recursos.push({ canal, compra: p.id }); checkpoint(); return p;
  }
  async function pagar(p, actor) {
    return caso('pago-propio-inicial', compra(p.id) + '/pagar', actor, 'POST', pago, 200, d => d.estado === 'PAGADA' && d.entradas.length === p.cantidad && d.entradas.every(e => !!e.codigoQr));
  }
  async function publicar(entrada, actor) {
    const p = await caso('publicar-entrada-propia-elegible', '/reventa/publicaciones', actor, 'POST', { entradaId: entrada.id, precio: 900 }, 201, d => d.vendedorId === f.actores[actor].id && d.estado === 'ACTIVA');
    const [r] = await db.ds.query('SELECT vendedor_id FROM entradas_postventa.publicaciones_reventa WHERE id=$1', [p.id]); c.assert.equal(r.vendedor_id, f.actores[actor].id); return p;
  }
  async function abrir(p, actor) {
    const r = await caso('checkout-comprador-de-sesion', pub(p.id) + '/checkout', actor, 'POST', { compradorId: f.actores.tercero.id, vendedorId: f.actores.tercero.id }, 201, d => d.estado === 'PENDIENTE' && d.publicacion.id === p.id);
    const [t] = await db.ds.query('SELECT comprador_id,vendedor_id FROM entradas_postventa.transacciones_reventa WHERE id=$1', [r.id]); c.assert.equal(t.comprador_id, f.actores[actor].id); c.assert.equal(t.vendedor_id, p.vendedorId); return r;
  }
  try {
    for (canal of ['gateway', 'directo']) {
      servidor = canal === 'gateway' ? 'http://127.0.0.1:18100' : 'http://127.0.0.1:13147';
      const codigo = 'SV' + randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
      await db.ds.query("INSERT INTO entradas_ventas.codigos_promocionales(codigo,descripcion,porcentaje,limite_usos,usos,activo,vigente_desde,vigente_hasta,evento_id) VALUES($1,'Ensayo exclusivo',10,5,0,true,now()-interval '1 day',now()+interval '40 days',$2)", [codigo, f.evento]);
      await rechazar('identidad-extra-en-compra', '/compras', 'cliente', 'POST', { localidadId: f.localidad, cantidad: 1, compradorId: f.actores.ajeno.id }, 400, undefined, 'validacion');
      const cupon = await comprar('cliente'); await previo(compra(cupon.id), 'cliente');
      await rechazar('cupon-sobre-compra-ajena', compra(cupon.id) + '/cupon', 'ajeno', 'PUT', { codigo }, 404, 'COMPRA_NO_ENCONTRADA');
      await caso('aplicar-cupon-propio-inicial', compra(cupon.id) + '/cupon', 'cliente', 'PUT', { codigo }, 200, d => d.codigoPromocional === codigo && d.total === 900);
      await rechazar('retirar-cupon-ajeno-existente', compra(cupon.id) + '/cupon', 'ajeno', 'DELETE', undefined, 404, 'COMPRA_NO_ENCONTRADA');
      await caso('retirar-cupon-propio-inicial', compra(cupon.id) + '/cupon', 'cliente', 'DELETE', undefined, 200, d => d.codigoPromocional === null && d.total === 1000);
      await rechazar('pago-ajeno-antes-del-primer-cobro', compra(cupon.id) + '/pagar', 'ajeno', 'POST', pago, 404, 'COMPRA_NO_ENCONTRADA');
      const otraPropia = await pagar(cupon, 'cliente');
      const a = await pagar(await comprar('cliente', 4), 'cliente'), b = await pagar(await comprar('ajeno'), 'ajeno');
      for (const [actor, propio, ajeno] of [['cliente', a.id, b.id], ['ajeno', b.id, a.id]]) {
        await caso('listado-filtrado-por-sesion', '/compras', actor, 'GET', undefined, 200, d => d.some(x => x.id === propio) && !d.some(x => x.id === ajeno) && d.every(x => x.entradas.length === 0));
        await caso('detalle-propio-con-qr', compra(propio), actor, 'GET', undefined, 200, d => d.id === propio && d.entradas.every(e => !!e.codigoQr));
        await rechazar('detalle-compra-existente-ajena', compra(ajeno), actor, 'GET', undefined, 404, 'COMPRA_NO_ENCONTRADA');
      }
      const cotizar = compra(a.id) + '/cancelacion/cotizacion', cancelar = compra(a.id) + '/cancelaciones';
      const q = await caso('cotizacion-propia-elegible', cotizar, 'cliente', 'POST', { entradaIds: [a.entradas[0].id] }, 200, d => d.montoReembolso === 1000);
      for (const [ruta, body] of [[cotizar, { entradaIds: [a.entradas[0].id] }], [cancelar, { entradaIds: [a.entradas[0].id], montoAceptado: q.montoReembolso, motivo: 'Ensayo exclusivo' }]]) await rechazar('cancelacion-compra-ajena', ruta, 'ajeno', 'POST', body, 404, 'COMPRA_NO_ENCONTRADA');
      for (const entrada of [otraPropia.entradas[0], b.entradas[0]]) {
        await rechazar('cotizar-entrada-existente-de-otra-compra', cotizar, 'cliente', 'POST', { entradaIds: [entrada.id] }, 409, 'CU-003D');
        await rechazar('cancelar-entrada-existente-de-otra-compra', cancelar, 'cliente', 'POST', { entradaIds: [entrada.id], montoAceptado: 1000, motivo: 'Ensayo de relación' }, 409, 'CU-003D');
      }
      await caso('cancelacion-propia-inicial', cancelar, 'cliente', 'POST', { entradaIds: [a.entradas[0].id], montoAceptado: q.montoReembolso, motivo: 'Ensayo exclusivo' }, 200, d => d.estado === 'APROBADA' && d.entradasCancelables[0] === a.entradas[0].id);
      const mixto = { entradaIds: [a.entradas[3].id, b.entradas[0].id] };
      await caso('cotizacion-mixta-solo-propias', cotizar, 'cliente', 'POST', mixto, 200, d => d.entradasCancelables.length === 1 && d.entradasCancelables[0] === a.entradas[3].id && d.entradasRechazadas[0].entradaId === b.entradas[0].id && d.montoReembolso === 1000);
      const ajenaAntes = await filas('entradas_ventas.entradas', 'id=$1', [b.entradas[0].id]);
      await caso('cancelacion-mixta-no-afecta-ajena', cancelar, 'cliente', 'POST', { ...mixto, montoAceptado: 1000, motivo: 'Ensayo de cancelación parcial' }, 200, d => d.estado === 'APROBADA' && d.entradasCancelables.length === 1);
      c.assert.equal(hash(ajenaAntes), hash(await filas('entradas_ventas.entradas', 'id=$1', [b.entradas[0].id])));
      // Publicar requiere propietario vigente y elegibilidad; un DTO inválido se registra aparte.
      await previo('/reventa/mis-entradas', 'cliente');
      await rechazar('publicar-entrada-existente-ajena', '/reventa/publicaciones', 'ajeno', 'POST', { entradaId: a.entradas[1].id, precio: 900 }, 403, 'NO_ES_PROPIETARIO');
      await rechazar('publicar-no-acepta-vendedor-extra', '/reventa/publicaciones', 'cliente', 'POST', { entradaId: a.entradas[1].id, precio: 900, vendedorId: f.actores.ajeno.id }, 400, undefined, 'validacion');
      await rechazar('entrada-anulada-no-elegible', '/reventa/publicaciones', 'cliente', 'POST', { entradaId: a.entradas[0].id, precio: 900 }, 409, 'CU-006E', 'estado');
      const p = await publicar(a.entradas[1], 'cliente');
      for (const actor of ['cliente', 'ajeno', 'tercero']) {
        await caso('detalle-publicacion-compartido-sin-qr', pub(p.id), actor, 'GET', undefined, 200, d => d.id === p.id && d.esPropia === (actor === 'cliente') && sinQR(d));
        await caso('mercado-compartido-omite-propias', '/reventa/publicaciones?eventoId=' + f.evento, actor, 'GET', undefined, 200, d => d.publicaciones.some(x => x.id === p.id) === (actor !== 'cliente') && sinQR(d));
      }
      await rechazar('precio-ajeno-en-publicacion-activa', pub(p.id), 'ajeno', 'PATCH', { precio: 800 }, 403, 'NO_ES_PROPIETARIO');
      await caso('precio-propio-inicial', pub(p.id), 'cliente', 'PATCH', { precio: 800 }, 200, d => d.precio === 800);
      await rechazar('retirar-publicacion-ajena-sin-checkout', pub(p.id), 'ajeno', 'DELETE', undefined, 403, 'NO_ES_PROPIETARIO');
      await caso('retirar-publicacion-propia-inicial', pub(p.id), 'cliente', 'DELETE', undefined, 200, d => d.estado === 'RETIRADA');
      const pc = await publicar(a.entradas[1], 'cliente');
      await rechazar('vendedor-no-abre-su-checkout', pub(pc.id) + '/checkout', 'cliente', 'POST', {}, 409, 'VENDEDOR_ES_COMPRADOR');
      const cc = await abrir(pc, 'ajeno');
      await caso('checkout-propio-existente', check(cc.id), 'ajeno', 'GET', undefined, 200, d => d.id === cc.id && d.estado === 'PENDIENTE');
      for (const actor of ['cliente', 'tercero']) {
        await rechazar('leer-checkout-ajeno', check(cc.id), actor, 'GET', undefined, 404, 'CHECKOUT_NO_ENCONTRADO');
        await rechazar('cancelar-checkout-ajeno-inicial', check(cc.id), actor, 'DELETE', undefined, 404, 'CHECKOUT_NO_ENCONTRADO');
      }
      await rechazar('otro-comprador-no-consume-bloqueo', pub(pc.id) + '/checkout', 'tercero', 'POST', {}, 409, 'CU-006H', 'concurrencia');
      await caso('propietario-recupera-mismo-checkout', pub(pc.id) + '/checkout', 'ajeno', 'POST', {}, 201, d => d.id === cc.id);
      await caso('cancelar-checkout-propio-inicial', check(cc.id), 'ajeno', 'DELETE', undefined, 200, d => d.estado === 'CANCELADA');
      c.assert.equal(await db.redis.exists('reventa:bloqueo:publicacion:' + pc.id), 0);
      const pt = await publicar(a.entradas[2], 'cliente'), ct = await abrir(pt, 'ajeno');
      await previo(check(ct.id), 'ajeno');
      for (const actor of ['cliente', 'tercero']) await rechazar('pagar-checkout-ajeno-antes-de-cobrar', check(ct.id) + '/pagar', actor, 'POST', pago, 404, 'CHECKOUT_NO_ENCONTRADO');
      const transferida = await caso('pagar-checkout-propio-y-transferir', check(ct.id) + '/pagar', 'ajeno', 'POST', pago, 200, d => d.transferida === true && d.entradaId === a.entradas[2].id && d.codigoQr && d.codigoQr !== a.entradas[2].codigoQr);
      const [entrada] = await db.ds.query('SELECT propietario_id,codigo_qr,estado FROM entradas_ventas.entradas WHERE id=$1', [transferida.entradaId]);
      c.assert.equal(entrada.propietario_id, f.actores.ajeno.id); c.assert.equal(entrada.codigo_qr, transferida.codigoQr); c.assert.equal(entrada.estado, 'VALIDA');
      const historia = await filas('entradas_ventas.historial_propietarios', 'entrada_id=$1', [transferida.entradaId]); c.assert.equal(historia.length, 2);
      c.assert(historia.some(h => h.fila.propietario_nuevo_id === f.actores.ajeno.id && h.fila.codigo_qr_nuevo === transferida.codigoQr && h.fila.codigo_qr_anterior === a.entradas[2].codigoQr));
      const financiero = await filas('finanzas_pagos.transacciones_pago', 'clave_idempotencia=$1', [ct.id]); c.assert.equal(financiero.length, 1); c.assert.equal(financiero[0].fila.intentos, 1); c.assert.equal(financiero[0].fila.resultado, 'APROBADO');
      await caso('detalle-original-ya-no-revela-entrada-transferida', compra(a.id), 'cliente', 'GET', undefined, 200, d => !d.entradas.some(e => e.id === transferida.entradaId) && !JSON.stringify(d).includes(transferida.codigoQr) && !JSON.stringify(d).includes(a.entradas[2].codigoQr));
      for (const [actor, tiene] of [['cliente', false], ['ajeno', true], ['tercero', false]]) await caso('mis-entradas-propiedad-vigente-sin-qr', '/reventa/mis-entradas', actor, 'GET', undefined, 200, d => d.some(e => e.id === transferida.entradaId) === tiene && sinQR(d));
      await caso('publicacion-vendida-compartida-sin-qr', pub(pt.id), 'tercero', 'GET', undefined, 200, d => d.estado === 'VENDIDA' && sinQR(d));
      for (const [ruta, cuerpo] of [[cotizar, { entradaIds: [transferida.entradaId] }], [cancelar, { entradaIds: [transferida.entradaId], montoAceptado: 1000, motivo: 'Entrada de otro propietario' }]]) await rechazar('vendedor-original-no-cancela-transferida', ruta, 'cliente', 'POST', cuerpo, 409, 'CU-003D');
      await rechazar('vendedor-original-no-republica-transferida', '/reventa/publicaciones', 'cliente', 'POST', { entradaId: transferida.entradaId, precio: 900 }, 403, 'NO_ES_PROPIETARIO');
      const pn = await publicar({ id: transferida.entradaId }, 'ajeno');
      await rechazar('vendedor-anterior-no-edita-nueva-publicacion', pub(pn.id), 'cliente', 'PATCH', { precio: 800 }, 403, 'NO_ES_PROPIETARIO');
      await rechazar('vendedor-anterior-no-retira-nueva-publicacion', pub(pn.id), 'cliente', 'DELETE', undefined, 403, 'NO_ES_PROPIETARIO');
      await previo(pub(pn.id), 'ajeno', 'DELETE'); await previo(pub(pc.id), 'cliente', 'DELETE');
      // Los rechazos nunca se confunden con una ejecución positiva del Administrador.
      for (const actor of ['cliente', 'personal', 'organizador']) await rechazar('expiracion-global-deniega-rol', '/reventa/mantenimiento/expirar-publicaciones', actor, 'POST', {}, 403, 'ROL_INSUFICIENTE', 'rol-parcial', true);
      await rechazar('expiracion-global-sin-sesion', '/reventa/mantenimiento/expirar-publicaciones', 'sinSesion', 'POST', {}, 401, 'SIN_AUTENTICAR', 'rol-parcial', true);
      const ambito = { canal, antes: await ambitoDescartable(), ejecutada: false }; ambitos.push(ambito); checkpoint();
      if (ambito.antes.descartable) {
        // La entrada y la publicación son exclusivas del ensayo. No agrega filtros al producto.
        const pe = await publicar(b.entradas[0], 'ajeno');
        const qrAntes = await filas('entradas_ventas.entradas', 'id=$1', [b.entradas[0].id]);
        const historialAntes = await filas('entradas_ventas.historial_propietarios', 'entrada_id=$1', [b.entradas[0].id]);
        await db.ds.query("UPDATE entradas_postventa.publicaciones_reventa SET fecha_expiracion=now()-interval '1 minute' WHERE id=$1 AND evento_id=$2 AND vendedor_id=$3", [pe.id, f.evento, f.actores.ajeno.id]);
        await previo(pub(pe.id), 'ajeno');
        ambito.inmediatamenteAntes = await ambitoDescartable(); c.assert(ambito.inmediatamenteAntes.descartable, 'No barrer datos ajenos'); checkpoint();
        const todasAntes = await filas('entradas_postventa.publicaciones_reventa', 'true', []), estadoAntes = await capturar();
        await caso('expiracion-global-administrador-ambito-descartable', '/reventa/mantenimiento/expirar-publicaciones', 'admin', 'POST', {}, 200,
          d => d.revisadas === 1 && d.expiradas === 1 && d.omitidasPorCheckout === 0);
        ambito.despues = await ambitoDescartable(); c.assert(ambito.despues.descartable); ambito.ejecutada = true;
        const todasDespues = await filas('entradas_postventa.publicaciones_reventa', 'true', []), estadoDespues = await capturar();
        c.assert.equal(hash(todasAntes.filter(x => x.fila.id !== pe.id)), hash(todasDespues.filter(x => x.fila.id !== pe.id)), 'Otros anuncios intactos en barrido');
        c.assert.equal(todasDespues.find(x => x.fila.id === pe.id).fila.estado, 'EXPIRADA');
        const qrDespues = await filas('entradas_ventas.entradas', 'id=$1', [b.entradas[0].id]);
        c.assert.equal(qrDespues[0].fila.estado, 'VALIDA'); c.assert.equal(qrAntes[0].fila.codigo_qr, qrDespues[0].fila.codigo_qr); c.assert.equal(qrAntes[0].fila.propietario_id, qrDespues[0].fila.propietario_id);
        c.assert.equal(hash(historialAntes), hash(await filas('entradas_ventas.historial_propietarios', 'entrada_id=$1', [b.entradas[0].id])));
        c.assert.equal(hash(estadoAntes.sql.finanzas), hash(estadoDespues.sql.finanzas)); c.assert.equal(hash(estadoAntes.redis), hash(estadoDespues.redis));
        ambito.otrasPublicacionesIntactas = true; ambito.qrHistorialFinanzasRedisConservados = true;
        for (const v of controles.filter(x => x.canal === canal && x.tipo === 'rol-parcial')) v.tipo = 'rol'; checkpoint();
      }
      const cubiertas = new Set(controles.filter(x => x.canal === canal && x.tipo === 'autorizacion' && x.estado < 300).map(x => x.operacion)); c.assert.equal(cubiertas.size, ambito.ejecutada ? 19 : 18);
      c.guardar(nombre + '-transferencia-' + canal + '.json', { cambioPropietario: true, qrRotado: true, historialDosFilas: true, cobroUnIntento: true, detalleAnteriorSinEntrada: true });
    }
    const ampliadas = ambitos.every(x => x.ejecutada) ? 19 : 18;
    const d = { inicio, fin: new Date().toISOString(), fase, revisadas: 19, ampliadas, global: 69 + ampliadas, pendientesGlobal: 90 - ampliadas, controles, precondiciones, ambitos, fallidos: controles.filter(x => !x.ok).length,
      limitacion: ampliadas === 19 ? null : 'Expiración global: no se ejecuta positivamente donde no se puede comprobar ámbito descartable; se conservan los rechazos de rol/sesión.' };
    c.guardar(nombre + '.json', d); console.log(JSON.stringify({ fase, controles: controles.length, tipos: controles.reduce((r, x) => ({ ...r, [x.tipo]: (r[x.tipo] ?? 0) + 1 }), {}), rechazosSinCambios: controles.filter(x => x.sinCambiosSQL && x.sinCambiosRedis).length, fallidos: d.fallidos, duracionMs: Date.parse(d.fin) - Date.parse(inicio) }));
  } finally { await db.cerrar(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
