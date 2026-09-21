import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const prefijo = process.env.PREFIJO_API ?? 'api/v1';
  app.setGlobalPrefix(prefijo);

  const puerto = Number(process.env.PUERTO ?? 3003);

  await app.listen(puerto);

  console.log(`Servicio de Pedidos ejecutándose en http://localhost:${puerto}/${prefijo}`);
}

bootstrap();