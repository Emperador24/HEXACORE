import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CONFIGURACION, ConfiguracionServicio } from './config/configuracion';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfiguracionServicio>(CONFIGURACION);

  app.setGlobalPrefix(config.prefijoApi);

  app.useGlobalPipes(
    new ValidationPipe({
      // Un filtro que el DTO no declara se rechaza en vez de ignorarse: así un
      // parámetro mal escrito devuelve 400 y no una cartelera sin filtrar.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // RNF-15 (desplegar con 0 solicitudes fallidas): al recibir SIGTERM, Nest
  // deja de aceptar peticiones nuevas y espera a las que están en curso.
  app.enableShutdownHooks();

  if (config.entorno !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Catálogo')
        .setDescription(
          'CU-005 — Consultar evento (cartelera pública). ' +
            'En producción se consume a través del API Gateway (ADR-02), nunca directo.',
        )
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup(`${config.prefijoApi}/docs`, app, documento);
  }

  await app.listen(config.puerto);

  const log = new Logger('Arranque');
  log.log(`Catálogo escuchando en http://localhost:${config.puerto}/${config.prefijoApi}`);
  if (config.entorno !== 'production') {
    log.log(`Documentación en http://localhost:${config.puerto}/${config.prefijoApi}/docs`);
  }
}

void bootstrap();
