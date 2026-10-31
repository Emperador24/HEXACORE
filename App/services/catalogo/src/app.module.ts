import { Module } from '@nestjs/common';
import { CarteleraModule } from './cartelera/cartelera.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { SaludController } from './salud/salud.controller';

/**
 * Microservicio de Catálogo (ADR-14): CU-005, consultar la cartelera.
 *
 * Salió de `ventas` en la fase A de la migración. Cumple
 * tres de los cuatro criterios de extracción: su pico de consulta en una
 * apertura de venta es mucho mayor que el del resto, su estado cabe en un
 * almacén propio —hoy PostgreSQL, en la fase D un índice de búsqueda— y su
 * caída no puede llevarse por delante la compra.
 */
@Module({
  imports: [ConfigModule, PersistenciaModule, CarteleraModule],
  controllers: [SaludController],
})
export class AppModule {}
