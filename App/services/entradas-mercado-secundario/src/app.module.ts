import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ComunModule } from './comun/comun.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { SaludController } from './salud/salud.controller';
import { VentaModule } from './venta/venta.module';

/**
 * Servicio de Ventas: la venta primaria de entradas (SAD §9).
 *
 * Cubre CU-001 a CU-004, de Daniel Cristancho. Es también el **dueño de la
 * tabla `entradas`**: quién tiene cada entrada, en qué estado está y con qué
 * QR. Eso lo convierte en la autoridad que los demás servicios consultan, y
 * por eso expone una API interna (`/interno/`) que no sale por el gateway.
 *
 * Lo que fue saliendo en la fase A de ADR-14:
 *
 * - **CU-005**, la cartelera, al microservicio `catalogo`.
 * - **CU-002**, la validación en la puerta, a `acceso-qr`.
 * - **CU-006**, el mercado secundario, a `postventa`.
 *
 * De los tres, el último es el que más cambió este módulo: `ReventaModule`
 * compartía con la venta primaria la conexión a Redis, la de RabbitMQ, el
 * adaptador de pagos y el generador de QR. Al irse, esas piezas pasaron a
 * `ComunModule`, que es donde debían estar desde el principio.
 */
@Module({
  imports: [
    ConfigModule,
    // Motor de los trabajos programados. El que queda aquí es la expiración de
    // reservas sin pagar (CU-001B); el de publicaciones de reventa (CU-006D) se
    // fue con Postventa.
    ScheduleModule.forRoot(),
    ComunModule,
    PersistenciaModule,
    VentaModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
