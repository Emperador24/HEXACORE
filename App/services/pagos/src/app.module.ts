import { Module } from '@nestjs/common';
import { ConfigModule } from './comun/config/config.module';
import { RabbitMqModule } from './comun/rabbitmq/rabbitmq.module';
import { RedisModule } from './comun/redis/redis.module';
import { PagosModule } from './pagos/pagos.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { SaludController } from './salud/salud.controller';

/**
 * Microservicio de Pagos (ADR-14): CU-001, 003, 006, 011 y 021.
 *
 * Cumple tres de los cuatro criterios de extracción. El 2 es el más visible:
 * lo usan cinco casos de uso de cinco dominios distintos, y antes de salir su
 * adaptador estaba copiado en dos servicios. El 3, porque su estado cabe en
 * una tabla propia —el libro de idempotencia— y no necesita la base central.
 * Y el 4: es el único que toca la pasarela, así que los datos de pago quedan
 * confinados a un despliegue, y si se cae nadie paga pero el evento sigue.
 */
@Module({
  imports: [ConfigModule, RedisModule, RabbitMqModule, PersistenciaModule, PagosModule],
  controllers: [SaludController],
})
export class AppModule {}
