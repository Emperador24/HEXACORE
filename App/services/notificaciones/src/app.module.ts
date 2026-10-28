import { Module } from '@nestjs/common';
import { RabbitMqModule } from './comun/rabbitmq/rabbitmq.module';
import { ConfigModule } from './config/config.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { SaludController } from './salud/salud.controller';

/**
 * Microservicio de Notificaciones (ADR-14): el transversal que avisa.
 *
 * Cumple tres de los cuatro criterios de extracción: lo usa casi todo el
 * sistema (criterio 2), su carga son ráfagas que escalan por longitud de cola
 * y no por CPU (criterio 1), y aísla un tercero —el proveedor de correo y
 * push— cuya lentitud no puede meterse dentro de una compra ni de un registro
 * (criterio 4).
 *
 * Salió del Núcleo en la fase A de la migración. El publicador se quedó en
 * Autenticación; aquí está solo el consumidor.
 */
@Module({
  imports: [ConfigModule, RabbitMqModule, NotificacionesModule],
  controllers: [SaludController],
})
export class AppModule {}
