import { Module } from '@nestjs/common';
import { ConfigModule } from './comun/config/config.module';
import { RabbitMqModule } from './comun/rabbitmq/rabbitmq.module';
import { RedisModule } from './comun/redis/redis.module';
import { SaludController } from './comun/salud/salud.controller';
import { PedidosModule } from './pedidos.module';

/**
 * Servicio de dominio de Alimentos (ADR-14): CU-011 a CU-015.
 *
 * Salió del Núcleo en la fase A de la migración. Es **servicio de dominio y no
 * microservicio** a propósito: no cumple dos de los cuatro criterios de
 * extracción —su carga es estable y no lo usa otro dominio—, así que corre con
 * dos réplicas fijas por disponibilidad, no por elasticidad.
 *
 * Al dejar de compartir proceso con Administración desapareció la razón de las
 * conexiones nombradas de ADR-12: aquí hay una sola base y una sola conexión,
 * la por defecto.
 */
@Module({
  imports: [ConfigModule, RedisModule, RabbitMqModule, PedidosModule],
  controllers: [SaludController],
})
export class AppModule {}
