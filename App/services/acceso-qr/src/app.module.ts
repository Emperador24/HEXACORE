import { Module } from '@nestjs/common';
import { AccesoModule } from './acceso/acceso.module';
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
 * `Entrada` **no está aquí**: es de Ventas. Este servicio pide que gasten un
 * QR y registra quién entró.
 */
@Module({
  imports: [ConfigModule, RedisModule, PersistenciaModule, AccesoModule],
  controllers: [SaludController],
})
export class AppModule {}
