import { expect, Page, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { adminURL, clienteURL, comprobarAislamiento, crearEvento, gateway, loginAPI, loginUI, nucleo, sql } from '../cu015/entorno';

test.beforeAll(comprobarAislamiento);
const headers = (token: string, clave?: string) => ({ Authorization: `Bearer ${token}`, ...(clave ? { 'Idempotency-Key': clave } : {}) });
const ficha = (eventoId: string, nombre: string) => ({ eventoId, nombre, contacto:'Contacto CU012', puntoEntrega:'Puerta CU012', horaApertura:'00:00', horaCierre:'00:00', zonaHoraria:'America/Bogota', estado:'DISPONIBLE' });
const datosProducto = (nombre: string, cantidadInicial = 10) => ({ nombre, descripcion:'Receta original', precio:'1500.25', restriccionesAlimentarias:['contiene leche'], activo:true, cantidadInicial });

async function llenarProducto(page: Page, nombre: string, cantidad = 10) {
  await page.getByLabel('Nombre del producto',{exact:true}).fill(nombre);
  await page.getByLabel('Precio COP',{exact:true}).fill('1500.25');
  await page.getByLabel('Descripción',{exact:true}).fill('Receta original');
  await page.getByLabel('Restricciones alimentarias',{exact:true}).fill('contiene leche');
  if (await page.getByLabel('Existencias físicas iniciales',{exact:true}).count()) await page.getByLabel('Existencias físicas iniciales',{exact:true}).fill(String(cantidad));
}

test('CU-012 por interfaces: asignar Personal, crear, reservar, ajustar, pagar y conservar snapshots', async ({page,browser,request}, info) => {
  const organizador = await loginAPI(request,'organizador@hexacore.com');
  const personal = await loginAPI(request,'restaurante@hexacore.com');
  const nombre = `CU012 ${randomUUID().slice(0,8)}`;
  const evento = await crearEvento(request,organizador.token,`Evento ${nombre}`);
  const creada = await request.post(`${gateway}/pedidos/admin/establecimientos`,{headers:headers(organizador.token),data:ficha(evento.id,nombre)});
  expect(creada.status()).toBe(201); const local = await creada.json();
  await loginUI(page,adminURL,'organizador@hexacore.com');
  await page.goto(`${adminURL}/admin/establecimientos?eventoId=${evento.id}`);
  const filaLocal = page.getByRole('row').filter({hasText:nombre});
  await filaLocal.getByRole('button',{name:'Personal',exact:true}).click();
  await page.getByLabel('Buscar personal por nombre o correo').fill('restaurante@hexacore.com');
  await page.getByRole('button',{name:'Buscar personal',exact:true}).click();
  await expect(page.getByLabel('Cuenta Personal activa',{exact:true}).locator('option')).toHaveCount(2);
  await page.getByLabel('Cuenta Personal activa',{exact:true}).selectOption(personal.usuario.id);
  await page.getByRole('button',{name:'Asignar personal',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Personal asignado');

  const ctx = await browser.newContext(), clienteCtx = await browser.newContext();
  const operador = await ctx.newPage(), comprador = await clienteCtx.newPage();
  try {
    await loginUI(operador,adminURL,'restaurante@hexacore.com');
    await expect(operador).toHaveURL(/\/admin\/menu$/);
    await expect(operador.getByRole('navigation').getByRole('link',{name:'Cuentas',exact:true})).toHaveCount(0);
    await expect(operador.getByRole('navigation').getByRole('link',{name:'Roles y permisos',exact:true})).toHaveCount(0);
    for (const ruta of ['cuentas','roles','establecimientos','eventos','pagos']) {
      await operador.goto(`${adminURL}/admin/${ruta}`); await expect(operador).toHaveURL(/\/admin\/menu$/);
    }
    expect((await request.get(`${gateway}/admin/cuentas`,{headers:headers(personal.token)})).status()).toBe(403);
    await operador.getByLabel('Establecimiento vinculado',{exact:true}).selectOption(local.id);
    await operador.getByRole('button',{name:'Nuevo producto',exact:true}).click();
    await expect(operador.getByRole('button',{name:'Guardar producto',exact:true})).toBeDisabled();
    const productoNombre = `${nombre} Hamburguesa`;
    await llenarProducto(operador,productoNombre);
    const alta = operador.waitForResponse(r=>r.url().endsWith(`/establecimientos/${local.id}/productos`) && r.request().method()==='POST');
    await operador.getByRole('button',{name:'Guardar producto',exact:true}).click();
    const respuesta = await alta; expect(respuesta.status()).toBe(201);
    const registro = await respuesta.json(); expect(registro.operacion.estado).toBe('APLICADA');
    const producto = registro.producto;
    const fila = operador.locator(`[data-producto="${producto.id}"]`);
    await expect(fila.locator('[data-cantidad="fisica"]')).toHaveText('10');
    await expect(fila.locator('[data-cantidad="disponible"]')).toHaveText('10');
    await operador.getByRole('button',{name:'Nuevo producto',exact:true}).click();
    await llenarProducto(operador,productoNombre);
    await operador.getByRole('button',{name:'Guardar producto',exact:true}).click();
    await expect(operador.getByRole('alert')).toContainText('ya está registrado');
    await operador.getByRole('button',{name:'Cancelar producto',exact:true}).click();

    await loginUI(comprador,clienteURL,'cliente@hexacore.com');
    await comprador.goto(`${clienteURL}/pedidos?eventoId=${evento.id}`);
    await comprador.getByRole('link').filter({hasText:nombre}).click();
    await expect(comprador.getByText('contiene leche',{exact:true})).toBeVisible();
    for (let i=0;i<3;i++) await comprador.getByRole('button',{name:`Agregar ${productoNombre}`,exact:true}).click();
    const checkout = comprador.waitForResponse(r=>r.url().endsWith('/pedidos/checkout'));
    await comprador.getByRole('button',{name:'Continuar',exact:true}).click();
    const pedidoRespuesta=await checkout; expect(pedidoRespuesta.status()).toBe(201);
    const pedido=await pedidoRespuesta.json(); expect(pedido.total).toBe('4500.75');
    await operador.getByRole('button',{name:'Actualizar menú',exact:true}).click();
    await expect(fila.locator('[data-cantidad="reservada"]')).toHaveText('3');
    await expect(fila.locator('[data-cantidad="disponible"]')).toHaveText('7');
    await fila.getByRole('button',{name:'Ajustar existencias',exact:true}).click();
    await operador.getByLabel('Variación de existencias',{exact:true}).fill('-8');
    await operador.getByLabel('Motivo del ajuste',{exact:true}).fill('Merma que excede disponibilidad');
    await operador.getByRole('button',{name:'Aplicar ajuste',exact:true}).click();
    await expect(operador.getByRole('alert')).toContainText('cantidades comprometidas');
    await expect(fila.locator('[data-cantidad="fisica"]')).toHaveText('10');
    await fila.getByRole('button',{name:'Ajustar existencias',exact:true}).click();
    await operador.getByLabel('Variación de existencias',{exact:true}).fill('2');
    await operador.getByLabel('Motivo del ajuste',{exact:true}).fill('Reposición con reserva activa');
    await operador.getByRole('button',{name:'Aplicar ajuste',exact:true}).click();
    await expect(fila.locator('[data-cantidad="fisica"]')).toHaveText('12');
    await expect(fila.locator('[data-cantidad="disponible"]')).toHaveText('9');
    await operador.getByRole('button',{name:'Nuevo producto',exact:true}).click();
    await llenarProducto(operador,`${nombre} Adicional`,4);
    const adicional=operador.waitForResponse(r=>r.url().endsWith(`/establecimientos/${local.id}/productos`) && r.request().method()==='POST');
    await operador.getByRole('button',{name:'Guardar producto',exact:true}).click();
    const respuestaAdicional=await adicional;expect(respuestaAdicional.status()).toBe(201);
    const altaAdicional=await respuestaAdicional.json();
    expect(altaAdicional.operacion.estado).toBe('APLICADA');
    expect(altaAdicional.producto.id).not.toBe(producto.id);
    await expect(fila.locator('[data-cantidad="disponible"]')).toHaveText('9');
    await fila.getByRole('button',{name:'Editar',exact:true}).click();
    await llenarProducto(operador,`${nombre} Nueva receta`);
    await operador.getByLabel('Precio COP',{exact:true}).fill('2000.50');
    await operador.getByLabel('Descripción',{exact:true}).fill('Receta cambiada');
    await operador.getByLabel('Restricciones alimentarias',{exact:true}).fill('contiene gluten');
    await operador.getByLabel('Activo para nuevos pedidos',{exact:true}).uncheck();
    await operador.getByRole('button',{name:'Guardar producto',exact:true}).click();
    await expect(fila).toContainText('Inactivo');
    await comprador.getByRole('button',{name:'Pagar pedido',exact:true}).click();
    await expect(comprador.getByRole('heading',{name:'¡Tu pedido está confirmado!'})).toBeVisible();
    await expect(comprador.getByAltText('Código QR del pedido confirmado')).toBeVisible();
    await operador.getByRole('button',{name:'Actualizar menú',exact:true}).click();
    await expect(fila.locator('[data-cantidad="fisica"]')).toHaveText('9');
    await expect(fila.locator('[data-cantidad="reservada"]')).toHaveText('0');
    await expect(fila.locator('[data-cantidad="disponible"]')).toHaveText('9');
    expect(sql(`SELECT nombre_producto||'|'||precio_unitario||'|'||descripcion_producto||'|'||restricciones_alimentarias::text FROM alimentos.detalles_pedido WHERE pedido_id='${pedido.id}';`)).toBe(`${productoNombre}|1500.25|Receta original|["contiene leche"]`);
    await comprador.goto(`${clienteURL}/pedidos?eventoId=${evento.id}`);
    await comprador.getByRole('link').filter({hasText:nombre}).click();
    await expect(comprador.getByRole('heading',{name:`${nombre} Nueva receta`,exact:true})).toHaveCount(0);
    await fila.getByRole('button',{name:'Activar',exact:true}).click();
    await comprador.reload();
    await expect(comprador.getByRole('heading',{name:`${nombre} Nueva receta`,exact:true})).toBeVisible();
    await operador.screenshot({path:info.outputPath('menu-cu012.png'),fullPage:true});
    await info.attach('Menú CU-012', {path:info.outputPath('menu-cu012.png'),contentType:'image/png'});

    await filaLocal.getByRole('button',{name:'Deshabilitar',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('deshabilitado');
    await operador.reload();
    await operador.getByLabel('Establecimiento vinculado',{exact:true}).selectOption(local.id);
    await expect(fila).toContainText('Nueva receta');
    await fila.getByRole('button',{name:'Editar',exact:true}).click();
    await operador.getByLabel('Descripción',{exact:true}).fill('Gestión permitida durante cierre');
    await operador.getByRole('button',{name:'Guardar producto',exact:true}).click();
    await expect(fila).toContainText('Gestión permitida durante cierre');
    await page.getByRole('button',{name:'Revocar restaurante@hexacore.com',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('revocado');
    await operador.getByRole('button',{name:'Actualizar menú',exact:true}).click();
    await expect(operador.getByRole('alert')).toContainText('vinculada');
  } finally { await Promise.allSettled([ctx.close(), clienteCtx.close()]); }
});

test('CU-012 API real: límites, alcance, replay y concurrencia con compra, pago y expiración', async ({request}) => {
  const organizador=await loginAPI(request,'organizador@hexacore.com'), personal=await loginAPI(request,'restaurante@hexacore.com'), cliente=await loginAPI(request,'cliente@hexacore.com');
  const evento=await crearEvento(request,organizador.token,`CU012 concurrencia ${randomUUID().slice(0,8)}`);
  const r=await request.post(`${gateway}/pedidos/admin/establecimientos`,{headers:headers(organizador.token),data:ficha(evento.id,`CU012 API ${randomUUID()}`)});
  expect(r.status()).toBe(201);const local=await r.json();
  expect((await request.put(`${gateway}/pedidos/admin/establecimientos/${local.id}/personal/${personal.usuario.id}`,{headers:headers(organizador.token)})).status()).toBe(200);
  const url=`${gateway}/pedidos/establecimientos/${local.id}/productos`;
  for(const destino of [gateway,nucleo]) {
    const ruta=`${destino}/pedidos/establecimientos/${local.id}/productos`;
    expect((await request.post(ruta,{data:datosProducto('Sin token')})).status()).toBe(401);
    expect((await request.post(ruta,{headers:headers(cliente.token,randomUUID()),data:datosProducto('Cliente')})).status()).toBe(403);
    expect((await request.post(ruta,{headers:headers(organizador.token,randomUUID()),data:datosProducto('Organizador')})).status()).toBe(403);
  }
  for(const cambio of [{precio:2.1},{precio:'0.00'},{precio:'1.001'},{cantidadInicial:-1},{cantidadInicial:1.5},{cantidadInicial:2147483648},{nombre:' '},{restriccionesAlimentarias:[' ']}]) {
    expect((await request.post(url,{headers:headers(personal.token,randomUUID()),data:{...datosProducto('Inválido'),...cambio}})).status()).toBe(400);
  }
  const altaClave=randomUUID();
  const alta=await request.post(url,{headers:headers(personal.token,altaClave),data:datosProducto('Producto concurrente',20)});
  expect(alta.status()).toBe(201);const producto=(await alta.json()).producto;
  const repetida=await request.post(url,{headers:headers(personal.token,altaClave),data:datosProducto('Producto concurrente',20)});
  expect(repetida.status()).toBe(201);expect((await repetida.json()).producto.id).toBe(producto.id);
  const ajusteUrl=`${url}/${producto.id}/ajustes`;
  const ajustar=(delta:number, clave=randomUUID())=>request.post(ajusteUrl,{headers:headers(personal.token,clave),data:{delta,motivo:'Ajuste de concurrencia CU012'}});
  const simultaneos=await Promise.all([ajustar(-15),ajustar(-15)]);
  const estados: number[]=[];
  for (const respuesta of simultaneos) {
    expect([200,202,409]).toContain(respuesta.status());
    let op=await respuesta.json();
    if (respuesta.status()===202) {
      expect(op.estado).toBe('PENDIENTE');
      const id=op.id;let fallo: unknown;
      // Consultar la intención durable, sin reenviar POST ni generar otra clave.
      // Un error HTTP/transporte termina el sondeo y falla; nunca se oculta un 503.
      await expect.poll(async()=>{
        try {
          const consulta=await request.get(`${gateway}/pedidos/establecimientos/${local.id}/operaciones/${id}`,{headers:headers(personal.token)});
          if(consulta.status()!==200){fallo=`HTTP ${consulta.status()}`;return 'ERROR';}
          op=await consulta.json();expect(op.id).toBe(id);return op.estado;
        } catch(e){fallo=e;return 'ERROR';}
      }).not.toBe('PENDIENTE');
      expect(fallo).toBeUndefined();
    } else expect(op.estado).toBe(respuesta.status()===200?'APLICADA':'RECHAZADA');
    expect(['APLICADA','RECHAZADA']).toContain(op.estado);
    expect(op.productoId).toBe(producto.id);expect(op.delta).toBe(-15);
    estados.push(op.estado==='APLICADA'?200:409);
  }
  expect(estados.sort()).toEqual([200,409]);
  const trasConcurrentes=await request.get(`${gateway}/pedidos/establecimientos/${local.id}/menu`,{headers:headers(personal.token)});
  expect(trasConcurrentes.status()).toBe(200);
  expect((await trasConcurrentes.json())[0]).toMatchObject({cantidadFisica:5,cantidadReservada:0,cantidadDisponible:5});
  const entrada={eventoId:evento.id,establecimientoId:local.id,metodoEntrega:'RECOGER',productos:[{productoId:producto.id,cantidad:2}]};
  const [compra,aumento]=await Promise.all([request.post(`${gateway}/pedidos/checkout`,{headers:headers(cliente.token),data:entrada}),ajustar(3)]);
  // Una intención administrativa en curso puede bloquear admisión, sin crear un pedido parcial.
  expect([201,409]).toContain(compra.status());expect(aumento.status()).toBe(200);
  if (compra.status() === 409) {
    expect((await compra.json()).codigo).toBe('AJUSTE_INVENTARIO_PENDIENTE');
    expect(sql(`SELECT count(*) FROM alimentos.pedidos WHERE establecimiento_id='${local.id}';`)).toBe('0');
  }
  const compraReal=compra.status()===201?compra:await request.post(`${gateway}/pedidos/checkout`,{headers:headers(cliente.token),data:entrada});
  expect(compraReal.status()).toBe(201);const pedido=await compraReal.json();
  const [pago,reduccion]=await Promise.all([request.post(`${gateway}/pedidos/${pedido.id}/pagos`,{headers:headers(cliente.token,randomUUID()),data:{tokenPago:'tok_ok_cu012'}}),ajustar(-1)]);
  expect(pago.status()).toBe(200);expect((await pago.json()).compraConfirmada).toBe(true);expect(reduccion.status()).toBe(200);
  const clave=randomUUID();const primera=await ajustar(2,clave);expect(primera.status()).toBe(200);
  const resultado=await primera.json();const replay=await ajustar(2,clave);expect(replay.status()).toBe(200);expect(await replay.json()).toEqual(resultado);
  expect((await ajustar(3,clave)).status()).toBe(409);
  const expiracion=await request.post(`${gateway}/pedidos/checkout`,{headers:headers(cliente.token),data:entrada});expect(expiracion.status()).toBe(201);
  const expira=await expiracion.json();
  sql(`UPDATE alimentos.pedidos SET creado_en=now()-interval '20 minutes',expira_en=now()-interval '1 minute' WHERE id='${expira.id}';`);
  expect((await ajustar(2)).status()).toBe(200);
  await expect.poll(()=>sql(`SELECT estado FROM alimentos.reservas_inventario WHERE pedido_id='${expira.id}';`)).toBe('LIBERADA');
  const menu=await request.get(`${gateway}/pedidos/establecimientos/${local.id}/menu`,{headers:headers(personal.token)});expect(menu.status()).toBe(200);
  expect((await menu.json())[0]).toMatchObject({cantidadFisica:9,cantidadReservada:0,cantidadDisponible:9});
  const historial=await request.get(`${gateway}/pedidos/establecimientos/${local.id}/ajustes`,{headers:headers(personal.token)});
  expect((await historial.json()).find((o:{id:string})=>o.id===clave)).toMatchObject({actorId:personal.usuario.id,motivo:'Ajuste de concurrencia CU012',estado:'APLICADA',delta:2});
  const ajeno=await request.post(`${gateway}/pedidos/admin/establecimientos`,{headers:headers(organizador.token),data:ficha(evento.id,`CU012 ajeno ${randomUUID()}`)});const otro=await ajeno.json();
  expect((await request.put(`${gateway}/pedidos/establecimientos/${otro.id}/productos/${producto.id}`,{headers:headers(personal.token),data:datosProducto('Intruso')})).status()).toBe(403);
  expect((await request.put(`${gateway}/pedidos/admin/establecimientos/${otro.id}/personal/${personal.usuario.id}`,{headers:headers(organizador.token)})).status()).toBe(200);
  const {cantidadInicial:_c,...edicion}=datosProducto('Producto ajeno');
  expect((await request.put(`${gateway}/pedidos/establecimientos/${otro.id}/productos/${producto.id}`,{headers:headers(personal.token),data:edicion})).status()).toBe(404);
});
