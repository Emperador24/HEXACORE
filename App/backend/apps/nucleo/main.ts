// Antes de cargar Nest, pg, crypto o cualquier usuario del pool libuv.
import '../../compartido/hilos';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CONFIGURACION_PROCESO, ConfiguracionProceso } from '../../compartido/config/configuracion';
import { NucleoModule } from './nucleo.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(NucleoModule);
  const config = app.get<ConfiguracionProceso>(CONFIGURACION_PROCESO);
  app.setGlobalPrefix(config.prefijoApi);
  app.enableShutdownHooks();
  if (config.entorno !== 'production') {
    const documento = SwaggerModule.createDocument(app,
      new DocumentBuilder().setTitle('Núcleo: Identidad y Alimentos').setVersion('0.1.0').addBearerAuth().build());
    SwaggerModule.setup(`${config.prefijoApi}/docs`, app, documento);
  }
  await app.listen(config.puerto);
  new Logger('Arranque').log(`Núcleo escuchando en http://localhost:${config.puerto}/${config.prefijoApi}; pid=${process.pid}; hilos=${process.env.UV_THREADPOOL_SIZE}`);
}

void bootstrap();
