import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const prefijo = process.env.PREFIJO_API ?? 'api/v1';
  app.setGlobalPrefix(prefijo);

  // Sin esto Nest no registra un manejador de SIGTERM, y la señal mata el
  // proceso de golpe: `docker stop` no cierra las conexiones a PostgreSQL ni
  // a Redis, y la medición de cobertura de integración sale en cero porque V8
  // solo escribe el informe si el proceso termina ordenadamente.
  app.enableShutdownHooks();

  const puerto = Number(process.env.PUERTO ?? 3003);

  await app.listen(puerto);

  console.log(`Servicio de Pedidos ejecutándose en http://localhost:${puerto}/${prefijo}`);
}

bootstrap();