import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // El CORS ya no se maneja aquí: todo el tráfico de clientes entra por el
  // API Gateway (ADR-02, App/gateway/), que lo centraliza — igual que en
  // Administración. Un servicio detrás del gateway no necesita el suyo, y
  // tenerlo además del gateway es una superficie de más para equivocarse.
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HEXACORE · eventos-emergencias')
    .setDescription(
      'CU-018 (Gestionar turno y asistencia del personal): empleados, turnos, ' +
        'solicitudes de cambio de turno y registro de asistencia. ' +
        'Rutas de negocio bajo /api/v1/logistica.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDoc);

  await app.listen(process.env.PORT ?? 3016);
}
await bootstrap();
