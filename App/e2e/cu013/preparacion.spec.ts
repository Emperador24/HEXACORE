import { APIRequestContext, expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { adminURL, clienteURL, comprobarAislamiento, crearEvento, gateway, loginAPI, loginUI, nucleo, sql } from '../cu015/entorno';
const { nucleo: controlarNucleo } = require('../../backend/test/cu012/entorno.cjs') as { nucleo(accion: 'parar' | 'iniciar'): void };
const h = (token: string, id?: string) => ({ Authorization: `Bearer ${token}`, ...(id ? {'Idempotency-Key':id} : {}) });
test.beforeAll(comprobarAislamiento);
async function entorno(api: APIRequestContext, cantidad = 20) {
 const organizador=await loginAPI(api,'organizador@hexacore.com'), personal=await loginAPI(api,'restaurante@hexacore.com'), cliente=await loginAPI(api,'cliente@hexacore.com');
 const nombre=`CU013 ${randomUUID().slice(0,8)}`, evento=await crearEvento(api,organizador.token,`Evento ${nombre}`);
 const r=await api.post(`${gateway}/pedidos/admin/establecimientos`,{headers:h(organizador.token),data:{eventoId:evento.id,nombre,contacto:'Contacto CU013',puntoEntrega:'Puerta CU013',horaApertura:'00:00',horaCierre:'00:00',zonaHoraria:'America/Bogota',estado:'DISPONIBLE'}});
 expect(r.status()).toBe(201);const local=await r.json();
 expect((await api.put(`${gateway}/pedidos/admin/establecimientos/${local.id}/personal/${personal.usuario.id}`,{headers:h(organizador.token)})).status()).toBe(200);
 const alta=await api.post(`${gateway}/pedidos/establecimientos/${local.id}/productos`,{headers:h(personal.token,randomUUID()),data:{nombre:'Receta CU013',descripcion:'Descripción acordada',precio:'1000.25',restriccionesAlimentarias:['leche'],activo:true,cantidadInicial:cantidad}});
 expect(alta.status()).toBe(201);const datos=await alta.json();expect(datos.operacion.estado).toBe('APLICADA');
 return {organizador,personal,cliente,evento,local,producto:datos.producto,nombre};
}
function snapshots(pedido: string) {
 return {pedido:sql(`SELECT row_to_json(p) FROM alimentos.pedidos p WHERE id='${pedido}';`),
  detalles:sql(`SELECT json_agg(d ORDER BY d.id) FROM alimentos.detalles_pedido d WHERE pedido_id='${pedido}';`)};
}

test('CU-013 por interfaces: compra, preparación, retraso, incidencia, listo y recuperación de QR y avisos',async({page,browser,request},info)=>{
 const e=await entorno(request,2);
 await loginUI(page,clienteURL,'cliente@hexacore.com');await page.goto(`${clienteURL}/pedidos?eventoId=${e.evento.id}`);
 await page.getByRole('link').filter({hasText:e.nombre}).click();
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Agregar Receta CU013',exact:true}).click();
 const checkout=page.waitForResponse(r=>r.url().endsWith('/pedidos/checkout'));await page.getByRole('button',{name:'Continuar',exact:true}).click();
 const compra=await checkout;expect(compra.status()).toBe(201);const pedido=await compra.json();
 const cobrar=page.waitForResponse(r=>r.url().endsWith(`/pedidos/${pedido.id}/pagos`));await page.getByRole('button',{name:'Pagar pedido',exact:true}).click();
 const pago=await cobrar;expect(pago.status()).toBe(200);const pagado=await pago.json();expect(pagado.compraConfirmada).toBe(true);
 await expect(page.getByRole('heading',{name:'¡Tu pedido está confirmado!'})).toBeVisible();
 const anterior=snapshots(pedido.id);
 await page.getByRole('link',{name:'Ver seguimiento y avisos',exact:true}).click();
 await expect(page).toHaveURL(`${clienteURL}/mis-pedidos/${pedido.id}`);
 await expect(page.getByAltText('Código QR del pedido confirmado')).toBeVisible();
 const qrImagen=await page.getByAltText('Código QR del pedido confirmado').getAttribute('src');
 await page.reload();await expect(page.getByAltText('Código QR del pedido confirmado')).toHaveAttribute('src',qrImagen!);
 const ctx=await browser.newContext(),operador=await ctx.newPage();
 try {
  await loginUI(operador,adminURL,'restaurante@hexacore.com');
  await operador.getByRole('navigation').getByRole('link',{name:'Preparación de pedidos',exact:true}).click();
  await expect(operador).toHaveURL(`${adminURL}/admin/preparacion`);
  await operador.getByLabel('Establecimiento vinculado',{exact:true}).selectOption(e.local.id);
  const fila=operador.locator(`[data-pedido="${pedido.id}"]`);await fila.getByRole('button',{name:'Gestionar pedido',exact:true}).click();
  const detalle=operador.getByRole('region',{name:'Detalle de preparación'});
  // La bandeja no confunde disponible cero después de vender con un faltante.
  expect(sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}';`)).toBe('0');
  await expect(operador.locator('app-qr-pedido')).toHaveCount(0);
  expect((await operador.locator('body').innerText())).not.toContain(pagado.codigoQr);
  expect((await request.patch(`${gateway}/pedidos/admin/establecimientos/${e.local.id}/estado`,{headers:h(e.organizador.token),data:{estado:'CERRADO'}})).status()).toBe(200);
  await operador.getByRole('button',{name:'Actualizar pedidos',exact:true}).click();
  await detalle.getByRole('button',{name:'Iniciar preparación',exact:true}).click();
  await operador.getByLabel('Minutos estimados',{exact:true}).fill('10');
  const avisoAutomatico=page.waitForResponse(async r=>{
   // Si falla el listado previo, la pantalla pausa su sondeo y no habrá detalle.
   if(r.url().endsWith('/pedidos/mis-pedidos') && r.status()>=400)return true;
   if(!r.url().endsWith(`/pedidos/mis-pedidos/${pedido.id}`))return false;
   if(r.status()!==200)return true;
   return (await r.json()).preparacion.estado==='EN_PREPARACION';
  });
  let cambio=operador.waitForResponse(r=>r.url().endsWith(`/${pedido.id}/preparacion`));await operador.getByRole('button',{name:'Guardar avance',exact:true}).click();
  let respuesta=await cambio;expect(respuesta.status()).toBe(200);const inicio=await respuesta.json();
  expect((await avisoAutomatico).status()).toBe(200);
  await expect(page.getByText('Tu pedido está en preparación.',{exact:false})).toBeVisible();
  await detalle.getByRole('button',{name:'Registrar retraso',exact:true}).click();
  await operador.getByLabel('Minutos adicionales',{exact:true}).fill('5');await operador.getByLabel('Motivo o resolución',{exact:true}).fill('Demora de cocción CU013');
  cambio=operador.waitForResponse(r=>r.url().endsWith(`/${pedido.id}/preparacion`));await operador.getByRole('button',{name:'Guardar avance',exact:true}).click();
  respuesta=await cambio;expect(respuesta.status()).toBe(200);const retraso=await respuesta.json();
  expect(Date.parse(retraso.preparacion.estimadoListoEn)-Date.parse(inicio.preparacion.estimadoListoEn)).toBe(300000);
  await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();await expect(page.getByText(/La preparación tiene un retraso: Demora de cocción CU013/)).toBeVisible();
  await detalle.getByRole('button',{name:'Reportar incidencia',exact:true}).click();await operador.getByLabel('Motivo o resolución',{exact:true}).fill('Faltante detectado durante preparación');
  cambio=operador.waitForResponse(r=>r.url().endsWith(`/${pedido.id}/preparacion`));await operador.getByRole('button',{name:'Guardar avance',exact:true}).click();expect((await cambio).status()).toBe(200);
  await expect(detalle.getByRole('button',{name:'Marcar listo',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();await expect(page.getByText(/El establecimiento reportó una incidencia: Faltante/)).toBeVisible();
  await detalle.getByRole('button',{name:'Resolver incidencia',exact:true}).click();await operador.getByLabel('Motivo o resolución',{exact:true}).fill('Disponibles los productos acordados');
  cambio=operador.waitForResponse(r=>r.url().endsWith(`/${pedido.id}/preparacion`));await operador.getByRole('button',{name:'Guardar avance',exact:true}).click();expect((await cambio).status()).toBe(200);
  cambio=operador.waitForResponse(r=>r.url().endsWith(`/${pedido.id}/preparacion`));await detalle.getByRole('button',{name:'Marcar listo',exact:true}).click();
  respuesta=await cambio;expect(respuesta.status()).toBe(200);expect((await respuesta.json()).preparacion.estado).toBe('LISTO_PARA_ENTREGAR');
  await page.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();await expect(page.locator('[data-avance]')).toHaveText('Listo para entregar');
  await page.reload();await expect(page.locator('[data-avance]')).toHaveText('Listo para entregar');await expect(page.getByAltText('Código QR del pedido confirmado')).toHaveAttribute('src',qrImagen!);
  const nuevaSesion=await browser.newContext();
  try {
   const regreso=await nuevaSesion.newPage();await loginUI(regreso,clienteURL,'cliente@hexacore.com');
   await regreso.goto(`${clienteURL}/mis-pedidos/${pedido.id}`);
   await expect(regreso.locator('[data-avance]')).toHaveText('Listo para entregar');
   await expect(regreso.getByAltText('Código QR del pedido confirmado')).toHaveAttribute('src',qrImagen!);
   await expect(regreso.getByText(/La preparación tiene un retraso: Demora de cocción CU013/)).toBeVisible();
  }finally{await nuevaSesion.close();}
  expect(sql(`SELECT count(*) FROM alimentos.historial_preparacion WHERE pedido_id='${pedido.id}';`)).toBe('5');
  expect(snapshots(pedido.id)).toEqual(anterior);
  expect(sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}';`)).toBe('0');
  await operador.screenshot({path:info.outputPath('preparacion-lista.png'),fullPage:true});await page.screenshot({path:info.outputPath('cliente-avisos.png'),fullPage:true});
  expect((await request.delete(`${gateway}/pedidos/admin/establecimientos/${e.local.id}/personal/${e.personal.usuario.id}`,{headers:h(e.organizador.token)})).status()).toBe(204);
  await operador.getByRole('button',{name:'Actualizar pedidos',exact:true}).click();await expect(operador.getByRole('alert')).toContainText('vinculada');
 }finally{await ctx.close();}
});

test('CU-013 API: concurrencia, pagos repetidos, cancelados, alcance y reinicio con avisos durables',async({request})=>{
 const e=await entorno(request),bruno=await loginAPI(request,'bruno@hexacore.com');
 const base=`${gateway}/pedidos/establecimientos/${e.local.id}/pedidos`;
 const comprar=async()=>{const r=await request.post(`${gateway}/pedidos/checkout`,{headers:h(e.cliente.token),data:{eventoId:e.evento.id,establecimientoId:e.local.id,metodoEntrega:'RECOGER',productos:[{productoId:e.producto.id,cantidad:1}]}});expect(r.status()).toBe(201);return r.json();};
 const p=await comprar(),clavePago=randomUUID();
 const pagar=()=>request.post(`${gateway}/pedidos/${p.id}/pagos`,{headers:h(e.cliente.token,clavePago),data:{tokenPago:'tok_ok_cu013'}});
 const pagor=await pagar();expect(pagor.status()).toBe(200);const pago=await pagor.json();expect(pago.compraConfirmada).toBe(true);
 const anteriores=snapshots(p.id),libro=sql(`SELECT row_to_json(t) FROM finanzas_pagos.transacciones_pago t WHERE clave_idempotencia='${clavePago}';`);
 const operar=(datos:Record<string,unknown>,clave=randomUUID(),pedido=p.id)=>request.post(`${base}/${pedido}/preparacion`,{headers:h(e.personal.token,clave),data:datos});
 for(const destino of [gateway,nucleo]){
  expect((await request.get(`${destino}/pedidos/establecimientos/${e.local.id}/pedidos`)).status()).toBe(401);
  expect((await request.post(`${destino}/pedidos/establecimientos/${e.local.id}/pedidos/${p.id}/preparacion`,{headers:h(e.cliente.token,randomUUID()),data:{accion:'INICIAR',version:0,minutos:10}})).status()).toBe(403);
 }
 expect((await request.get(`${gateway}/pedidos/mis-pedidos/${p.id}`,{headers:h(bruno.token)})).status()).toBe(404);
 expect((await request.get(`${gateway}/pedidos/mis-pedidos/${p.id}`,{headers:h(e.personal.token)})).status()).toBe(403);
 for(const datos of [{accion:'INICIAR',version:0,minutos:null},{accion:'INICIAR',version:0,minutos:0},{accion:'INICIAR',version:0,minutos:241},{accion:'INICIAR',version:-1,minutos:10},{accion:'ENTREGAR',version:0},{accion:'INICIAR',version:0,minutos:10,pagoVerificado:true}])expect((await operar(datos)).status()).toBe(400);
 const iniciar={accion:'INICIAR',version:0,minutos:10},id=randomUUID();
 const dos=await Promise.all([operar(iniciar,id),operar(iniciar,id)]);expect(dos.map(r=>r.status())).toEqual([200,200]);const inicio=await dos[0].json();expect(await dos[1].json()).toEqual(inicio);
 expect(sql(`SELECT count(*) FROM alimentos.historial_preparacion WHERE pedido_id='${p.id}';`)).toBe('1');
 expect((await operar({...iniciar,minutos:11},id)).status()).toBe(409);
 const retardos=await Promise.all([operar({accion:'RETRASAR',version:1,minutos:5,motivo:'Demora uno'}),operar({accion:'RETRASAR',version:1,minutos:7,motivo:'Demora dos'})]);
 expect(retardos.map(r=>r.status()).sort()).toEqual([200,409]);
 const actual=(await (await request.get(`${base}/${p.id}`,{headers:h(e.personal.token)})).json()).preparacion;
 expect(actual.version).toBe(2);expect([300000,420000]).toContain(Date.parse(actual.estimadoListoEn)-Date.parse(inicio.preparacion.estimadoListoEn));
 const replayPreparando=await pagar();expect(replayPreparando.status()).toBe(200);expect((await replayPreparando.json()).codigoQr).toBe(pago.codigoQr);
 expect(snapshots(p.id)).toEqual(anteriores);
 for(const estado of ['PENDIENTE_PAGO','EXPIRADO','CANCELADO','CONFIRMADO']){
  const otro=await comprar();
  if(estado!=='PENDIENTE_PAGO')sql(`UPDATE alimentos.pedidos SET estado='${estado}',${estado==='CONFIRMADO'?`confirmado_en=now(),codigo_qr='fixture-sin-pago-${otro.id}'`:estado==='CANCELADO'?"cancelado_en=now(),motivo_cancelacion='Fixture conservador sin política implementada'":"creado_en=now()-interval '20 minutes',expira_en=now()-interval '1 minute'"} WHERE id='${otro.id}';`);
  expect((await operar(iniciar,randomUUID(),otro.id)).status()).toBe(409);
 }
 const ajeno=await request.post(`${gateway}/pedidos/admin/establecimientos`,{headers:h(e.organizador.token),data:{eventoId:e.evento.id,nombre:`Ajeno ${randomUUID()}`,contacto:'Contacto',puntoEntrega:'Puerta',horaApertura:'00:00',horaCierre:'00:00',zonaHoraria:'America/Bogota',estado:'DISPONIBLE'}});expect(ajeno.status()).toBe(201);const otroLocal=await ajeno.json();
 expect((await request.post(`${gateway}/pedidos/establecimientos/${otroLocal.id}/pedidos/${p.id}/preparacion`,{headers:h(e.personal.token,randomUUID()),data:{accion:'LISTO',version:2}})).status()).toBe(403);
 expect((await request.put(`${gateway}/pedidos/admin/establecimientos/${otroLocal.id}/personal/${e.personal.usuario.id}`,{headers:h(e.organizador.token)})).status()).toBe(200);
 expect((await request.get(`${gateway}/pedidos/establecimientos/${otroLocal.id}/pedidos/${p.id}`,{headers:h(e.personal.token)})).status()).toBe(404);
 expect((await operar({accion:'INCIDENCIA',version:2,motivo:'Producto fuera del detalle',productoId:randomUUID()})).status()).toBe(400);
 const incidencia=randomUUID();expect((await operar({accion:'INCIDENCIA',version:2,motivo:'Falta un ingrediente acordado',productoId:e.producto.id},incidencia)).status()).toBe(200);
 expect((await operar({accion:'LISTO',version:3})).status()).toBe(409);
 expect((await operar({accion:'RESOLVER_INCIDENCIA',version:3,motivo:'Los productos acordados están completos',incidenciaId:incidencia})).status()).toBe(200);
 const finId=randomUUID(),finDatos={accion:'LISTO',version:4};const listo=await operar(finDatos,finId);expect(listo.status()).toBe(200);const final=await listo.json();expect(final.preparacion.estado).toBe('LISTO_PARA_ENTREGAR');
 expect(await (await operar(finDatos,finId)).json()).toEqual(final);
 expect((await operar({accion:'INICIAR',version:5,minutos:10})).status()).toBe(409);
 const replayListo=await pagar();expect(replayListo.status()).toBe(200);expect((await replayListo.json()).codigoQr).toBe(pago.codigoQr);
 expect(sql(`SELECT row_to_json(t) FROM finanzas_pagos.transacciones_pago t WHERE clave_idempotencia='${clavePago}';`)).toBe(libro);
 expect(sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}';`)).toBe('19');expect(snapshots(p.id)).toEqual(anteriores);
 // Más de una página no debe ocultar un confirmado histórico ni exponer pedidos ajenos.
 // Filas propias de lectura: no simulan cobros ni consumos de inventario.
 sql(`INSERT INTO alimentos.pedidos (id,cliente_id,establecimiento_id,metodo_entrega,estado,total,moneda,expira_en,confirmado_en,codigo_qr)
 SELECT gen_random_uuid(),'${e.cliente.usuario.id}','${e.local.id}','RECOGER','CONFIRMADO',1000.25,'COP',now()+interval '10 minutes',now(),'fixture-pagina-'||gen_random_uuid() FROM generate_series(1,100);`);
 for(const [ruta,token] of [[base,e.personal.token],[`${gateway}/pedidos/mis-pedidos`,e.cliente.token]]){
  const primera=await request.get(ruta,{headers:h(token)});expect(primera.status()).toBe(200);const ultimos=await primera.json();expect(ultimos).toHaveLength(100);expect(ultimos.some((x:{id:string})=>x.id===p.id)).toBe(false);
  const siguiente=await request.get(`${ruta}?pagina=1`,{headers:h(token)});expect(siguiente.status()).toBe(200);expect((await siguiente.json()).some((x:{id:string})=>x.id===p.id)).toBe(true);
  for(const pagina of ['-1','1.5','texto'])expect((await request.get(`${ruta}?pagina=${pagina}`,{headers:h(token)})).status()).toBe(400);
 }
 const antesReinicio=await request.get(`${gateway}/pedidos/mis-pedidos/${p.id}`,{headers:h(e.cliente.token)});expect(antesReinicio.status()).toBe(200);const durable=await antesReinicio.json();expect(durable.avisos).toHaveLength(5);expect(durable.codigoQr).toBe(pago.codigoQr);
 expect(JSON.stringify(durable.avisos)).not.toContain('actorId');
 const personal=await request.get(`${base}/${p.id}`,{headers:h(e.personal.token)});expect(personal.status()).toBe(200);expect(JSON.stringify(await personal.json())).not.toContain(pago.codigoQr);
 controlarNucleo('parar');controlarNucleo('iniciar');
 const despues=await request.get(`${gateway}/pedidos/mis-pedidos/${p.id}`,{headers:h(e.cliente.token)});expect(despues.status()).toBe(200);expect(await despues.json()).toEqual(durable);
 expect((await request.delete(`${gateway}/pedidos/admin/establecimientos/${e.local.id}/personal/${e.personal.usuario.id}`,{headers:h(e.organizador.token)})).status()).toBe(204);
 expect((await operar(finDatos,finId)).status()).toBe(403);
});
