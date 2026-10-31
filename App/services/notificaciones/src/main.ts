import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CONFIGURACION, ConfiguracionServicio } from './config/configuracion';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfiguracionServicio>(CONFIGURACION);

  app.setGlobalPrefix(config.prefijoApi);

  // RNF-15: al recibir SIGTERM deja de tomar mensajes nuevos y termina los que
  // ya tiene en vuelo. Con `prefetch(1)` eso es, como mucho, un correo.
  app.enableShutdownHooks();

  await app.listen(config.puerto);

  const log = new Logger('Arranque');
  log.log(`Notificaciones escuchando en http://localhost:${config.puerto}/${config.prefijoApi}`);
  log.log(`Proveedor de correo: ${config.correo.urlProveedor}`);
}

void bootstrap();
