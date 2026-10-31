import { Module } from '@nestjs/common';
import { AccesoModule } from './acceso/acceso.module';
import { RabbitMqModule } from './comun/rabbitmq/rabbitmq.module';
import { RedisModule } from './comun/redis/redis.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { SaludController } from './salud/salud.controller';

/**
 * Microservicio de Acceso QR (ADR-14): CU-002, validar la entrada en la puerta.
 *
 * Salió de `ventas` en la fase A. Cumple tres criterios:
 * su pico es **en otro momento** que el de la venta —la puerta se llena media
 * hora antes de empezar, la venta fue semanas atrás—, su estado cabe en un
 * almacén propio, y su falla tiene que quedar aislada: si no valida, la gente
 * no entra, y eso no puede depender de que la venta esté sana.
 *
 * `Entrada` **no está aquí**: es de Ventas. Este servicio tiene su propia copia
 * de los QR, que le llega por el broker (ADR-15), y registra quién entró. Si
 * Ventas cae, la puerta sigue validando.
 */
@Module({
  imports: [ConfigModule, RedisModule, RabbitMqModule, PersistenciaModule, AccesoModule],
  controllers: [SaludController],
})
export class AppModule {}
