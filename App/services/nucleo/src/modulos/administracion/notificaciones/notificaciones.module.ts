import { Module } from '@nestjs/common';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { ConsumidorCorreos } from './consumidor-correos.service';
import { PublicadorCorreos } from './publicador-correos.service';

/**
 * Envío asíncrono de correos (CU-027: *"cola de mensajes para el envío
 * asíncrono de correos de verificación/recuperación"*).
 */
@Module({
  providers: [ConexionRabbitMq, PublicadorCorreos, ConsumidorCorreos],
  exports: [PublicadorCorreos, ConexionRabbitMq],
})
export class NotificacionesModule {}
