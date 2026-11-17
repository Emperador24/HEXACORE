#!/usr/bin/env node
'use strict';
// Diagnóstico posterior, sin proveedores ni reparaciones. No es un reconciliador.
const { createHash } = require('node:crypto');
const TIPOS = ['pedido', 'compra', 'reventa', 'reembolso-entrada', 'reembolso-pedido'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function centavos(n) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(n))) throw new Error('MONTO_INVALIDO');
  const [e, d = ''] = String(n).split('.');
  return BigInt(e) * 100n + BigInt(d.padEnd(2, '0'));
}
function estado(e) {
  if (['APROBADA', 'APROBADO', 'PAGADA', 'CANCELADA', 'PARCIALMENTE_CANCELADA'].includes(e)) return 'aprobado';
  if (['RECHAZADA', 'RECHAZADO'].includes(e)) return 'rechazado';
  if (['FALLIDA', 'INCIERTO', 'INDETERMINADO'].includes(e)) return 'incierto';
  return 'pendiente';
}
function evaluar(d) {
  const errores = [], pendientes = [];
  const comprobar = (ok, codigo) => { if (!ok) errores.push(codigo); };
  const igualMonto = (a, b, codigo) => {
    try { comprobar(centavos(a) === centavos(b), codigo); }
    catch { errores.push('MONTO_INVALIDO'); }
  };
  if (!d.operacion) return { estado: 'desconocido', errores: ['OPERACION_NO_ENCONTRADA'], pendientes: [], codigo: 1 };
  const o = d.operacion, l = d.libro, s = estado(o.estado);
  comprobar(Boolean(o.actor && o.fecha && Number.isFinite(new Date(o.fecha).getTime())), 'AUDITORIA_INCOMPLETA');
  if (!l) {
    if (s === 'pendiente') pendientes.push('SIN_RESULTADO_FINANCIERO');
    else errores.push('FALTA_LIBRO');
  } else {
    comprobar(l.clave_idempotencia === o.clave, 'CLAVE_INCOMPATIBLE');
    comprobar(l.tipo === o.tipo && l.solicitante === o.solicitante, 'ORIGEN_INCOMPATIBLE');
    igualMonto(o.monto, l.monto, 'IMPORTE_INCOMPATIBLE');
    comprobar(l.moneda === o.moneda, 'MONEDA_INCOMPATIBLE');
    comprobar(Number.isInteger(l.intentos) && l.intentos >= 1, 'INTENTOS_INVALIDOS');
    comprobar(Boolean(l.creada_en && l.actualizada_en), 'AUDITORIA_LIBRO_INCOMPLETA');
    const sl = estado(l.resultado);
    if (s !== sl) {
      // Una aprobación financiera sin finalización de negocio es una inconsistencia
      // visible (p.ej. F12); nunca se convierte en éxito ni se reenvía el cobro.
      if (sl === 'aprobado' || s === 'aprobado' || s === 'rechazado') errores.push('RESULTADO_DIVERGENTE');
      else pendientes.push('RESULTADO_NO_TERMINAL');
    }
    if (s === 'aprobado') comprobar(Boolean(o.referencia) && o.referencia === l.referencia, 'REFERENCIA_INCOMPATIBLE');
    if (s === 'rechazado') comprobar((o.referencia ?? null) === (l.referencia ?? null), 'REFERENCIA_INCOMPATIBLE');
  }
  for (const c of d.comprobaciones || []) comprobar(c.ok, c.codigo);
  pendientes.push(...(d.pendientes || []));
  if (s === 'incierto') pendientes.push('REQUIERE_REVISION_SIN_REENVIO');
  if (s === 'pendiente') pendientes.push('OPERACION_NO_TERMINAL');
  return { estado: s, errores: [...new Set(errores)], pendientes: [...new Set(pendientes)],
    codigo: errores.length ? 1 : pendientes.length ? 2 : 0 };
}
async function cargar(db, tipo, id) {
  if (!TIPOS.includes(tipo) || !UUID.test(id)) throw new Error('TIPO_O_ID_INVALIDO');
  const una = async (sql, valores = [id]) => (await db.query(sql, valores)).rows[0];
  const todas = async (sql, valores = [id]) => (await db.query(sql, valores)).rows;
  const d = { comprobaciones: [], pendientes: [] };
  const check = (ok, codigo) => d.comprobaciones.push({ok, codigo});
  const op = (r, campos) => r && ({...campos, fecha: r.creada_en || r.cancelado_en, tipo: tipo.startsWith('reembolso') ? 'REEMBOLSO' : 'COBRO'});
  if (tipo === 'pedido') {
    const r = await una('SELECT * FROM alimentos.transacciones_pedido WHERE id=$1');
    if (r) {
      d.operacion = op(r, {clave: r.id, monto: r.monto, moneda: r.moneda, estado: r.estado, referencia: r.referencia_pasarela, solicitante: 'alimentos'});
      const p = await una('SELECT * FROM alimentos.pedidos WHERE id=$1', [r.pedido_id]);
      d.operacion.actor = p?.cliente_id;
      check(Boolean(p), 'FALTA_PEDIDO');
      if (p) {
        check(centavos(p.total) === centavos(r.monto) && p.moneda === r.moneda, 'SNAPSHOT_PEDIDO_DIVERGENTE');
        if (estado(r.estado) === 'aprobado') check(Boolean(p.confirmado_en) && p.estado !== 'PENDIENTE_PAGO', 'PEDIDO_NO_FINALIZADO');
      }
      const n = await una("SELECT count(*)::int AS n FROM alimentos.transacciones_pedido WHERE pedido_id=$1 AND estado='APROBADA'", [r.pedido_id]);
      check(n.n <= 1, 'MULTIPLES_COBROS_APROBADOS');
    }
  } else if (tipo === 'compra') {
    const r = await una('SELECT * FROM entradas_ventas.compras WHERE id=$1');
    if (r) {
      // Se verifica el último intento conocido; los rechazados previos se conservan.
      const libros = await todas('SELECT * FROM finanzas_pagos.transacciones_pago WHERE clave_idempotencia LIKE $1', [id + ':%']);
      const l = libros.find(x => x.resultado === 'APROBADO') || libros.find(x => x.clave_idempotencia === `${id}:${r.intentos_rechazados}`) || libros.at(-1);
      const estadoCompra = l?.resultado === 'RECHAZADO' && r.estado === 'PENDIENTE' ? 'RECHAZADA' : l?.resultado === 'INDETERMINADO' && r.estado === 'PAGANDO' ? 'INCIERTO' : r.estado;
      d.operacion = op(r, {clave: l?.clave_idempotencia || `${id}:${r.intentos_rechazados}`, monto: r.total, moneda: 'COP', estado: estadoCompra, referencia: r.referencia_pasarela, actor: r.comprador_id, solicitante: 'entradas'});
      check(libros.filter(x => x.resultado === 'APROBADO').length <= 1, 'MULTIPLES_COBROS_APROBADOS');
      if (estado(d.operacion.estado) === 'aprobado') {
        const entradas = await todas('SELECT * FROM entradas_ventas.entradas WHERE compra_id=$1');
        check(entradas.length === r.cantidad && Boolean(r.pagada_en), 'EMISION_INCOMPLETA');
        const h = await todas("SELECT * FROM entradas_ventas.historial_propietarios WHERE entrada_id=ANY($1::uuid[]) AND motivo='EMISION'", [entradas.map(e => e.id)]);
        check(entradas.every(e => h.filter(x => x.entrada_id === e.id && x.propietario_nuevo_id === r.comprador_id && x.registrado_en).length === 1), 'HISTORIAL_EMISION_INCOMPLETO');
      }
    }
  } else if (tipo === 'reventa') {
    const r = await una('SELECT * FROM entradas_postventa.transacciones_reventa WHERE id=$1');
    if (r) {
      d.operacion = op(r, {clave: r.id, monto: r.precio, moneda: 'COP', estado: r.estado, referencia: r.referencia_pasarela, actor: r.comprador_id, solicitante: 'entradas'});
      check(centavos(r.precio) === centavos(r.comision) + centavos(r.neto_vendedor), 'LIQUIDACION_INCOMPATIBLE');
      if (r.estado === 'APROBADA') {
        const h = await todas('SELECT * FROM entradas_ventas.historial_propietarios WHERE transaccion_id=$1');
        check(h.length === 1 && h[0].entrada_id === r.entrada_id && h[0].propietario_anterior_id === r.vendedor_id && h[0].propietario_nuevo_id === r.comprador_id && h[0].motivo === 'REVENTA' && Boolean(h[0].registrado_en), 'HISTORIAL_TRANSFERENCIA_INCOMPATIBLE');
        if (h.length === 1) {
          check(Boolean(h[0].codigo_qr_anterior) && Boolean(h[0].codigo_qr_nuevo) && h[0].codigo_qr_anterior !== h[0].codigo_qr_nuevo, 'QR_NO_ROTADO');
          const anterior = await una('SELECT count(*)::int AS n FROM entradas_ventas.entradas WHERE codigo_qr=$1', [h[0].codigo_qr_anterior]);
          check(anterior.n === 0, 'QR_ANTERIOR_EN_VENTAS');
          // La proyección de acceso es asíncrona. Se informa sin prometer un corte instantáneo.
          const anteriorAcceso = await una('SELECT count(*)::int AS n FROM entradas_acceso_qr.qr_entradas WHERE hash_qr=$1', [createHash('sha256').update(h[0].codigo_qr_anterior).digest('hex')]);
          if (anteriorAcceso.n) d.pendientes.push('QR_ANTERIOR_EN_PROYECCION_ACCESO');
        }
      }
    }
  } else if (tipo === 'reembolso-entrada') {
    const r = await una('SELECT * FROM entradas_ventas.cancelaciones WHERE id=$1');
    if (r) {
      d.operacion = op(r, {clave: r.id, monto: r.monto_reembolso, moneda: 'COP', estado: r.estado, referencia: r.referencia_pasarela, actor: r.solicitante_id, solicitante: 'entradas'});
      const compra = await una('SELECT * FROM entradas_ventas.compras WHERE id=$1', [r.compra_id]);
      check(Boolean(compra?.referencia_pasarela) && centavos(r.monto_reembolso) <= centavos(compra.total), 'COBRO_ORIGINAL_INCOMPATIBLE');
      const entradas = await todas('SELECT * FROM entradas_ventas.entradas WHERE id=ANY($1::uuid[])', [r.entradas_ids]);
      check(r.entradas_ids.length > 0 && entradas.length === r.entradas_ids.length && entradas.every(e => e.compra_id === r.compra_id), 'ENTRADAS_REEMBOLSO_INCOMPATIBLES');
      if (r.estado === 'APROBADA') check(entradas.every(e => e.estado === 'ANULADA'), 'ENTRADAS_NO_ANULADAS');
      d.pendientes.push('LIBRO_NO_PERSISTE_REFERENCIA_COBRO_ORIGINAL');
    }
  } else {
    const r = await una('SELECT * FROM alimentos.cancelaciones_pedido WHERE operacion_id=$1');
    if (r) {
      d.operacion = op(r, {clave: r.reembolso_id, monto: r.monto, moneda: r.moneda, estado: r.estado_reembolso, referencia: r.referencia_reembolso, actor: r.actor_id, solicitante: 'alimentos'});
      const cobro = await una('SELECT * FROM alimentos.transacciones_pedido WHERE id=$1', [r.cobro_id]);
      const original = await una('SELECT * FROM finanzas_pagos.transacciones_pago WHERE clave_idempotencia=$1', [r.cobro_id]);
      check(Boolean(cobro && original) && cobro.pedido_id === r.pedido_id && cobro.estado === 'APROBADA' && original.resultado === 'APROBADO' && cobro.referencia_pasarela === r.referencia_cobro && original.referencia === r.referencia_cobro && centavos(cobro.monto) === centavos(r.monto) && centavos(original.monto) === centavos(r.monto) && original.moneda === r.moneda, 'COBRO_ORIGINAL_INCOMPATIBLE');
      const pedido = await una('SELECT * FROM alimentos.pedidos WHERE id=$1', [r.pedido_id]);
      check(pedido?.estado === 'CANCELADO' && Boolean(pedido.cancelado_en) && /^[a-f0-9]{64}$/.test(r.huella), 'CANCELACION_SNAPSHOT_INCOMPLETO');
      d.pendientes.push('LIBRO_NO_PERSISTE_REFERENCIA_COBRO_ORIGINAL');
    }
  }
  if (d.operacion) d.libro = await una('SELECT * FROM finanzas_pagos.transacciones_pago WHERE clave_idempotencia=$1', [d.operacion.clave]);
  return d;
}
async function verificar(db, tipo, id) {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await db.query("SET LOCAL statement_timeout='5000ms'");
    const d = await cargar(db, tipo, id);
    const resultado = evaluar(d);
    await db.query('COMMIT');
    return { tipo, operacionSHA256: createHash('sha256').update(id).digest('hex'), soloLectura: true, ...resultado };
  } catch (e) { await db.query('ROLLBACK'); throw e; }
}
async function main() {
  const [tipo, id] = process.argv.slice(2);
  if (process.argv.length !== 4 || !TIPOS.includes(tipo) || !UUID.test(id || '')) throw new Error('USO: verificar-transaccion.cjs tipo UUID; SAFETY_CONFIG apunta al JSON privado');
  const cfg = JSON.parse(require('node:fs').readFileSync(process.env.SAFETY_CONFIG, 'utf8'));
  if (cfg.ambito !== 'ensayo-simulado' || !cfg.operaciones?.some(o => o.tipo === tipo && o.id === id) || !/^hexacore_(?:\w+_)?e2e$/.test(cfg.postgres?.database || '')) throw new Error('AMBITO_NO_AUTORIZADO');
  const db = new (require('pg').Client)({...cfg.postgres, application_name: 'safety-solo-lectura', connectionTimeoutMillis: 5000});
  try { await db.connect(); const r = await verificar(db, tipo, id); console.log(JSON.stringify(r)); process.exitCode = r.codigo; }
  finally { await db.end(); }
}
if (require.main === module) main().catch(() => { console.error('SAFETY: configuración o consulta inválida; no se modificaron registros.'); process.exitCode = 3; });
module.exports = { evaluar, verificar, cargar, centavos };
