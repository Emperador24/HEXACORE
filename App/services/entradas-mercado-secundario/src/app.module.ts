import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { ReventaModule } from './reventa/reventa.module';
import { SaludController } from './salud/salud.controller';
import { VentaModule } from './venta/venta.module';

/**
 * Servicio de Entradas y Mercado Secundario (SAD §9).
 *
 * Cubre CU-001 a CU-006, en módulos hermanos sobre la misma base de datos:
 * `CatalogoModule` (CU-005) y `VentaModule` (CU-001–004), de Daniel
 * Cristancho, y `ReventaModule` (CU-006, Samuel Emperador). Que sean módulos separados es lo que permite trabajar en
 * paralelo sin pisarse, y es la razón por la que ADR-09 eligió NestJS.
 */
@Module({
  imports: [
    ConfigModule,
    // Motor de los trabajos programados. El único por ahora es la expiración
    // de publicaciones (CU-006D), que vive en ReventaModule.
    ScheduleModule.forRoot(),
    PersistenciaModule,
    CatalogoModule,
    VentaModule,
    ReventaModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
