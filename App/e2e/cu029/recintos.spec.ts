import { expect, Page, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { adminURL, comprobarAislamiento, gateway, loginAPI, loginUI, nucleo, sql } from '../cu015/entorno';
test.beforeAll(comprobarAislamiento);
const h=(token:string)=>({Authorization:`Bearer ${token}`});
// PNG RGBA 1×1 con CRC válidos; el navegador debe poder decodificarlo tras recargar.
const plano=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==','base64');
async function capacidadZona(page:Page,nombre:string){
 let indice=-1;
 await expect.poll(async()=>indice=await page.getByLabel('Zona',{exact:true}).evaluateAll((xs,n)=>xs.findIndex(x=>(x as HTMLInputElement).value===n),nombre)).toBeGreaterThanOrEqual(0);
 return page.getByLabel('Capacidad',{exact:true}).nth(indice);
}

test('CU-029 por interfaz: recinto y zonas, capacidad, plano, edición persistida e impacto de evento publicado',async({page,request},info)=>{
 const nombre=`Recinto CU029 ${randomUUID().slice(0,8)}`;
 await loginUI(page,adminURL,'organizador@hexacore.com');await page.goto(`${adminURL}/admin/recintos`);await page.getByRole('button',{name:'Nuevo recinto',exact:true}).click();await expect(page).toHaveURL(`${adminURL}/admin/recintos/nuevo`);
 await page.getByLabel('Nombre',{exact:true}).fill(nombre);await page.getByLabel('Ciudad',{exact:true}).fill('Bogotá');await page.getByLabel('Dirección',{exact:true}).fill('Punto propio CU029');await page.getByLabel('Capacidad total',{exact:true}).fill('100');
 // El formulario trae una zona inicial: editarla y esperar la segunda fila al añadir.
 await expect(page.getByLabel('Zona',{exact:true})).toHaveCount(1);
 await page.getByLabel('Zona',{exact:true}).nth(0).fill('VIP');await page.getByLabel('Capacidad',{exact:true}).nth(0).fill('40');
 await page.getByRole('button',{name:'Añadir zona',exact:true}).click();await expect(page.getByLabel('Zona',{exact:true})).toHaveCount(2);
 await page.getByLabel('Zona',{exact:true}).nth(1).fill('General');await page.getByLabel('Capacidad',{exact:true}).nth(1).fill('80');
 await expect(page.getByText(/Las zonas suman 120 y el recinto admite 100/)).toBeVisible();await expect(page.getByRole('button',{name:'Registrar recinto',exact:true})).toBeDisabled();expect(sql(`SELECT count(*) FROM eventos_recintos.recintos WHERE nombre='${nombre}'`)).toBe('0');
 await page.getByLabel('Capacidad',{exact:true}).nth(1).fill('60');const alta=page.waitForResponse(r=>r.url().endsWith('/recintos')&&r.request().method()==='POST');await page.getByRole('button',{name:'Registrar recinto',exact:true}).click();const r=await alta;expect(r.status()).toBe(201);const d=await r.json(),id=d.recinto.id;await expect(page).toHaveURL(`${adminURL}/admin/recintos/${id}`);
 await page.locator('input[type="file"]').setInputFiles({name:'plano.txt',mimeType:'text/plain',buffer:Buffer.from('No es un plano')});await expect(page.getByRole('alert')).toContainText('PNG');
 const subir=page.waitForResponse(r=>r.url().endsWith(`/recintos/${id}/plano`)&&r.request().method()==='PUT');await page.locator('input[type="file"]').setInputFiles({name:'plano.png',mimeType:'image/png',buffer:plano});expect((await subir).status()).toBe(200);
 await page.getByLabel('Ciudad',{exact:true}).fill('Medellín');await (await capacidadZona(page,'VIP')).fill('45');await (await capacidadZona(page,'General')).fill('55');await page.getByRole('button',{name:'Ubicar',exact:true}).first().click();
 let guardar=page.waitForResponse(r=>r.url().endsWith(`/recintos/${id}`)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();expect((await guardar).status()).toBe(200);await page.reload();
 await expect(page.getByLabel('Ciudad',{exact:true})).toHaveValue('Medellín');await expect(await capacidadZona(page,'VIP')).toHaveValue('45');await expect(await capacidadZona(page,'General')).toHaveValue('55');await expect(page.getByAltText('Plano del recinto')).toBeVisible();await expect.poll(()=>page.getByAltText('Plano del recinto').evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
 const organizador=await loginAPI(request,'organizador@hexacore.com');const detalle=await request.get(`${gateway}/recintos/${id}`,{headers:h(organizador.token)});expect(detalle.status()).toBe(200);const persistido=await detalle.json();const archivo=await request.get(`${gateway}/recintos/${id}/plano`,{headers:h(organizador.token)});expect(archivo.status()).toBe(200);expect(await archivo.body()).toEqual(plano);
 // CU-026 se usa solo como fixture para ejercer las restricciones de edición CU-029.
 expect(persistido.recinto.zonas).toEqual(expect.arrayContaining([expect.objectContaining({nombre:'VIP',capacidad:45}),expect.objectContaining({nombre:'General',capacidad:55})]));
 expect(persistido.recinto.zonas.some((z:{x:number|null})=>z.x!==null&&z.x!==undefined)).toBe(true);
 const evento=await request.post(`${gateway}/eventos`,{headers:h(organizador.token),data:{nombre:`Evento ${nombre}`,categoria:'Prueba CU029',recintoId:id,fechaInicio:new Date(Date.now()+86400000).toISOString(),fechaFin:new Date(Date.now()+90000000).toISOString(),aforoMaximo:90,localidades:persistido.recinto.zonas.map((z:{id:string;nombre:string})=>({nombre:z.nombre,precio:1000,cantidad:z.nombre==='VIP'?40:50,zonaRecintoId:z.id}))}});expect(evento.status()).toBe(201);const e=(await evento.json()).evento;
 expect((await request.post(`${gateway}/eventos/${e.id}/publicar`,{headers:h(organizador.token),data:{version:e.version}})).status()).toBe(200);await page.reload();await expect(page.getByText(/Tiene 1 evento\(s\) publicados/)).toBeVisible();
 await (await capacidadZona(page,'VIP')).fill('10');guardar=page.waitForResponse(r=>r.url().endsWith(`/recintos/${id}`)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();expect((await guardar).status()).toBe(409);await expect(page.getByRole('alert')).toContainText('no puede bajar');await page.reload();await expect(await capacidadZona(page,'VIP')).toHaveValue('45');
 // Cambio permitido con aviso explícito, sin vulnerar los cupos comprometidos.
 await page.getByLabel('Capacidad total',{exact:true}).fill('110');guardar=page.waitForResponse(r=>r.url().endsWith(`/recintos/${id}`)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();expect((await guardar).status()).toBe(409);const dialogo=page.getByRole('dialog');await expect(dialogo).toContainText('eventos publicados');guardar=page.waitForResponse(r=>r.url().endsWith(`/recintos/${id}`)&&r.request().method()==='PUT');await dialogo.getByRole('button',{name:'Guardar de todos modos',exact:true}).click();expect((await guardar).status()).toBe(200);await page.reload();await expect(page.getByLabel('Capacidad total',{exact:true})).toHaveValue('110');
 await page.screenshot({path:info.outputPath('cu029-recinto-zonas-plano.png'),fullPage:true});
});

test('CU-029 negativos reales: capacidades y archivo inválidos, roles no autorizados por gateway y backend',async({request,browser})=>{
 const organizador=await loginAPI(request,'organizador@hexacore.com'),cliente=await loginAPI(request,'cliente@hexacore.com'),personal=await loginAPI(request,'restaurante@hexacore.com');
 const datos={nombre:`Recinto negativo CU029 ${randomUUID()}`,ciudad:'Bogotá',capacidad:10,zonas:[{nombre:'General',capacidad:11}]};
 const excesivo=await request.post(`${gateway}/recintos`,{headers:h(organizador.token),data:datos});expect(excesivo.status()).toBe(400);expect((await excesivo.json()).codigo).toBe('CAPACIDAD_ZONAS_EXCEDIDA');
 for(const base of [gateway,nucleo])for(const token of [cliente.token,personal.token])expect((await request.get(`${base}/recintos`,{headers:h(token)})).status()).toBe(403);
 const creado=await request.post(`${gateway}/recintos`,{headers:h(organizador.token),data:{...datos,zonas:[{nombre:'General',capacidad:10}]}});expect(creado.status()).toBe(201);const id=(await creado.json()).recinto.id;
 const invalido=await request.put(`${gateway}/recintos/${id}/plano`,{headers:h(organizador.token),multipart:{plano:{name:'falso.png',mimeType:'image/png',buffer:Buffer.from('Esto no es PNG')}}});expect(invalido.status()).toBe(400);expect((await invalido.json()).codigo).toBe('PLANO_TIPO');expect((await request.get(`${gateway}/recintos/${id}/plano`,{headers:h(organizador.token)})).status()).toBe(404);
 const ctx=await browser.newContext();try{const page=await ctx.newPage();await loginUI(page,adminURL,'restaurante@hexacore.com');await page.goto(`${adminURL}/admin/recintos`);await expect(page).toHaveURL(`${adminURL}/admin/menu`);}finally{await ctx.close();}
});
