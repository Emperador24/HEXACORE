import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { ReventaModule } from './reventa/reventa.module';
import { SaludController } from './salud/salud.controller';
import { VentaModule } from './venta/venta.module';

/**
 * Servicio de Entradas y Mercado Secundario (SAD §9).
 *
 * Cubre CU-001 a CU-004 y CU-006, en módulos hermanos sobre la misma base de
 * datos: `VentaModule` (CU-001–004), de Daniel Cristancho, y `ReventaModule`
 * (CU-006, Samuel Emperador). Que sean módulos separados es lo que permite
 * trabajar en paralelo sin pisarse, y es la razón por la que ADR-09 eligió
 * NestJS.
 *
 * La cartelera (CU-005) ya no está aquí: en la fase A de ADR-14 salió al
 * microservicio `catalogo`, que la sirve desde su propia base. Las entidades
 * `EventoReferencia` y `LocalidadEvento` se quedan porque Ventas y Acceso QR
 * las siguen usando — allá viven recortadas a lo que la cartelera lee.
 */
@Module({
  imports: [
    ConfigModule,
    // Motor de los trabajos programados. El único por ahora es la expiración
    // de publicaciones (CU-006D), que vive en ReventaModule.
    ScheduleModule.forRoot(),
    PersistenciaModule,
    VentaModule,
    ReventaModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
