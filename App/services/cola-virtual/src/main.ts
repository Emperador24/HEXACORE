import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CONFIGURACION, ConfiguracionServicio } from './comun/config/configuracion';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfiguracionServicio>(CONFIGURACION);

  app.setGlobalPrefix(config.prefijoApi);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  if (config.entorno !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Cola virtual')
        .setDescription('Turno para entrar a comprar. Apoya CU-001 y sostiene el primer ASR.')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${config.prefijoApi}/docs`, app, documento);
  }

  await app.listen(config.puerto);
  new Logger('Arranque').log(
    `Cola virtual en http://localhost:${config.puerto}/${config.prefijoApi} · ` +
      `aforo concurrente ${config.cola.aforoConcurrente} · turno ${config.cola.turnoTtlSegundos}s`,
  );
}

void bootstrap();
