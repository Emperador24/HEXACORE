const c=require('./comun.cjs');
async function main(){
 c.guarda();const f=c.leer('fixture.json');c.assert(!f.recursos.dastEvento,'Ya existe el evento DAST: reutilizarlo');
 const l=await c.peticion('/api/v1/sesiones',{metodo:'POST',cuerpo:{email:f.actores.organizador.email,contrasena:f.clave}});c.assert.equal(l.estado,200);const token=l.datos.token;
 const r=await c.peticion('/api/v1/eventos/'+f.evento,{token});c.assert.equal(r.estado,200);
 let e=await c.peticion('/api/v1/eventos',{metodo:'POST',token,cuerpo:{nombre:f.codigo+' DAST',categoria:f.codigo,artista:'Ensayo',recintoId:r.datos.evento.recintoId,fechaInicio:new Date(Date.now()+48*3600000).toISOString(),fechaFin:new Date(Date.now()+49*3600000).toISOString(),aforoMaximo:50,localidades:[{nombre:'General',precio:1000,cantidad:50}]}});c.assert.equal(e.estado,201);
 f.recursos.dastEvento=e.datos.evento.id;c.guardar('fixture.json',f);
 e=await c.peticion('/api/v1/eventos/'+f.recursos.dastEvento+'/publicar',{metodo:'POST',token,cuerpo:{version:e.datos.evento.version}});c.assert.equal(e.estado,200);
 const limite=Date.now()+10000;let listo=false;
 do{const x=await c.peticion('/api/v1/cartelera?categoria='+encodeURIComponent(f.codigo)+'&artista=Ensayo');listo=x.estado===200&&x.datos.eventos?.length===1&&x.datos.eventos[0].id===f.recursos.dastEvento;if(listo)break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<limite);
 c.assert(listo,'El evento propio no llegó a Cartelera');console.log('Evento exclusivo y filtro de categoría/artista comprobados para DAST no autenticado.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
