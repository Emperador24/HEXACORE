// Comprueba tráfico real del API local; aborta recursos de terceros del ensayo.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const contexto=await browser.newContext();
    await contexto.route('**/*',ruta=>['127.0.0.1','localhost'].includes(new URL(ruta.request().url()).hostname)?ruta.continue():ruta.abort());
    const page=await contexto.newPage();
    if(process.argv[2]==='invalida'){
      const error=page.waitForEvent('pageerror',{predicate:e=>e.message.includes('HEXACORE_CONFIGURACION.api'),timeout:10000});
      await page.goto('http://127.0.0.1:4200/');
      await error;
      console.log(JSON.stringify({configuracionInvalidaRechazada:true}));
    }else{
      const prefijo=process.argv[2]==='predeterminada'?'http://127.0.0.1:8080/api/v1/':'http://127.0.0.1:4200/ensayo-api/v1/';
      const respuesta=page.waitForResponse(r=>r.url().startsWith(prefijo+'cartelera'),{timeout:15000});
      await page.goto('http://127.0.0.1:4200/');
      const r=await respuesta;assert.equal(r.status(),200);
      console.log(JSON.stringify({configuracion:process.argv[2],destinoEfectivo:prefijo+'cartelera',http:r.status()}));
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
