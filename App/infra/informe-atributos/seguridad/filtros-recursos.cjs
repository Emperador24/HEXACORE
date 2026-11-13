const c=require('./comun.cjs');
async function main(){
 c.guarda();const f=c.leer('fixture.json'),controles=[];
 for(const canal of ['gateway','directo']){
  const servidor=canal==='gateway'?'http://127.0.0.1:18100':'http://127.0.0.1:13147';
  const base={categoria:f.codigo,artista:'Ensayo'};
  const r=await c.peticion('/api/v1/cartelera?'+new URLSearchParams(base),{servidor});
  controles.push({canal,caso:'filtro-legitimo-propio',estado:r.estado,ok:r.estado===200&&r.datos.eventos.length===1&&r.datos.eventos[0].id===f.recursos.dastEvento});
  for(const campo of ['categoria','ciudad','artista']){
   const q={...base,[campo]:(base[campo]??'Bogotá')+'\u0000'};
   const x=await c.peticion('/api/v1/cartelera?'+new URLSearchParams(q),{servidor});
   controles.push({canal,caso:'nul-'+campo,estado:x.estado,ok:x.estado===400});
  }
 }
 c.guardar('filtros-nul-http.json',{fechaUTC:new Date().toISOString(),controles});console.log(JSON.stringify(controles));if(controles.some(x=>!x.ok))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
