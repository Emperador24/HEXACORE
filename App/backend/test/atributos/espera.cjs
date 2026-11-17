// Se ejecuta dentro de LA MISMA imagen del Núcleo, sin compilar ni migrar.
const assert=require('node:assert/strict');
(async()=>{
  const fuente=require('/app/dist/modulos/identidad/persistencia/data-source.js').default;
  const inicio=performance.now();
  try {
    await fuente.initialize();
    const consulta=performance.now();
    try {await fuente.query('SELECT pg_sleep(4)');throw new Error('NO_APLICO_LIMITE');}
    catch(e){
      assert.match(e.message,/timeout|canceling statement/i);
      const duracion=performance.now()-consulta;
      const esperado=Number(process.env.POSTGRES_ESPERA_MAXIMA_MS||3000);
      assert.ok(duracion>=esperado*0.75&&duracion<esperado+1000,`espera fuera de rango: ${duracion}`);
      console.log(JSON.stringify({limiteMs:esperado,duracionMs:Math.round(duracion),cancelada:true}));
    }
  }finally{if(fuente.isInitialized)await fuente.destroy();}
})().catch(()=>{console.error('La espera configurada no produjo el efecto previsto.');process.exitCode=1;});
