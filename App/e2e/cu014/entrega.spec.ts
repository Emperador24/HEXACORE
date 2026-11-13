import { presentar } from '../presentacion';
import { expect, test } from '../csp.fixture';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { adminURL, clienteURL, comprobarAislamiento, gateway, loginAPI, loginUI, nucleo, sql } from '../cu015/entorno';
import { comprar, entornoEntrega, h, listo } from './entorno';
const {nucleo:controlarNucleo}=require('../../backend/test/cu012/entorno.cjs') as {nucleo(accion:'parar'|'iniciar'):void};
test.beforeAll(comprobarAislamiento);
const snapshot=(id:string)=>({pedido:sql(`SELECT row_to_json(p) FROM alimentos.pedidos p WHERE id='${id}'`),detalles:sql(`SELECT json_agg(d ORDER BY d.id) FROM alimentos.detalles_pedido d WHERE pedido_id='${id}'`)});
// Comprobador óptico para el ensayo físico; no participa en autenticación ni autorización.
function verificadorOptico(codigo:string){let n=14695981039346656037n;for(const b of Buffer.from(codigo)){n=((n^BigInt(b))*1099511628211n)&0xffffffffffffffffn;}return n.toString(16).padStart(16,'0');}

test('CU-014 por interfaces: QR real ingresado, revisión, entrega única y aviso/fecha sin QR utilizable',async({page,browser,request},info)=>{
 const e=await entornoEntrega(request);
 await loginUI(page,clienteURL,'cliente@hexacore.com');await page.goto(`${clienteURL}/pedidos?eventoId=${e.evento.id}`);
 await page.getByRole('link').filter({hasText:e.nombre}).click();await page.getByRole('button',{name:'Agregar Receta CU014',exact:true}).click();
 const checkout=page.waitForResponse(r=>r.url().endsWith('/pedidos/checkout'));await page.getByRole('button',{name:'Continuar',exact:true}).click();const r=await checkout;expect(r.status()).toBe(201);const p=await r.json();
 const pago=page.waitForResponse(r=>r.url().endsWith(`/pedidos/${p.id}/pagos`));await page.getByRole('button',{name:'Pagar pedido',exact:true}).click();const cobro=await pago;expect(cobro.status()).toBe(200);const pagado=await cobro.json();expect(pagado.codigoQr).toMatch(/^[a-f0-9]{64}$/);
 await page.getByRole('link',{name:'Ver seguimiento y avisos',exact:true}).click();await expect(page).toHaveURL(`${clienteURL}/mis-pedidos/${p.id}`);await expect(page.getByAltText('Código QR del pedido confirmado')).toBeVisible();
 const imagen=await page.getByAltText('Código QR del pedido confirmado').getAttribute('src');
 writeFileSync(info.outputPath('qr-real-privado.png'),Buffer.from(imagen!.split(',')[1],'base64'));writeFileSync(info.outputPath('qr-huella.json'),JSON.stringify({sha256:createHash('sha256').update(pagado.codigoQr).digest('hex'),verificadorOptico:verificadorOptico(pagado.codigoQr)}));
 const antes=snapshot(p.id);
 await presentar(page,'Cliente: QR del pedido confirmado');
 const contexto=await browser.newContext(),operador=await contexto.newPage();
 try{
  await loginUI(operador,adminURL,'restaurante@hexacore.com');await operador.getByRole('navigation').getByRole('link',{name:'Preparación de pedidos',exact:true}).click();await expect(operador).toHaveURL(`${adminURL}/admin/preparacion`);await expect(operador.getByRole('heading',{name:/Preparación de pedidos/})).toBeVisible();
  await operador.getByLabel('Establecimiento vinculado',{exact:true}).selectOption(e.local.id);await operador.locator(`[data-pedido="${p.id}"]`).getByRole('button',{name:'Gestionar pedido',exact:true}).click();
  const detalle=operador.getByRole('region',{name:'Detalle de preparación'});
  await detalle.getByRole('button',{name:'Iniciar preparación',exact:true}).click();await operador.getByLabel('Minutos estimados',{exact:true}).fill('10');
  let cambio=operador.waitForResponse(r=>r.url().endsWith(`/${p.id}/preparacion`));await operador.getByRole('button',{name:'Guardar avance',exact:true}).click();expect((await cambio).status()).toBe(200);
  cambio=operador.waitForResponse(r=>r.url().endsWith(`/${p.id}/preparacion`));await detalle.getByRole('button',{name:'Marcar listo',exact:true}).click();expect((await cambio).status()).toBe(200);
  expect((await request.patch(`${gateway}/pedidos/admin/establecimientos/${e.local.id}/estado`,{headers:h(e.organizador.token),data:{estado:'CERRADO'}})).status()).toBe(200);
  const entrega=operador.getByRole('region',{name:'Validación y entrega'});
  await entrega.getByLabel('Código QR completo',{exact:true}).fill(pagado.codigoQr);
  let consulta=operador.waitForResponse(r=>r.url().endsWith('/entregas/prevalidar'));await entrega.getByRole('button',{name:'Validar código',exact:true}).click();expect((await consulta).status()).toBe(200);
  await expect(entrega.getByRole('region',{name:'Revisar entrega'})).toContainText(e.local.puntoEntrega);
 await presentar(operador,'Personal: revisar productos y punto antes de entregar');
  expect(sql(`SELECT count(*) FROM alimentos.entregas_pedido WHERE pedido_id='${p.id}'`)).toBe('0');expect(sql(`SELECT version FROM alimentos.preparaciones_pedido WHERE pedido_id='${p.id}'`)).toBe('2');
  // Fallo de transporte después de COMMIT: se llama al backend real y se pierde solo su respuesta.
  let responder!:(estado:number)=>void;const recibidaServidor=new Promise<number>(r=>responder=r);
  await operador.route('**/entregas/confirmar',async ruta=>{try{const real=await ruta.fetch({maxRetries:0});responder(real.status());}catch{responder(0);}await ruta.abort('failed');});
  await entrega.getByRole('button',{name:'Confirmar entrega',exact:true}).click();expect(await recibidaServidor).toBe(200);await expect(entrega.getByRole('button',{name:'Consultar entrega pendiente',exact:true})).toBeVisible();
 await presentar(operador,'Personal: resultado incierto conservado para consulta segura');
  const almacenada=await operador.evaluate(id=>localStorage.getItem(`hexacore.cu014.intencion.${id}`),e.personal.usuario.id);expect(almacenada).not.toContain(pagado.codigoQr);
  await operador.unroute('**/entregas/confirmar');await operador.reload();
  const confirmar=operador.waitForResponse(r=>r.url().endsWith('/entregas/confirmar'));await entrega.getByRole('button',{name:'Consultar entrega pendiente',exact:true}).click();expect((await confirmar).status()).toBe(200);await expect(entrega.getByRole('status')).toContainText('Pedido entregado');
 await presentar(operador,'Personal: entrega única confirmada');
  expect(sql(`SELECT count(*) FROM alimentos.entregas_pedido WHERE pedido_id='${p.id}'`)).toBe('1');expect(sql(`SELECT count(*) FROM alimentos.historial_preparacion WHERE pedido_id='${p.id}' AND accion='ENTREGAR'`)).toBe('1');expect(snapshot(p.id)).toEqual(antes);
  await page.reload();await expect(page.locator('[data-avance]')).toHaveText('Entregado');await expect(page.locator('[data-entregado]')).toBeVisible();await expect(page.getByAltText('Código QR del pedido confirmado')).toHaveCount(0);await expect(page.getByText(`Tu pedido fue entregado en ${e.local.puntoEntrega}.`,{exact:true})).toBeVisible();
 await presentar(page,'Cliente: entrega y fecha sin QR reutilizable');
  await entrega.getByLabel('Código QR completo',{exact:true}).fill(pagado.codigoQr);consulta=operador.waitForResponse(r=>r.url().endsWith('/entregas/prevalidar'));await entrega.getByRole('button',{name:'Validar código',exact:true}).click();expect((await consulta).status()).toBe(409);await expect(entrega.getByRole('alert')).toContainText('ya fue entregado');
 await presentar(operador,'Personal: segundo uso del QR rechazado');
  await operador.screenshot({path:info.outputPath('entrega-unica.png'),fullPage:true});await page.screenshot({path:info.outputPath('cliente-entregado.png'),fullPage:true});
 }finally{await contexto.close();}
});

test('CU-014 API real: concurrencia, pérdida de respuesta, negativos, replay del pago y reinicio',async({request})=>{
 const e=await entornoEntrega(request),c=await comprar(request,e),p=c.pedido,antes=snapshot(p.id),libro=sql(`SELECT row_to_json(t) FROM finanzas_pagos.transacciones_pago t WHERE clave_idempotencia='${c.clave}'`);
 const url=`${gateway}/pedidos/establecimientos/${e.local.id}/entregas`;
 const prevalidar=(codigoQr=c.pago.codigoQr)=>request.post(`${url}/prevalidar`,{headers:h(e.personal.token),data:{codigoQr}});
 const confirmar=(d:Record<string,unknown>,id=randomUUID())=>request.post(`${url}/confirmar`,{headers:h(e.personal.token,id),data:d});
 for(const destino of [gateway,nucleo])expect((await request.post(`${destino}/pedidos/establecimientos/${e.local.id}/entregas/prevalidar`,{headers:h(e.cliente.token),data:{codigoQr:c.pago.codigoQr}})).status()).toBe(403);
 expect((await prevalidar()).status()).toBe(409);expect((await prevalidar('f'.repeat(64))).status()).toBe(404);expect((await prevalidar('123456')).status()).toBe(400);
 await listo(request,e,p.id);const revision=await prevalidar();expect(revision.status()).toBe(200);const v=await revision.json();
 const datos={pedidoId:p.id,version:v.version,puntoRevision:v.puntoRevision,codigoQr:c.pago.codigoQr};
 expect((await confirmar({...datos,estado:'CONFIRMADO',total:'0.01'})).status()).toBe(400);
 expect((await confirmar({...datos,version:0})).status()).toBe(409);expect((await confirmar({...datos,puntoRevision:'f'.repeat(64)})).status()).toBe(409);
 const puntoNuevo=`Punto actualizado ${e.nombre}`;
 expect((await request.put(`${gateway}/pedidos/admin/establecimientos/${e.local.id}`,{headers:h(e.organizador.token),data:{eventoId:e.evento.id,nombre:e.nombre,contacto:'Contacto CU014',puntoEntrega:puntoNuevo,horaApertura:'00:00',horaCierre:'00:00',zonaHoraria:'America/Bogota',estado:'DISPONIBLE'}})).status()).toBe(200);
 expect((await confirmar(datos)).status()).toBe(409);const nueva=await prevalidar();expect(nueva.status()).toBe(200);datos.puntoRevision=(await nueva.json()).puntoRevision;
 const otra=await request.post(`${gateway}/pedidos/admin/establecimientos`,{headers:h(e.organizador.token),data:{eventoId:e.evento.id,nombre:`Otro punto ${randomUUID()}`,contacto:'Contacto',puntoEntrega:'Otro punto',horaApertura:'00:00',horaCierre:'00:00',zonaHoraria:'America/Bogota',estado:'DISPONIBLE'}});expect(otra.status()).toBe(201);const otro=await otra.json();
 expect((await request.post(`${gateway}/pedidos/establecimientos/${otro.id}/entregas/prevalidar`,{headers:h(e.personal.token),data:{codigoQr:c.pago.codigoQr}})).status()).toBe(403);
 expect((await request.put(`${gateway}/pedidos/admin/establecimientos/${otro.id}/personal/${e.personal.usuario.id}`,{headers:h(e.organizador.token)})).status()).toBe(200);
 expect((await request.post(`${gateway}/pedidos/establecimientos/${otro.id}/entregas/prevalidar`,{headers:h(e.personal.token),data:{codigoQr:c.pago.codigoQr}})).status()).toBe(404);
 // Revalidar al confirmar: una incidencia posterior a la revisión impide entregar.
 const incidencia=randomUUID();sql(`INSERT INTO alimentos.incidencias_preparacion(id,pedido_id,descripcion,actor_id,creada_en) VALUES('${incidencia}','${p.id}','Fixture de incidencia pendiente','${e.personal.usuario.id}',now())`);
 expect((await confirmar(datos)).status()).toBe(409);sql(`UPDATE alimentos.incidencias_preparacion SET resuelta_en=now(),resuelta_por='${e.personal.usuario.id}',resolucion='Resuelto en fixture' WHERE id='${incidencia}'`);
 // Estados financieros incoherentes son fixtures de rechazo, no una política de cancelación.
 for(const estado of ['PENDIENTE_PAGO','EXPIRADO','CANCELADO','CONFIRMADO']){
  const compra=await request.post(`${gateway}/pedidos/checkout`,{headers:h(e.cliente.token),data:{eventoId:e.evento.id,establecimientoId:e.local.id,metodoEntrega:'RECOGER',productos:[{productoId:e.producto.id,cantidad:1}]}});expect(compra.status()).toBe(201);const negativo=await compra.json();
  const campos=estado==='CANCELADO'?",cancelado_en=now(),motivo_cancelacion='Fixture CU014'":estado==='EXPIRADO'?",creado_en=now()-interval '20 minutes',expira_en=now()-interval '1 minute'":estado==='CONFIRMADO'?",confirmado_en=now()":'';
  sql(`UPDATE alimentos.pedidos SET estado='${estado}',codigo_qr=encode(extensiones.digest(id::text,'sha256'),'hex')${campos} WHERE id='${negativo.id}'`);
  const codigo=sql(`SELECT codigo_qr FROM alimentos.pedidos WHERE id='${negativo.id}'`);expect((await prevalidar(codigo)).status()).toBe(409);expect((await confirmar({...datos,pedidoId:negativo.id,version:0,codigoQr:codigo})).status()).toBe(409);
 }
 const id=randomUUID();const dos=await Promise.all([confirmar(datos,id),confirmar(datos)]);expect(dos.map(r=>r.status()).sort()).toEqual([200,409]);
 const ganadora=dos.find(r=>r.status()===200)!;const entregada=await ganadora.json();
 // La respuesta pudo perderse: recuperar la misma operación sin almacenar el secreto.
 const recuperada=await confirmar({pedidoId:p.id,version:datos.version,puntoRevision:datos.puntoRevision},entregada.id);expect(recuperada.status()).toBe(200);expect(await recuperada.json()).toEqual(entregada);
 expect((await confirmar(datos)).status()).toBe(409);expect((await prevalidar()).status()).toBe(409);
 expect(sql(`SELECT count(*) FROM alimentos.entregas_pedido WHERE pedido_id='${p.id}'`)).toBe('1');expect(sql(`SELECT count(*) FROM alimentos.historial_preparacion WHERE pedido_id='${p.id}' AND accion='ENTREGAR'`)).toBe('1');
 const repetido=await request.post(`${gateway}/pedidos/${p.id}/pagos`,{headers:h(e.cliente.token,c.clave),data:{tokenPago:'tok_ok_cu014'}});expect(repetido.status()).toBe(200);const pago=await repetido.json();expect(pago.codigoQr).toBe(c.pago.codigoQr);expect(pago.transaccionId).toBe(c.pago.transaccionId);expect(pago.qrUtilizable).toBe(false);
 expect(sql(`SELECT row_to_json(t) FROM finanzas_pagos.transacciones_pago t WHERE clave_idempotencia='${c.clave}'`)).toBe(libro);expect(snapshot(p.id)).toEqual(antes);expect(sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}'`)).toBe('29');
 const rutaCliente=`${gateway}/pedidos/mis-pedidos/${p.id}`;const durable=await(await request.get(rutaCliente,{headers:h(e.cliente.token)})).json();expect(durable.estadoOperativo).toBe('ENTREGADO');expect(durable.codigoQr).toBeNull();expect(durable.avisos.filter((a:{accion:string})=>a.accion==='ENTREGAR')).toHaveLength(1);
 controlarNucleo('parar');controlarNucleo('iniciar');const despues=await request.get(rutaCliente,{headers:h(e.cliente.token)});expect(despues.status()).toBe(200);expect(await despues.json()).toEqual(durable);
 expect((await request.delete(`${gateway}/pedidos/admin/establecimientos/${e.local.id}/personal/${e.personal.usuario.id}`,{headers:h(e.organizador.token)})).status()).toBe(204);expect((await confirmar(datos,entregada.id)).status()).toBe(403);
});

test('CU-014 autorización en transacción: cuenta desactivada y vínculo revocado después de admitir la petición',async({request})=>{
 const e=await entornoEntrega(request),compra=await comprar(request,e);await listo(request,e,compra.pedido.id);
 const admin=await loginAPI(request,'admin@hexacore.com');const email=`cu014-${randomUUID()}@example.test`;
 const registro=await request.post(`${gateway}/cuentas/registro`,{data:{nombre:'Personal propio CU014',email,contrasena:process.env.CU015_CLAVE_DEMO}});expect(registro.status()).toBe(202);
 const actorId=sql(`SELECT id FROM identidad.usuarios WHERE email='${email}'`);expect(actorId).toMatch(/^[a-f0-9-]{36}$/);
 expect((await request.post(`${gateway}/admin/cuentas/${actorId}/activar`,{headers:h(admin.token),data:{motivo:'Cuenta propia de prueba CU014'}})).status()).toBe(200);
 // Asignación de un rol fijo existente a una cuenta fixture propia; no implementa CU-028.
 sql(`INSERT INTO identidad.usuarios_roles(usuario_id,rol_id,asignado_por) SELECT '${actorId}',id,'${admin.usuario.id}' FROM identidad.roles WHERE nombre='Personal'`);
 expect((await request.put(`${gateway}/pedidos/admin/establecimientos/${e.local.id}/personal/${actorId}`,{headers:h(e.organizador.token)})).status()).toBe(200);
 let actor=await loginAPI(request,email);
 const destino=`${gateway}/pedidos/establecimientos/${e.local.id}/entregas`;
 const previa=await request.post(`${destino}/prevalidar`,{headers:h(actor.token),data:{codigoQr:compra.pago.codigoQr}});expect(previa.status()).toBe(200);const v=await previa.json();
 const datos={pedidoId:compra.pedido.id,version:v.version,puntoRevision:v.puntoRevision,codigoQr:compra.pago.codigoQr};
 const {execFileSync}=require('node:child_process');const {resolve}=require('node:path');const {Client}=require('../../backend/node_modules/pg');
 const config=JSON.parse(execFileSync('python3',[resolve(__dirname,'../../infra/revision/revision.py'),'--perfil','cu015','config'],{encoding:'utf8'}));expect(config.name).toBe('hexacore-cu015-sebastian');
 const env=config.services.nucleo.environment;const opciones={host:'127.0.0.1',port:15459,database:'hexacore_cu015',user:env.POSTGRES_USUARIO,password:env.POSTGRES_CONTRASENA,connectionTimeoutMillis:3000,query_timeout:3000,statement_timeout:3000,application_name:'cu014-carrera-autorizacion'};
 const bloqueo=new Client(opciones),observador=new Client(opciones);await bloqueo.connect();await observador.connect();
 try{
  const pid=(await bloqueo.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  for(const tipo of ['cuenta','vinculo']){
   if(tipo==='vinculo'){
    expect((await request.post(`${gateway}/admin/cuentas/${actorId}/activar`,{headers:h(admin.token),data:{motivo:'Restaurar fixture propio para segunda carrera'}})).status()).toBe(200);actor=await loginAPI(request,email);
   }
   await bloqueo.query('BEGIN');
   try{
    if(tipo==='cuenta')await bloqueo.query("UPDATE identidad.usuarios SET estado='DESACTIVADA' WHERE id=$1",[actorId]);
    else await bloqueo.query('DELETE FROM alimentos.personal_establecimiento WHERE establecimiento_id=$1 AND usuario_id=$2',[e.local.id,actorId]);
    // Las guardas leen la versión anterior por MVCC; la confirmación debe esperar la fila bloqueada.
    const respuesta=request.post(`${destino}/confirmar`,{headers:h(actor.token,randomUUID()),data:datos});
    await expect.poll(async()=>Number((await observador.query("SELECT count(*) n FROM pg_stat_activity WHERE application_name='nucleo-alimentos' AND $1=ANY(pg_blocking_pids(pid))",[pid])).rows[0].n)).toBeGreaterThan(0);
    await bloqueo.query('COMMIT');expect((await respuesta).status()).toBe(403);
   }finally{await bloqueo.query('ROLLBACK');}
   expect(sql(`SELECT count(*) FROM alimentos.entregas_pedido WHERE pedido_id='${compra.pedido.id}'`)).toBe('0');
   expect(sql(`SELECT version FROM alimentos.preparaciones_pedido WHERE pedido_id='${compra.pedido.id}'`)).toBe('2');
  }
 }finally{await bloqueo.end();await observador.end();}
});
