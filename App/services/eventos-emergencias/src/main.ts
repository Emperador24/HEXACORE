import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // la GUI (Flutter web / apps móviles) corre en otro origen.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HEXACORE · eventos-emergencias')
    .setDescription(
      'CU-018 (Gestionar turno y asistencia del personal): empleados, turnos, ' +
        'solicitudes de cambio de turno y registro de asistencia.',
    )
    .setVersion('1.0')
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDoc);

  await app.listen(process.env.PORT ?? 3016);
}
await bootstrap();
