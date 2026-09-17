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
      // `whitelist` + `forbidNonWhitelisted`: un cuerpo con campos que el DTO
      // no declara se rechaza en vez de ignorarse. Importa en CU-006 porque
      // impide que un comprador cuele, por ejemplo, un `propietarioId` en la
      // petición e intente una transferencia no autorizada (atributo de
      // Seguridad del CU-006).
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // El cierre ordenado es lo que permite cumplir RNF-15 (0 solicitudes
  // fallidas al desplegar): al recibir SIGTERM, Nest deja de aceptar
  // peticiones nuevas y espera a que terminen las que están en curso —
  // incluido cualquier checkout que tenga un bloqueo Redis vivo.
  app.enableShutdownHooks();

  if (config.entorno !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Entradas y Mercado Secundario')
        .setDescription(
          'CU-006 — Gestión del Mercado Secundario de Entradas. ' +
            'En producción este servicio se consume a través del API Gateway (ADR-02), nunca directo.',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${config.prefijoApi}/docs`, app, documento);
  }

  await app.listen(config.puerto);

  const log = new Logger('Arranque');
  log.log(`Servicio escuchando en http://localhost:${config.puerto}/${config.prefijoApi}`);
  if (config.entorno !== 'production') {
    log.log(`Documentación en http://localhost:${config.puerto}/${config.prefijoApi}/docs`);
  }
  log.log(
    `Reglas de reventa — tope x${config.reventa.topePrecioFactor} · ` +
      `comisión ${config.reventa.comisionPorcentaje}% · ` +
      `bloqueo ${config.reventa.bloqueoTtlSegundos}s`,
  );
}

void bootstrap();
