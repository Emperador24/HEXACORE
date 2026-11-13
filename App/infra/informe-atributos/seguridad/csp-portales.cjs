// Solo portales locales; capturas/logs privados. Pruebas CSP DOM controladas.
const {createRequire}=require('node:module');
const {guarda,leer,guardar,privado,raiz,path,fs,assert}=require('./comun.cjs');
const {chromium,expect:baseExpect}=createRequire(path.join(raiz,'App/e2e/package.json'))('@playwright/test');
const expect=baseExpect.configure({timeout:15000});
async function main(){
 guarda();const modo=process.argv[2];assert(/^(referencia|control|control-rutas|control-sse|final-[123])$/.test(modo));
 assert(!fs.existsSync(path.join(privado(),'csp-'+modo+'.json')),'No sobrescribir evidencia CSP');
 const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP cu015.localhost 127.0.0.1']});const resultados=[];
 try{
  for(const [portal,puerto]of [['cliente',14220],['admin',14221]]){
   const contexto=await browser.newContext({viewport:{width:1440,height:1000}});const pagina=await contexto.newPage();pagina.setDefaultTimeout(15000);
   const consola=[],errores=[],http=[],violaciones=[];let fase='carga';pagina.on('response',r=>{if(r.status()>=400){const u=new URL(r.url());http.push({origen:u.origin,ruta:u.pathname,estado:r.status()});}});pagina.on('console',m=>{if(['error','warning'].includes(m.type()))consola.push({tipo:m.type(),texto:m.text()});});pagina.on('pageerror',e=>errores.push(e.message));
   try{
   await contexto.exposeBinding('__registrarCspControl',(_fuente,dato)=>violaciones.push({fase,...dato}));
   await contexto.addInitScript(()=>{window.__hxcCsp=[];document.addEventListener('securitypolicyviolation',e=>{const dato={directiva:e.effectiveDirective,bloqueado:e.blockedURI,disposicion:e.disposition};window.__hxcCsp.push(dato);window.__registrarCspControl(dato);});});
   const r=await pagina.goto(`http://cu015.localhost:${puerto}/login`,{waitUntil:'networkidle'});assert.equal(r.status(),200);
   await expect(pagina.getByRole('button',{name:'Ingresar',exact:true})).toBeVisible();
   const politica=r.headers()['content-security-policy']??null,raizApp=pagina.locator('app-root');
   const version=await raizApp.getAttribute('ng-version'),nodoNonce=await raizApp.getAttribute('ngcspnonce');
   const estilo=await pagina.evaluate(()=>{const b=getComputedStyle(document.body),boton=document.querySelector('button[type=submit]'),s=getComputedStyle(boton);return {fuente:b.fontFamily,color:b.color,fuenteBoton:s.fontFamily,colorBoton:s.color,radio:s.borderRadius};});
   const normales=await pagina.evaluate(()=>window.__hxcCsp);const comprobaciones={};
   if(modo!=='referencia'){
    assert.equal(version,'22.2.6');assert(politica&&!r.headers()['content-security-policy-report-only']);assert(!politica.includes('unsafe-inline')&&!politica.includes('unsafe-eval'));
    const nonce=politica.match(/'nonce-([0-9a-f]{32})'/)?.[1];assert(nonce&&nonce===nodoNonce);assert(!politica.includes('__HEXACORE_CSP_NONCE__'));assert.match(r.headers()['cache-control'],/no-store/);
    assert.equal(normales.length,0,'Violaciones CSP al cargar login');
    fase='sondas';await pagina.evaluate(()=>{const s=document.createElement('script');s.textContent='window.__scriptProhibido=true';document.head.append(s);const d=document.createElement('div');d.id='estilo-prohibido';d.setAttribute('style','color:rgb(1,2,3)');document.body.append(d);});
    await expect.poll(()=>pagina.evaluate(()=>window.__hxcCsp.length)).toBeGreaterThanOrEqual(2);assert.equal(await pagina.evaluate(()=>window.__scriptProhibido),undefined);
    assert.notEqual(await pagina.locator('#estilo-prohibido').evaluate(n=>getComputedStyle(n).color),'rgb(1, 2, 3)');
    comprobaciones.violacionesControladas=await pagina.evaluate(()=>window.__hxcCsp);comprobaciones.inlineScriptBloqueado=true;comprobaciones.atributoStyleBloqueado=true;
    if(portal==='cliente'){
     let solicitudes=0;await contexto.route('https://js.stripe.com/**',async route=>{solicitudes++;const esScript=route.request().resourceType()==='script';await route.fulfill({contentType:esScript?'application/javascript':'text/html',body:esScript?'window.__stripeDoble={tokenizar:()=>"pm_fixture_sintetica"};':'<!doctype html><title>Iframe sintético</title>'});});
     await pagina.evaluate(async()=>{await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://js.stripe.com/v3/';s.onload=ok;s.onerror=no;document.head.append(s);});const f=document.createElement('iframe');f.src='https://js.stripe.com/v3/iframe-sintetico.html';f.id='stripe-doble';document.body.append(f);});
     await expect.poll(()=>solicitudes).toBe(2);assert.equal(await pagina.evaluate(()=>window.__stripeDoble.tokenizar()),'pm_fixture_sintetica');comprobaciones.scriptIframeStripeDoble=true;
    }
    assert.equal(violaciones.filter(v=>v.fase==='sondas').length,2,'Solo dos violaciones controladas');fase='navegacion';
    const recarga=await pagina.reload({waitUntil:'networkidle'});const nonce2=recarga.headers()['content-security-policy'].match(/'nonce-([0-9a-f]{32})'/)?.[1];assert(nonce2&&nonce2!==nonce);assert.equal(await raizApp.getAttribute('ngcspnonce'),nonce2);comprobaciones.nonceUnicoPorRespuesta=true;
    await expect(pagina.getByRole('button',{name:'Ingresar',exact:true})).toBeVisible();assert.equal((await pagina.evaluate(()=>window.__hxcCsp)).length,0,'Violaciones tras recarga');
    const f=leer('fixture.json'),a=f.actores[portal==='cliente'?'cliente':'admin'];
    await pagina.getByLabel('Correo',{exact:true}).fill(a.email);await pagina.getByLabel('Contraseña',{exact:true}).fill(f.clave);
    const login=pagina.waitForResponse(r=>r.url().endsWith('/sesiones')&&r.request().method()==='POST');
    await pagina.getByRole('button',{name:'Ingresar',exact:true}).click();assert.equal((await login).status(),200);await expect(pagina).not.toHaveURL(/\/login/);
    comprobaciones.rutasAutenticadas=[];comprobaciones.renovaciones200=0;
    const rutas=portal==='cliente'?['perfil','reventa','entradas','parqueadero','pedidos','mis-pedidos','ajustes']:['admin/inicio','admin/eventos','admin/personal','admin/parqueaderos','admin/cuentas','admin/recintos'];
    for(const ruta of rutas){
     const renovacion=pagina.waitForResponse(r=>r.url().endsWith('/sesiones/renovar')&&r.request().method()==='POST');
     const destino=`http://cu015.localhost:${puerto}/${ruta}`;const doc=await pagina.goto(destino,{waitUntil:'domcontentloaded'});assert.equal(doc.status(),200);
     assert.equal((await renovacion).status(),200);comprobaciones.renovaciones200++;await expect(pagina).toHaveURL(destino);await expect(pagina.getByRole('heading',{level:1}).first()).toBeVisible();
     if(ruta==='admin/parqueaderos')await expect(pagina.locator('.vivo.activo')).toBeVisible();
     assert.equal((await pagina.evaluate(()=>window.__hxcCsp)).length,0,`CSP en ${ruta}`);
     comprobaciones.rutasAutenticadas.push('/'+ruta);
    }
    assert.equal(violaciones.filter(v=>v.fase!=='sondas').length,0,'Violaciones inesperadas de la navegación');comprobaciones.sinViolacionesEnRutas=true;

   }
   await pagina.screenshot({path:path.join(privado(),modo+'-'+portal+'-login.png'),fullPage:true});
   guardar(modo+'-'+portal+'-consola.json',{consola,errores,http,violaciones,violacionesIniciales:normales});
   assert.equal(errores.length,0,'Error JavaScript del portal');
   resultados.push({portal,version,politicaPresente:!!politica,politica:politica?.replace(/nonce-[a-f0-9]{32}/g,'nonce-DINAMICO'),estilo,violacionesAlCargar:normales.length,erroresJavaScript:errores.length,consolaErrores:consola.filter(c=>c.tipo==='error').length,httpErrores:http,comprobaciones});
   }catch(e){guardar(modo+'-'+portal+'-fallo.json',{consola,errores,http,violaciones,motivo:e.message});throw e;}finally{await contexto.close();}
  }
 }finally{await browser.close();}
 guardar('csp-'+modo+'.json',{fechaUTC:new Date().toISOString(),resultados});console.log(JSON.stringify({modo,resultados}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
