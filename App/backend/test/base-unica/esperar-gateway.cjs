// Precondición de lectura tras reiniciar procesos. No reenvía ninguna escritura.
async function esperarGateway(base, {maxMs=5000, intervaloMs=100, solicitar=fetch}={}) {
  const fin=Date.now()+maxMs, observaciones=[];
  for(const ruta of ['/salud','/cartelera']) {
    let lista=false;
    while(Date.now()<fin) {
      let estado='transporte';
      try {
        const r=await solicitar(base+ruta,{method:'GET',signal:AbortSignal.timeout(Math.max(1,Math.min(1000,fin-Date.now())))});
        estado=r.status;await r.body?.cancel();lista=estado===200;
      }catch{/* El fallo de lectura queda registrado, no se oculta. */}
      observaciones.push({ruta,estado});
      if(lista)break;
      await new Promise(r=>setTimeout(r,intervaloMs));
    }
    if(!lista)throw new Error('Gateway no listo en precondición de solo lectura: '+JSON.stringify(observaciones));
  }
  return observaciones;
}
module.exports={esperarGateway};
