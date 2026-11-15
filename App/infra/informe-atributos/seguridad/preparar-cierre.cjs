// Solo cuentas propias en una base que debe comenzar sin usuarios. Sin semillas.
const {randomUUID,randomBytes}=require('node:crypto');
const c=require('./cierre-comun.cjs');
async function main(){
  c.guarda();c.assert(!c.fs.existsSync(c.path.join(c.privado(),'fixture-cierre.json')));
  const db=await c.conexion();
  try{
    c.assert.equal((await db.ds.query('SELECT count(*)::int n FROM identidad.usuarios'))[0].n,0);
    const clave=randomBytes(24).toString('base64url')+'!aA1';
    const {cifrarContrasena}=c.cargar(c.path.join(c.backend,'dist/modulos/identidad/comun/contrasenas'));
    const f={codigo:'SEG-C-'+randomUUID().slice(0,8),clave,hash:await cifrarContrasena(clave),actores:{},cuentas:[],entradas:[],estado:'EN_CURSO'};
    c.guardar('fixture-cierre.json',f);
    for(const [a,r] of Object.entries({admin:'Administrador',admin2:'Administrador',cliente:'Cliente',cliente2:'Cliente',personal:'Personal',personal2:'Personal',organizador:'Organizador',propio:'Cliente'})){
      const cuenta=await c.nuevaCuenta(db,f.codigo+' '+a,[r]);
      const actual=c.fixture();actual.actores[a]=cuenta;c.guardar('fixture-cierre.json',actual);
    }
    const admin=await c.login('admin');
    const permisos=Object.keys(c.cargar(c.path.join(c.backend,'dist/compartido/seguridad/permisos')).MODULOS_PERMISO).flatMap(modulo=>['leer','crear','actualizar','eliminar'].map(accion=>({modulo,accion})));
    const propio=await c.rol(admin.token,f.codigo+' pleno',permisos);
    const x=await c.http(c.base,'POST','/admin/roles/'+propio.id+'/usuarios',admin.token,{email:c.fixture().actores.propio.email});c.assert.equal(x.estado,200);
    const actual=c.fixture();actual.rolPropio=propio;actual.estado='COMPLETA';c.guardar('fixture-cierre.json',actual);
    c.guardar('sesion-preparacion.json',admin);
    console.log('Ocho cuentas, dos administradores y rol propio exclusivos; todos los destinatarios pertenecen al ensayo.');
  }finally{await db.cerrar();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
