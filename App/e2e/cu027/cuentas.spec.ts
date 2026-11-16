import { actuar, presentar } from '../presentacion';
import { APIRequestContext, expect, Page, test } from '../csp.fixture';
import { randomUUID } from 'node:crypto';
import { adminURL, clienteURL, clave, comprobarAislamiento, gateway, loginAPI, loginUI, nucleo, sql } from '../cu015/entorno';
test.beforeAll(comprobarAislamiento);
const h=(token:string)=>({Authorization:`Bearer ${token}`});
async function entrar(page:Page,email:string,contrasena:string,estado=200){
 await actuar(page, objetivo => objetivo.goto(`${clienteURL}/login`));await expect(page.getByLabel('Correo',{exact:true})).toBeVisible();await presentar(page,'Acceso al portal cliente');await actuar(page.getByLabel('Correo',{exact:true}), objetivo => objetivo.fill(email));await actuar(page.getByLabel('Contraseña',{exact:true}), objetivo => objetivo.fill(contrasena));
 const respuesta=page.waitForResponse(r=>r.url().endsWith('/sesiones')&&r.request().method()==='POST');await actuar(page.getByRole('button',{name:'Ingresar',exact:true}), objetivo => objetivo.click());const r=await respuesta;expect(r.status()).toBe(estado);
 if(estado===200)await expect(page).not.toHaveURL(/\/login(?:\?|$)/);else await expect(page.getByRole('alert')).toBeVisible();return r.json();
}
async function correo(api:APIRequestContext,email:string,tipo:'verificar'|'restablecer'){
 let enlace='';await expect.poll(async()=>{
  const r=await api.get(`http://127.0.0.1:13138/correos?para=${encodeURIComponent(email)}`);expect(r.status()).toBe(200);
  for(const c of (await r.json()).correos as {texto:string}[]){
   const candidatos=c.texto.match(/https?:\/\/[^\s<>"']+/g)??[];
   const encontrado=candidatos.find(u=>new URL(u).pathname===`/cuenta/${tipo}`);
   if(encontrado){const u=new URL(encontrado);expect(u.origin).toBe(clienteURL);enlace=u.href;return true;}
  }
  return false;
 }).toBe(true);return enlace;
}

test('CU-027 por interfaces: registro, correo real simulado, perfil, desactivar/reactivar y recuperación de un uso',async({page,browser,request},info)=>{
 const email=`cu027-${randomUUID()}@example.test`,nombre=`Cuenta CU027 ${randomUUID().slice(0,8)}`,contrasena=clave()!,nueva=contrasena+'-Recuperada9!';
 await actuar(page, objetivo => objetivo.goto(`${clienteURL}/registro`));
 await actuar(page.locator('[data-prueba="registro-nombre"]'), objetivo => objetivo.fill(nombre));await actuar(page.locator('[data-prueba="registro-correo"]'), objetivo => objetivo.fill(email));await actuar(page.locator('[data-prueba="registro-contrasena"]'), objetivo => objetivo.fill(contrasena));await actuar(page.locator('[data-prueba="registro-confirmacion"]'), objetivo => objetivo.fill(contrasena));await actuar(page.locator('[data-prueba="registro-terminos"] input'), objetivo => objetivo.check());
 const alta=page.waitForResponse(r=>r.url().endsWith('/cuentas/registro'));await actuar(page.getByRole('button',{name:'Crear cuenta',exact:true}), objetivo => objetivo.click());expect((await alta).status()).toBe(202);await expect(page).toHaveURL(/\/cuenta\/verificar/);
 await presentar(page,'Cliente: cuenta pendiente de verificación');
 const enlaceVerificar=await correo(request,email,'verificar');const id=sql(`SELECT id FROM identidad.usuarios WHERE email='${email}'`);expect(id).toMatch(/^[a-f0-9-]{36}$/);
 await entrar(page,email,contrasena,403);await actuar(page, objetivo => objetivo.goto(enlaceVerificar));await expect(page).toHaveURL(`${clienteURL}/cuenta/verificar`);expect(sql(`SELECT estado FROM identidad.usuarios WHERE id='${id}'`)).toBe('PENDIENTE_VERIFICACION');
 let respuesta=page.waitForResponse(r=>r.url().endsWith('/cuentas/verificar'));await actuar(page.getByRole('button',{name:'Activar mi cuenta',exact:true}), objetivo => objetivo.click());expect((await respuesta).status()).toBe(200);await expect(page).toHaveURL(/\/login/);
 const primera=await entrar(page,email,contrasena);expect(primera.usuario.roles).toEqual(['Cliente']);
 await presentar(page,'Cliente: cuenta verificada e inicio de sesión');
 await actuar(page.locator('[data-prueba="shell-cuenta"]'), objetivo => objetivo.click());await actuar(page.getByRole('menuitem',{name:'Perfil',exact:true}), objetivo => objetivo.click());await expect(page).toHaveURL(`${clienteURL}/perfil`);
 const alias=`${nombre} actualizado`;await actuar(page.locator('[data-prueba="perfil-nombre"]'), objetivo => objetivo.fill(alias));respuesta=page.waitForResponse(r=>r.url().endsWith('/cuentas/perfil')&&r.request().method()==='PATCH');await actuar(page.getByRole('button',{name:'Guardar cambios',exact:true}), objetivo => objetivo.click());expect((await respuesta).status()).toBe(200);await actuar(page, objetivo => objetivo.reload());await expect(page.locator('[data-prueba="perfil-nombre"]')).toHaveValue(alias);
 await presentar(page,'Cliente: perfil editado y persistido');
 const adminCtx=await browser.newContext(),admin=await adminCtx.newPage(),negCtx=await browser.newContext(),neg=await negCtx.newPage();
 try{
  await loginUI(admin,adminURL,'admin@hexacore.com');await actuar(admin, objetivo => objetivo.goto(`${adminURL}/admin/cuentas`));await actuar(admin.getByLabel('Nombre o correo',{exact:true}), objetivo => objetivo.fill(email));await actuar(admin.getByRole('button',{name:'Buscar',exact:true}), objetivo => objetivo.click());const fila=admin.getByRole('row').filter({hasText:email});await expect(fila).toHaveCount(1);
  await actuar(fila.getByRole('button',{name:'Desactivar',exact:true}), objetivo => objetivo.click());const dialogo=admin.getByRole('dialog');await actuar(dialogo.getByLabel('Motivo',{exact:true}), objetivo => objetivo.fill('Prueba sobre cuenta propia CU027'));respuesta=admin.waitForResponse(r=>r.url().endsWith(`/admin/cuentas/${id}/desactivar`));await actuar(dialogo.getByRole('button',{name:'Desactivar',exact:true}), objetivo => objetivo.click());expect((await respuesta).status()).toBe(200);await expect(fila).toContainText('Desactivada');
 await presentar(admin,'Administrador: cuenta desactivada');
  await actuar(page, objetivo => objetivo.reload());await expect(page).toHaveURL(/\/login/);await entrar(page,email,contrasena,403);
  respuesta=admin.waitForResponse(r=>r.url().endsWith(`/admin/cuentas/${id}/activar`));await actuar(fila.getByRole('button',{name:'Activar',exact:true}), objetivo => objetivo.click());expect((await respuesta).status()).toBe(200);await expect(fila.getByText('Activa',{exact:true})).toBeVisible();
 await presentar(admin,'Administrador: cuenta reactivada');
  await entrar(page,email,contrasena);
  await actuar(page.locator('[data-prueba="shell-cuenta"]'), objetivo => objetivo.click());
  const cierre=page.waitForResponse(r=>r.url().endsWith('/sesiones/actual')&&r.request().method()==='DELETE');
  await actuar(page.locator('[data-prueba="shell-cerrar-sesion"]'), objetivo => objetivo.click());expect((await cierre).status()).toBe(200);
  await expect(page.getByRole('button',{name:'Iniciar sesión',exact:true})).toBeVisible();await actuar(page, objetivo => objetivo.goto(`${clienteURL}/recuperar`));
  // Otra sesión vigente permite comprobar que el restablecimiento revoca sesiones,
  // sin confundir esa revocación con el cierre de sesión de la interfaz.
  const vigente=await loginAPI(request,email);
  await actuar(page.getByLabel('Correo',{exact:true}), objetivo => objetivo.fill(email));respuesta=page.waitForResponse(r=>r.url().endsWith('/cuentas/recuperacion'));await actuar(page.getByRole('button',{name:'Enviar enlace',exact:true}), objetivo => objetivo.click());expect((await respuesta).status()).toBe(202);
  const enlaceRecuperar=await correo(request,email,'restablecer');await actuar(page, objetivo => objetivo.goto(enlaceRecuperar));await expect(page).toHaveURL(`${clienteURL}/cuenta/restablecer`);await actuar(page.getByLabel('Contraseña nueva',{exact:true}), objetivo => objetivo.fill(nueva));await actuar(page.getByLabel('Confirmar contraseña',{exact:true}), objetivo => objetivo.fill(nueva));
  respuesta=page.waitForResponse(r=>r.url().endsWith('/cuentas/restablecer'));await actuar(page.getByRole('button',{name:'Guardar contraseña',exact:true}), objetivo => objetivo.click());expect((await respuesta).status()).toBe(200);await expect(page).toHaveURL(/\/login/);
  expect((await request.get(`${gateway}/cuentas/perfil`,{headers:h(vigente.token)})).status()).toBe(401);await entrar(page,email,contrasena,401);await entrar(page,email,nueva);
 await presentar(page,'Cliente: acceso con contraseña recuperada');
  for(const [enlace,accion,ruta] of [[enlaceVerificar,'Activar mi cuenta','verificar'],[enlaceRecuperar,'Guardar contraseña','restablecer']]){
   await actuar(neg, objetivo => objetivo.goto(enlace));if(ruta==='restablecer'){await actuar(neg.getByLabel('Contraseña nueva',{exact:true}), objetivo => objetivo.fill(nueva+'Otra'));await actuar(neg.getByLabel('Confirmar contraseña',{exact:true}), objetivo => objetivo.fill(nueva+'Otra'));}
   const repetida=neg.waitForResponse(r=>r.url().endsWith(`/cuentas/${ruta}`));await actuar(neg.getByRole('button',{name:accion,exact:true}), objetivo => objetivo.click());expect((await repetida).status()).toBe(422);await expect(neg.getByRole('alert')).toBeVisible();
 await presentar(neg,'Cliente: enlace de un solo uso rechazado');
  }
  await actuar(page, objetivo => objetivo.goto(`${clienteURL}/perfil`));await expect(page.locator('[data-prueba="perfil-nombre"]')).toHaveValue(alias);await page.screenshot({path:info.outputPath('cu027-perfil.png'),fullPage:true});await admin.screenshot({path:info.outputPath('cu027-cuenta-reactivada.png'),fullPage:true});
 }finally{await negCtx.close();await adminCtx.close();}
});

test('CU-027 negativos reales: no elevar rol por registro, acceso administrativo ajeno y respuestas sin enumeración',async({request,browser})=>{
 const email=`cu027-neg-${randomUUID()}@example.test`,datos={nombre:'Cuenta propia CU027',email,contrasena:clave()};
 expect((await request.post(`${gateway}/cuentas/registro`,{data:{...datos,roles:['Administrador']}})).status()).toBe(400);
 const a=await request.post(`${gateway}/cuentas/registro`,{data:datos});expect(a.status()).toBe(202);const b=await request.post(`${gateway}/cuentas/registro`,{data:datos});expect(b.status()).toBe(202);expect(await b.json()).toEqual(await a.json());
 const cliente=await loginAPI(request,'cliente@hexacore.com');for(const base of [gateway,nucleo])expect((await request.get(`${base}/admin/cuentas`,{headers:h(cliente.token)})).status()).toBe(403);
 const conocido=await request.post(`${gateway}/cuentas/recuperacion`,{data:{email}}),desconocido=await request.post(`${gateway}/cuentas/recuperacion`,{data:{email:`cu027-inexistente-${randomUUID()}@example.test`}});expect(conocido.status()).toBe(202);expect(desconocido.status()).toBe(202);expect(await conocido.json()).toEqual(await desconocido.json());
 const ctx=await browser.newContext();try{const page=await ctx.newPage();await actuar(page, objetivo => objetivo.goto(`${adminURL}/admin/cuentas`));await expect(page).toHaveURL(/\/login/);await presentar(page,'Acceso administrativo sin sesión rechazado');}finally{await ctx.close();}
});
