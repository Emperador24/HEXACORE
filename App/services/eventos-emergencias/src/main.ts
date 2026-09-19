import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Mismo prefijo que el resto de servicios: es lo que permite que el API
  // Gateway (ADR-02) enrute `/api/v1/logistica/...` hasta aquí sin reescribir.
  app.setGlobalPrefix(process.env.PREFIJO_API ?? 'api/v1');

  // Sin CORS aquí: los navegadores hablan con el API Gateway, que es quien
  // mantiene la lista de orígenes permitidos.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3016);
}
await bootstrap();
