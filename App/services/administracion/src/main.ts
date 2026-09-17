// Lo primero: fija el pool de hilos antes de que nada lo use (ver hilos.ts).
import './hilos';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { BaseNoDisponibleFilter } from './comun/base-no-disponible.filter';
import { CONFIGURACION, ConfiguracionServicio } from './config/configuracion';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfiguracionServicio>(CONFIGURACION);

  app.setGlobalPrefix(config.prefijoApi);
  app.useGlobalFilters(new BaseNoDisponibleFilter(app.get(HttpAdapterHost).httpAdapter));

  app.useGlobalPipes(
    new ValidationPipe({
      // `whitelist` + `forbidNonWhitelisted` importan especialmente aquí: sin
      // ellos, un registro podría colar un campo `rol: "Administrador"` o
      // `estado: "activa"` en el cuerpo y saltarse el paso 4 del CU-027, que
      // dice que la cuenta se crea con rol Cliente por defecto.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Un error por campo, no la lista entera de validadores que falló.
      // Sin esto, omitir la contraseña devolvía "La contraseña es obligatoria;
      // La contraseña es obligatoria" —el mismo mensaje dos veces, de dos
      // decoradores distintos—, que además de descuidado contradice el
      // "mensajes de error claros" del CU-027.
      stopAtFirstError: true,
    }),
  );

  // Los portales web llaman desde otro origen (otro puerto en desarrollo). Se
  // nombran uno a uno: con `credentials` —la cookie de renovación— el
  // navegador no acepta `*`. En producción, detrás del API Gateway, todo
  // compartiría origen y esto dejaría de hacer falta.
  if (config.origenesWeb.length > 0) {
    app.enableCors({
      origin: config.origenesWeb,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Hexacore-Cliente'],
      maxAge: 600,
    });
  }

  app.enableShutdownHooks();

  if (config.entorno !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Administración')
        .setDescription(
          'CU-027 — Gestión de Cuentas de Usuario · CU-028 — Roles y Permisos.\n\n' +
            'Es el Auth Service que el CU-027 sitúa detrás del API Gateway (ADR-02): emite los ' +
            'tokens de sesión que el resto de microservicios exigen (RNF-06).',
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
    // Se avisa en claro de que las claves son las del repositorio: un servicio
    // de autenticación arrancando con una clave conocida no debe pasar
    // inadvertido. En producción, directamente no arranca.
    if (config.jwt.deDesarrollo) {
      log.warn('Firmando tokens con las claves DE DESARROLLO del repositorio: no desplegar así');
    }
  }
  log.log(
    `Capacidad — ${process.env.UV_THREADPOOL_SIZE} hilos para scrypt · ` +
      `pool de ${config.postgres.maxConexiones} conexiones a PostgreSQL`,
  );
  log.log(
    `Política de cuentas — contraseña ≥ ${config.seguridad.longitudMinimaContrasena} · ` +
      `acceso ${config.seguridad.sesionMinutos} min · ` +
      `renovación ${config.seguridad.renovacionDias} días sin uso · ` +
      `bloqueo tras ${config.seguridad.intentosAntesDeBloquear} intentos`,
  );
}

void bootstrap();
