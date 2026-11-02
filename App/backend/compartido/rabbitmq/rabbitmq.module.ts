import { Global, Module } from '@nestjs/common';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';

/**
 * La conexión al broker es infraestructura del proceso, no de un dominio:
 * `@Global`, igual que la configuración y Redis. Cada módulo le registra su
 * topología desde su propio `onModuleInit`.
 */
@Global()
@Module({
  providers: [ConexionRabbitMq],
  exports: [ConexionRabbitMq],
})
export class RabbitMqModule {}
