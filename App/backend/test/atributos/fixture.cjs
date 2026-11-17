// Cuenta exclusiva del escaneo temporal; no usa usuarios ni correos reales.
const {Client}=require('pg');
const {randomUUID}=require('node:crypto');
const {writeFileSync}=require('node:fs');
const {opcionesPg}=require('../base-unica/conexiones.cjs');
const {cifrarContrasena}=require('../../dist/modulos/identidad/comun/contrasenas');
(async()=>{
  const db=new Client(opcionesPg('identidad')), id=randomUUID();
  const email=`owasp-${id}@example.test`, contrasena=randomUUID()+'-Ensayo';
  try {
    await db.connect();
    await db.query("INSERT INTO usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,'Ensayo privado',$2,$3,'ACTIVA',now())",[id,email,await cifrarContrasena(contrasena)]);
    await db.query("INSERT INTO usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM roles WHERE nombre='Cliente'",[id]);
    const r=await fetch('http://127.0.0.1:8080/api/v1/sesiones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,contrasena}),signal:AbortSignal.timeout(5000)});
    if(r.status!==200)throw new Error('LOGIN_ENSAYO_FALLIDO');
    const token=(await r.json()).token;
    if(typeof token!=='string')throw new Error('TOKEN_AUSENTE');
    writeFileSync(process.argv[2],JSON.stringify({tokens:{cliente:token}}),{mode:0o600});
  } finally {await db.end();}
})().catch(()=>{console.error('No se pudo preparar la sesión exclusiva del escaneo.');process.exitCode=1;});
