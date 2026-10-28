import { Module } from '@nestjs/common';
import { ColaModule } from './cola/cola.module';
import { ConfigModule } from './comun/config/config.module';
import { RedisModule } from './comun/redis/redis.module';
import { SaludController } from './salud/salud.controller';

/**
 * Microservicio de Cola virtual (ADR-14): el turno para entrar a comprar.
 *
 * Es el servicio que sostiene el **primer ASR**: en la apertura de venta de un
 * evento muy demandado llegan muchos más compradores de los que Ventas puede
 * atender a la vez. La cola no los rechaza: los ordena, y deja pasar tantos
 * como el aforo concurrente permita.
 *
 * Cumple los criterios 1 y 3 con claridad —su pico es el más agudo del sistema
 * y su estado es una fila que cabe en memoria— y el 4: si la cola se cae, no
 * se vende, pero nada de lo ya vendido se estropea.
 *
 * **No tiene base de datos.** Un turno perdido no es un dato perdido: el
 * comprador vuelve a pedir sitio. A cambio, la fila aguanta el pico sin tocar
 * disco.
 */
@Module({
  imports: [ConfigModule, RedisModule, ColaModule],
  controllers: [SaludController],
})
export class AppModule {}
