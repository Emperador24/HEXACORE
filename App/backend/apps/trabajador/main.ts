import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TrabajadorModule } from './trabajador.module';
import { CONFIGURACION, ConfiguracionServicio } from '../../modulos/comunicaciones/config/configuracion';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(TrabajadorModule);
  const config = app.get<ConfiguracionServicio>(CONFIGURACION);

  app.setGlobalPrefix(config.prefijoApi);

  // Conserva cancelación/cierre previos. No espera confirmación durable del
  // correo en vuelo: el broker puede reentregarlo tras el cierre.
  app.enableShutdownHooks();

  await app.listen(config.puerto);

  const log = new Logger('Arranque');
  log.log(`Trabajador escuchando en http://localhost:${config.puerto}/${config.prefijoApi}`);
  log.log(`Proveedor de correo: ${config.correo.urlProveedor}`);
}

void bootstrap();
