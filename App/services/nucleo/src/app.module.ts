import { Module } from '@nestjs/common';
import { ConfigModule } from './comun/config/config.module';
import { RabbitMqModule } from './comun/rabbitmq/rabbitmq.module';
import { RedisModule } from './comun/redis/redis.module';
import { SaludController } from './comun/salud/salud.controller';
import { AdministracionModule } from './modulos/administracion/administracion.module';

/**
 * Núcleo — lo que queda del servicio agregado de ADR-12.
 *
 * Alimentos (CU-011..015) salió a su propio servicio de dominio en la fase A
 * de ADR-14, y Notificaciones a su propio microservicio. Aquí queda
 * Administración, que es Autenticación: el siguiente paso es renombrarlo.
 *
 * Módulos:
 *   - Administración — CU-027..032 · base `administracion`
 *   - Personal       — CU-007..009 · sin implementar
 *   - Parqueaderos   — CU-021..025 · sin implementar
 *
 * En `comun/` vive lo que comparten todos: la configuración del proceso, el
 * cliente de Redis, la conexión a RabbitMQ y la sonda de salud. **Un módulo
 * puede usar `comun/`; `comun/` nunca depende de un módulo** — es la frontera
 * que sustituye al límite de proceso que había entre los microservicios, y la
 * verifica por herramienta la tarjeta 20.
 *
 * Los dominios que sí salieron aparte como servicios replicables —Entradas /
 * Mercado Secundario y Eventos / Emergencias— no están aquí: cumplen un
 * criterio de extracción y siguen siendo despliegues independientes.
 */
@Module({
  imports: [ConfigModule, RedisModule, RabbitMqModule, AdministracionModule],
  controllers: [SaludController],
})
export class AppModule {}
