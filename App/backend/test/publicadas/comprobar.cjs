// Arranque exclusivamente desde ocho digests del mismo commit, en proyecto propio.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const{execFileSync}=require('node:child_process');
const directorio=path.resolve(process.argv[2]||''),revision=process.env.REVISION_PUBLICADA;
assert.match(revision||'',/^[a-f0-9]{40}$/);assert.ok(fs.statSync(directorio).isDirectory());
const {validar,nombres}=require('./manifiesto.cjs');
const manifiestos=validar(directorio,revision);
const ejecutar=(cmd,args)=>execFileSync(cmd,args,{stdio:'inherit',env:process.env});
(async()=>{
  process.env.POSTGRES_BD_PRUEBAS='hexacore_publicadas_e2e';
  ejecutar('git',['diff','--quiet',revision,'--',':(glob)apps/**/*.ts',':(glob)modulos/**/*.ts',':(glob)compartido/**/*.ts','Dockerfile','Dockerfile.boleteria','Dockerfile.trabajador','package.json','package-lock.json']);
  for(const m of manifiestos){
    const {nombre,ref}=m;
    ejecutar('docker',['pull',ref]);
    const imagen=JSON.parse(execFileSync('docker',['image','inspect',ref],{encoding:'utf8'}))[0];
    assert.equal(imagen.Config.Labels['org.opencontainers.image.revision'],revision);
    process.env['IMAGEN_'+nombre.toUpperCase().replaceAll('-','_')]=ref;
  }
  const {argumentos}=require('../base-unica/compose.cjs');const compose=argumentos(true);
  const cfg=JSON.parse(execFileSync('docker',[...compose,'config','--format','json'],{encoding:'utf8'}));
  assert.equal(cfg.name,'hexacore-publicadas-e2e');
  assert.ok(Object.values(cfg.services).every(s=>!s.build));
  assert.equal(cfg.services.nucleo.environment.POSTGRES_BD,'hexacore_publicadas_e2e');
  assert.equal(cfg.services['preparacion-base'].image,cfg.services.nucleo.image);
  try{
    ejecutar('docker',[...compose,'up','-d','--no-build','--wait']);
    for(const n of nombres){const servicio=cfg.services[n];const id=execFileSync('docker',[...compose,'ps','-q',n],{encoding:'utf8'}).trim();const c=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];assert.equal(c.Config.Image,servicio.image);assert.equal(c.Config.Labels['com.docker.compose.project'],'hexacore-publicadas-e2e');}
    for(const puerto of [14200,14201]){const r=await fetch('http://127.0.0.1:'+puerto);assert.equal(r.status,200);assert.match(await r.text(),/<app-root/);}
    for(const script of ['test/comprobar-imagen.cjs','test/boleteria/comprobar-imagen.cjs'])ejecutar(process.execPath,[script]);
    ejecutar(process.execPath,['--test','--test-concurrency=1','test/pagos/convivencia.test.cjs']);
    ejecutar(process.execPath,['--test','--test-concurrency=1','test/pagos/contratos.test.cjs']);
    // Correo del proveedor publicado: /correos, no el /estado del doble especializado.
    const {randomUUID}=require('node:crypto');const email='publicadas-'+randomUUID()+'@example.test';
    const registro=await fetch('http://127.0.0.1:18082/api/v1/cuentas/registro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:'Correo publicado',email,contrasena:'PublicadasHexacore22!'})});assert.equal(registro.status,202);
    const limite=Date.now()+10000;let entregado=false;
    while(Date.now()<limite&&!entregado){const r=await fetch('http://127.0.0.1:13106/correos?para='+encodeURIComponent(email));assert.equal(r.status,200);entregado=(await r.json()).correos.some(c=>c.para===email&&c.asunto==='Verifica tu cuenta de HEXACORE');if(!entregado)await new Promise(r=>setTimeout(r,100));}assert.ok(entregado);
    ejecutar(process.execPath,['test/base-unica/cerrar-aplicaciones.cjs']);
    console.log('Ocho imágenes del mismo SHA verificadas por digest/revisión; preparación, gateway, 5+13 contratos, correo y cierre aprobados.');
  }finally{ejecutar('docker',[...compose,'stop']);}
})().catch(e=>{console.error(e);process.exitCode=1;});
