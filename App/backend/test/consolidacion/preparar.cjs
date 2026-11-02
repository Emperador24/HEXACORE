// Reutiliza los contratos ejercitados por CU-011, convivencia financiera, CU-017/018 y CU-001–006.
// Solo inserta referencias/credenciales iniciales para las que no existe administración completa.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const { join } = require('node:path');
const { guardas, mapa, cliente, docker, composeOrigen } = require('./config.cjs');
const { cifrarContrasena } = require('../../dist/modulos/identidad/comun/contrasenas');
async function preparar(salida) {
  const identidad = guardas();
  assert.ok(!fs.existsSync(join(salida, 'preparacion-iniciada.json')), 'Preparación ya iniciada: usa otro directorio y conserva la evidencia del intento');
  fs.writeFileSync(join(salida,'preparacion-iniciada.json'),JSON.stringify({fecha:new Date().toISOString(),identidad}),{mode:0o600,flag:'wx'});
  const db = {}, cuentas = {}, ids = { evento: randomUUID(), local: randomUUID(), producto: randomUUID(), localidad: randomUUID() };
  const contrasena = 'EnsayoHexacore22!';
  let comprobaciones = 0;
  async function api(ruta, esperado, { cuenta = 'cliente', metodo = 'GET', cuerpo, headers = {} } = {}) {
    const r = await fetch('http://127.0.0.1:18080/api/v1' + ruta, { method: metodo,
      headers: { 'Content-Type': 'application/json', ...(cuentas[cuenta]?.token ? { Authorization: 'Bearer ' + cuentas[cuenta].token } : {}), ...headers },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(10000) });
    const texto = await r.text(), body = texto ? JSON.parse(texto) : null;
    assert.equal(r.status, esperado, `${metodo} ${ruta}: ${texto}`); comprobaciones++;
    return body;
  }
  const esperar = async f => { const fin = Date.now() + 10000; while (!await f()) { assert.ok(Date.now() < fin, 'Proyección/notificación no converge'); await new Promise(r => setTimeout(r, 100)); } comprobaciones++; };
  try {
    for (const m of mapa) db[m.esquema] = await cliente('origen', m.base);
    for (const [nombre, rol] of [['cliente','Cliente'],['comprador','Cliente'],['personal','Personal'],['reemplazo','Personal'],['admin','Administrador'],['auditable','Cliente']]) {
      const id = randomUUID(), email = `consolidacion-${id}@example.test`;
      await db.identidad.query("INSERT INTO usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,'ACTIVA',now())", [id,nombre,email,await cifrarContrasena(contrasena)]);
      const r = await db.identidad.query('INSERT INTO usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM roles WHERE nombre=$2', [id,rol]);
      assert.equal(r.rowCount,1);
      cuentas[nombre] = { id, email };
      const login = await api('/sesiones', 200, { cuenta: '', metodo: 'POST', cuerpo: { email, contrasena } });
      cuentas[nombre].token = login.token;
      assert.equal((await api('/cuentas/perfil',200,{cuenta:nombre})).id,id);
    }
    // Token hash, correo durable pendiente y cuenta pendiente: registro real, sin consumir el correo.
    const pendiente = `consolidacion-pendiente-${randomUUID()}@example.test`;
    await api('/cuentas/registro',202,{cuenta:'',metodo:'POST',cuerpo:{nombre:'Pendiente ensayo',email:pendiente,contrasena}});
    await api(`/admin/cuentas/${cuentas.auditable.id}/desactivar`,200,{cuenta:'admin',metodo:'POST',cuerpo:{motivo:'Auditoría propia del ensayo'}});
    assert.equal((await db.identidad.query('SELECT count(*)::int n FROM auditoria_cuentas WHERE cuenta_id=$1',[cuentas.auditable.id])).rows[0].n,1);
    await db.alimentos.query("INSERT INTO eventos_referencia(evento_id,nombre,disponible) VALUES($1,'Ensayo consolidación',true)",[ids.evento]);
    await db.alimentos.query("INSERT INTO establecimientos(id,evento_id,nombre,estado,punto_entrega) VALUES($1,$2,'Ensayo','DISPONIBLE','Pruebas')",[ids.local,ids.evento]);
    await db.alimentos.query("INSERT INTO productos(id,establecimiento_id,nombre,precio,activo,cantidad_inventario) VALUES($1,$2,'Producto',1150.25,true,20)",[ids.producto,ids.local]);
    docker([...composeOrigen,'exec','-T','nucleo','node','dist/modulos/alimentos/inventario/preparar-inventario.js',ids.local,'--compras-detenidas']);
    for (const n of ['entradas_ventas','entradas_catalogo','entradas_postventa','entradas_acceso_qr']) {
      const campos = n === 'entradas_postventa' ? ',permite_reventa' : `,estado${n === 'entradas_acceso_qr' ? ',aforo_maximo' : ',categoria'}`;
      const valores = n === 'entradas_postventa' ? ',true' : `,'PUBLICADO'${n === 'entradas_acceso_qr' ? ',100' : ",'Conciertos'"}`;
      await db[n].query(`INSERT INTO eventos_referencia(evento_id,nombre,fecha_inicio,lugar,ciudad${campos}) VALUES($1,'Ensayo',now()+interval '30 days','Recinto','Bogotá'${valores})`,[ids.evento]);
      if (['entradas_ventas','entradas_catalogo'].includes(n)) await db[n].query("INSERT INTO localidades_evento(localidad_id,evento_id,nombre,precio,aforo) VALUES($1,$2,'General',1234.50,20)",[ids.localidad,ids.evento]);
    }
    const checkout = () => api('/pedidos/checkout',201,{metodo:'POST',cuerpo:{eventoId:ids.evento,establecimientoId:ids.local,metodoEntrega:'RECOGER',productos:[{productoId:ids.producto,cantidad:1}]}});
    ids.pedidos = [];
    for (const [tokenPago,status,estado] of [['tok_ok_ensayo',200,'APROBADA'],['tok_rechazo_ensayo',200,'RECHAZADA'],['tok_error_ensayo',502,'FALLIDA']]) {
      const pedido = await checkout(), clave = randomUUID(); ids.pedidos.push(pedido.id);
      const pago=await api(`/pedidos/${pedido.id}/pagos`,status,{metodo:'POST',cuerpo:{tokenPago},headers:{'Idempotency-Key':clave}});
      assert.equal(pago.estadoPago,estado);
    }
    ids.pedidoReservado = (await checkout()).id;
    const turno = await api(`/cola/eventos/${ids.evento}/turnos`,201,{metodo:'POST'});
    const compra = await api('/compras',201,{metodo:'POST',cuerpo:{localidadId:ids.localidad,cantidad:2},headers:{'X-Turno-Cola':turno.token}});
    const codigo = 'ENS' + randomUUID().slice(0,8).toUpperCase();
    await db.entradas_ventas.query("INSERT INTO codigos_promocionales(codigo,descripcion,porcentaje,limite_usos,usos,activo,vigente_desde,vigente_hasta,evento_id) VALUES($1,'Ensayo',10,4,0,true,now()-interval '1 day',now()+interval '40 days',$2)",[codigo,ids.evento]);
    await api(`/compras/${compra.id}/cupon`,200,{metodo:'PUT',cuerpo:{codigo}});
    const pagada = await api(`/compras/${compra.id}/pagar`,200,{metodo:'POST',cuerpo:{metodoPago:'TARJETA',token:'tok_ok_ensayo'}});
    assert.equal(pagada.entradas.length,2);
    const cot = await api(`/compras/${compra.id}/cancelacion/cotizacion`,200,{metodo:'POST',cuerpo:{entradaIds:[pagada.entradas[0].id]}});
    await api(`/compras/${compra.id}/cancelaciones`,200,{metodo:'POST',cuerpo:{entradaIds:[pagada.entradas[0].id],motivo:'Ensayo',montoAceptado:cot.montoReembolso}});
    const pub = await api('/reventa/publicaciones',201,{metodo:'POST',cuerpo:{entradaId:pagada.entradas[1].id,precio:1333.37}});
    const reventa = await api(`/reventa/publicaciones/${pub.id}/checkout`,201,{cuenta:'comprador',metodo:'POST'});
    const transferida = await api(`/reventa/checkout/${reventa.id}/pagar`,200,{cuenta:'comprador',metodo:'POST',cuerpo:{metodoPago:'TARJETA',token:'tok_ok_ensayo'}});
    assert.equal(transferida.transferida,true);
    const hash = createHash('sha256').update(transferida.codigoQr).digest('hex');
    // Espera explícita de la proyección solo para construir el fixture, no certifica invalidación inmediata.
    await esperar(async()=> (await db.entradas_acceso_qr.query('SELECT hash_qr FROM qr_entradas WHERE entrada_id=$1',[transferida.entradaId])).rows[0]?.hash_qr === hash);
    await api('/ingresos',200,{cuenta:'personal',metodo:'POST',cuerpo:{eventoId:ids.evento,codigoQr:transferida.codigoQr}});
    ids.compra = compra.id; ids.entradaTransferida = transferida.entradaId;
    const turnoPendiente=await api(`/cola/eventos/${ids.evento}/turnos`,201,{metodo:'POST'});
    await api('/compras',201,{metodo:'POST',cuerpo:{localidadId:ids.localidad,cantidad:1},headers:{'X-Turno-Cola':turnoPendiente.token}});
    await api(`/cola/eventos/${ids.evento}/turnos`,201,{cuenta:'comprador',metodo:'POST'}); // turno sin consumir en Redis
    const fichas = [];
    for (const nombre of ['personal','reemplazo']) fichas.push(await api('/logistica/empleados',201,{cuenta:'admin',metodo:'POST',cuerpo:{usuarioId:cuentas[nombre].id,nombre,rol:'Ensayo',credencial:'ensayo-'+randomUUID()}}));
    const zona = await api('/logistica/zonas',201,{cuenta:'admin',metodo:'POST',cuerpo:{eventoId:ids.evento,nombre:'Puerta',rolRequerido:'Ensayo',personalRequerido:1}});
    const fecha = h => new Date(Date.now()+h*3600000).toISOString();
    const asignacion = await api(`/logistica/zonas/${zona.id}/asignaciones`,201,{cuenta:'admin',metodo:'POST',cuerpo:{empleadoId:fichas[0].id,horaInicio:fecha(24),horaFin:fecha(25)}});
    const solicitud = await api(`/logistica/turnos/${asignacion.turno.id}/solicitudes-cambio`,201,{cuenta:'personal',metodo:'POST',cuerpo:{motivo:'Ensayo de cambio'}});
    const revisada = await api(`/logistica/solicitudes-cambio/${solicitud.solicitud.id}/revisar`,200,{cuenta:'admin',metodo:'PATCH',cuerpo:{aprobar:true}});
    assert.equal(revisada.estado,'APROBADA');
    await api('/logistica/turnos',201,{cuenta:'admin',metodo:'POST',cuerpo:{empleadoId:fichas[0].id,eventoId:ids.evento,zona:'Puerta',horaInicio:fecha(-1),horaFin:fecha(2)}});
    const e = await api('/logistica/asistencia/entrada',201,{cuenta:'personal',metodo:'POST',cuerpo:{credencial:fichas[0].credencial}});
    assert.equal(e.anomalia,false);
    await api('/logistica/asistencia/salida',201,{cuenta:'personal',metodo:'POST',cuerpo:{credencial:fichas[0].credencial}});
    await esperar(async()=> (await db.personal_logistica.query('SELECT count(*)::int n FROM notificaciones')).rows[0].n >= 1);
    await esperar(async()=> (await db.entradas_ventas.query('SELECT estado FROM entradas WHERE id=$1',[transferida.entradaId])).rows[0].estado === 'USADA');
    // No persiste JWT/contraseñas en evidencias. UUID/destinatario y respaldos permanecen privados.
    fs.writeFileSync(join(salida,'fixtures.json'),JSON.stringify({ identidad,ids,cuentas:Object.fromEntries(Object.entries(cuentas).map(([n,c])=>[n,c.id])),pendiente,comprobaciones },null,2),{mode:0o600});
    console.log(`Preparación representativa: ${comprobaciones} comprobaciones HTTP/proyecciones; datos conservados para capturar.`);
  } finally { await Promise.all(Object.values(db).map(c=>c.end())); }
}
module.exports = { preparar };
