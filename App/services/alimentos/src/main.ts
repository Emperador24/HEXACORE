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
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // RNF-15: al recibir SIGTERM deja de aceptar peticiones nuevas y espera a
  // las que están en curso, incluido un checkout con reserva viva en Redis.
  app.enableShutdownHooks();

  if (config.entorno !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Alimentos')
        .setDescription(
          'CU-011 a CU-015 — pedidos de alimentos y bebidas dentro del recinto. ' +
            'En producción se consume a través del API Gateway (ADR-02), nunca directo.',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${config.prefijoApi}/docs`, app, documento);
  }

  await app.listen(config.puerto);

  const log = new Logger('Arranque');
  log.log(`Alimentos escuchando en http://localhost:${config.puerto}/${config.prefijoApi}`);
}

void bootstrap();
