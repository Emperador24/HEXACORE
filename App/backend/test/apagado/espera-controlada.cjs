// Fixture del observador: una tarea retenida, sin conexiones a servicios reales.
const {Module}=require('@nestjs/common');
const {NestFactory}=require('@nestjs/core');
let liberar,respuesta;
class TareaEnEspera {
  constructor(){this.trabajos=new Set(['NO_PUBLICAR_SQL_mensaje_identidad']);}
  async onModuleDestroy(){
    await new Promise(resolve=>{liberar=resolve;});
    this.trabajos.clear();respuesta?.end();
  }
}
class PruebaObservacion {}
Module({providers:[TareaEnEspera]})(PruebaObservacion);
(async()=>{
  const app=await NestFactory.create(PruebaObservacion,{logger:false});
  app.use((_req,res)=>{respuesta=res;process.send({tipo:'solicitud'});});
  app.enableShutdownHooks(['SIGTERM']);
  process.on('message',mensaje=>{if(mensaje?.tipo==='liberar')liberar?.();});
  await app.listen(0,'127.0.0.1');
  process.send({tipo:'listo',puerto:app.getHttpServer().address().port});
})().catch(()=>{console.error('No se pudo iniciar la fixture de observación');process.exitCode=1;});
