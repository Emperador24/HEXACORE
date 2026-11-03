import '../../compartido/hilos';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  CONFIGURACION_PROCESO,
  ConfiguracionProceso,
} from '../../compartido/config/configuracion';
import { BoleteriaModule } from './boleteria.module';
process.env.PROGRAMA_BACKEND = 'boleteria';

async function bootstrap() {
  const app = await NestFactory.create(BoleteriaModule);
  const c = app.get<ConfiguracionProceso>(CONFIGURACION_PROCESO);
  app.setGlobalPrefix(c.prefijoApi);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  if (c.entorno !== 'production')
    SwaggerModule.setup(
      `${c.prefijoApi}/docs`,
      app,
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle('Boletería')
          .setVersion('0.1.0')
          .addBearerAuth()
          .build(),
      ),
    );
  await app.listen(c.puerto);
  new Logger('Arranque').log(
    `Boletería escuchando; pid=${process.pid}; puerto=${c.puerto}`,
  );
}
void bootstrap();
