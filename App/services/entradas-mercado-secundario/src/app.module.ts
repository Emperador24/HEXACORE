import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { ReventaModule } from './reventa/reventa.module';
import { SaludController } from './salud/salud.controller';

/**
 * Servicio de Entradas y Mercado Secundario (SAD §9).
 *
 * Cubre CU-001 a CU-006. Este árbol de módulos solo tiene, por ahora, la parte
 * de CU-006 (Gestión del Mercado Secundario, Samuel Emperador); CU-001–005
 * (Daniel Cristancho) se añadirán como módulos hermanos sobre la misma base de
 * datos. Que sean módulos separados es lo que permite trabajar en paralelo sin
 * pisarse, y es la razón por la que ADR-09 eligió NestJS.
 */
@Module({
  imports: [
    ConfigModule,
    // Motor de los trabajos programados. El único por ahora es la expiración
    // de publicaciones (CU-006D), que vive en ReventaModule.
    ScheduleModule.forRoot(),
    PersistenciaModule,
    ReventaModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
